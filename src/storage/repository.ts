import { migrate } from './migrate'
import {
  RECOVERY_KEY_PREFIX,
  SCHEMA_VERSION,
  STORAGE_KEY,
  emptyDocument,
} from './schema'
import type { LoadOutcome, StoredDocument } from './schema'
import type { IntervalUnit } from '../domain/types'

export { STORAGE_KEY, RECOVERY_KEY_PREFIX }

/** A write was attempted against a revision that is no longer current. */
export class StaleWriteError extends Error {
  constructor(expected: number, got: number) {
    super(`Stale write: storage is at revision ${expected}, this change was made against ${got}`)
    this.name = 'StaleWriteError'
  }
}

/** A write was attempted while the session is read-only. */
export class ReadOnlyError extends Error {
  constructor() {
    super('Storage is read-only: it holds a document written by a newer version of the app')
    this.name = 'ReadOnlyError'
  }
}

/**
 * Set when we find a document from a newer build, and never cleared for the
 * life of the session. An old build overwriting a newer document with a
 * downgraded one is the most destructive thing that can happen here, so the
 * whole session fails closed rather than allowing any write path to slip
 * through.
 */
let readOnly = false

export function isReadOnly(): boolean {
  return readOnly
}

/** Test seam. Not for production use. */
export function resetReadOnlyForTests(): void {
  readOnly = false
}

/**
 * T114 — an interval the domain cannot compute with.
 *
 * This used to be `typeof interval === 'object'` and nothing more, which let
 * through anything with a shape. That is not a cosmetic gap: `addInterval`
 * throws on a count that is not a whole number of at least 1, and its `switch`
 * on `unit` has no `default`, so an unrecognised unit returns `undefined` and
 * the date formatter throws `Not a calendar date: undefined`. Either way the
 * app fails while working out what is due — on load, on the only document
 * there is, with no way back in.
 *
 * The add form already refuses both, so the routes in are a hand-edited
 * document and a future writer. Neither is far-fetched: this is a plain JSON
 * blob in a store any browser lets you open, and it is the only copy of the
 * user's data.
 *
 * **Rejecting is one of the two answers T114 permits, and the task requires
 * exactly one of them.** The other is for the spec to say what a nonsense
 * interval reads as, which would mean inventing an answer to "what does an
 * interval of zero mean" in order to print it. Refusing the document asks
 * nothing of the spec.
 */
function isAComputableInterval(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const interval = value as Record<string, unknown>

  // `Number.isInteger` is what addInterval itself tests, deliberately: two
  // different notions of "a valid count" in two layers is how one of them
  // quietly stops protecting the other. It also rejects NaN and Infinity, and
  // `count: null` — what NaN becomes once JSON.stringify has been over it —
  // fails the typeof before reaching here.
  if (!Number.isInteger(interval['count']) || (interval['count'] as number) < 1) return false

  return INTERVAL_UNITS.includes(interval['unit'] as IntervalUnit)
}

/** The four `addInterval` has a case for. A fifth would be a domain change. */
const INTERVAL_UNITS: readonly IntervalUnit[] = ['day', 'week', 'month', 'year']

function looksLikeADocument(value: unknown): value is StoredDocument {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>

  if (!Array.isArray(doc['items'])) return false

  return doc['items'].every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const it = item as Record<string, unknown>
    return (
      typeof it['id'] === 'string' &&
      typeof it['name'] === 'string' &&
      typeof it['createdAt'] === 'string' &&
      isAComputableInterval(it['interval']) &&
      Array.isArray(it['completions'])
    )
  })
}

function parkCorruptDocument(raw: string): string | null {
  const key = `${RECOVERY_KEY_PREFIX}${Date.now()}`
  try {
    localStorage.setItem(key, raw)
    return key
  } catch {
    // Storage may be full — which is plausible, since a corrupt document and a
    // full quota can share a cause. Better to lose the copy than to crash and
    // leave the app unusable; the original is still under the main key until
    // the next successful save.
    return null
  }
}

export function load(): LoadOutcome {
  const raw = localStorage.getItem(STORAGE_KEY)

  // No key yet. A first run and a wiped storage are indistinguishable — there
  // is no signal that would tell them apart — and both mean an empty schedule.
  if (raw === null) return { kind: 'empty', document: emptyDocument() }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'corrupt', document: emptyDocument(), recoveryKey: parkCorruptDocument(raw) }
  }

  const foundVersion =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['schemaVersion']
      : undefined

  if (typeof foundVersion === 'number' && foundVersion > SCHEMA_VERSION) {
    readOnly = true
    return { kind: 'too-new', document: emptyDocument(), foundVersion }
  }

  if (!looksLikeADocument(parsed)) {
    return { kind: 'corrupt', document: emptyDocument(), recoveryKey: parkCorruptDocument(raw) }
  }

  return { kind: 'loaded', document: migrate(parsed) }
}

/**
 * Replace the stored document, refusing the write if another context has saved
 * since this one loaded.
 *
 * Returns the document as written, with its new revision, so the caller can
 * hold current state without a re-read.
 */
export function save(document: StoredDocument): StoredDocument {
  if (readOnly) throw new ReadOnlyError()

  const raw = localStorage.getItem(STORAGE_KEY)
  let storedRevision = 0
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      storedRevision = typeof parsed['revision'] === 'number' ? parsed['revision'] : 0
    } catch {
      // Unreadable, so there is no revision to conflict with. The caller has
      // already been told it was corrupt by `load`.
      storedRevision = document.revision
    }
  }

  if (storedRevision !== document.revision) {
    throw new StaleWriteError(storedRevision, document.revision)
  }

  const next: StoredDocument = {
    ...document,
    schemaVersion: SCHEMA_VERSION,
    revision: document.revision + 1,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

/**
 * Notifies when another same-origin context changes the schedule.
 *
 * The compare-and-swap in `save` prevents one context destroying another's
 * work, but by itself it converts silent data loss into a visible error — the
 * user is told their save failed for something they did nothing to cause. This
 * closes that gap: the `storage` event fires in *other* contexts when one of
 * them writes, so an open app can reload rather than sit on stale state and
 * then fail its next save.
 *
 * Note the event does not fire in the context that did the writing, so this
 * cannot loop on our own saves.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToExternalChanges(onChange: () => void): () => void {
  const handler = (event: StorageEvent) => {
    // `key === null` means the whole store was cleared, which also concerns us.
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }

  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
