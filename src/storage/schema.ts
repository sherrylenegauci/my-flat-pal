import type { MaintenanceItem } from '../domain/types'

/**
 * The shape of the document saved on the user's device.
 *
 * This is the app's one real contract. There is no export path, so this
 * document is the only copy of the user's history — and a future build has to
 * be able to read what today's build wrote (FR-010).
 */

export const STORAGE_KEY = 'my-flat-pal.schedule'

/** Where a corrupted document is parked before the app starts fresh. */
export const RECOVERY_KEY_PREFIX = 'my-flat-pal.schedule.recovered.'

export const SCHEMA_VERSION = 1

export interface StoredDocument {
  schemaVersion: number
  /**
   * Incremented on every write. The concurrency guard.
   *
   * localStorage is shared by every same-origin context — the installed app
   * and an ordinary browser tab can both be open, which is routine since you
   * open the site in a browser to install it. Each holds the whole document and
   * each save replaces the whole document, so without this a tick-off saved in
   * one is destroyed by the next save from the other. With no export, that loss
   * is total.
   */
  revision: number
  items: MaintenanceItem[]
}

export function emptyDocument(): StoredDocument {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, items: [] }
}

/** What the caller gets back on load, including why it might be degraded. */
export type LoadOutcome =
  | { kind: 'loaded'; document: StoredDocument }
  /** No key yet. A first run and a wiped storage are indistinguishable. */
  | { kind: 'empty'; document: StoredDocument }
  /** Unreadable. The original was preserved under `recoveryKey`. */
  | { kind: 'corrupt'; document: StoredDocument; recoveryKey: string | null }
  /**
   * Written by a newer build than this one. The session must go read-only —
   * parsing half of it and then saving would overwrite the newer document with
   * a downgraded one, the most destructive bug available in this design.
   */
  | { kind: 'too-new'; document: StoredDocument; foundVersion: number }
