/**
 * Asking the browser to protect our storage.
 *
 * The app cannot detect data loss after the fact — anything proving the data
 * existed is wiped along with it. So prevention is the whole strategy, and
 * being honest when prevention is unavailable is the whole mitigation.
 *
 * Verification (T010, 2026-08-08) established two things that make this worth
 * doing rather than a token gesture:
 *   - WebKit grants persistence "based on heuristics like whether the website
 *     is opened as a Home Screen Web App", so being installed helps rather
 *     than hinders.
 *   - Home screen web apps are already exempt from ITP's seven-day cap on
 *     script-writable storage, which was the largest single threat here.
 *
 * A grant is therefore likely. What it still does not cover: the user clearing
 * website data, severe system storage pressure, and deleting the app.
 */
export type PersistenceState =
  /** The browser has agreed to protect this origin's storage from eviction. */
  | 'granted'
  /** The browser declined. The user should be told, once, plainly. */
  | 'refused'
  /** No Storage API here — an insecure context, or an older browser. */
  | 'unsupported'

export async function requestPersistence(): Promise<PersistenceState> {
  const storage = navigator.storage as StorageManager | undefined

  if (!storage || typeof storage.persist !== 'function') return 'unsupported'

  try {
    // Already granted? Asking again is pointless, and on browsers that surface
    // a prompt it would be a second interruption for no reason.
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return 'granted'
    }

    return (await storage.persist()) ? 'granted' : 'refused'
  } catch {
    // A throw here means the API exists but will not answer — treat it the
    // same as absent rather than crashing the app on start-up.
    return 'unsupported'
  }
}
