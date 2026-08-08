import { StorageNotice } from './components/StorageNotice'
import { useNavigation } from './navigation'
import { useCurrentDate } from './useCurrentDate'
import './tokens.css'
import './focus.css'
import './app.css'

/**
 * The app shell (T037).
 *
 * Holds the three things every view needs: where we are, what today is, and a
 * surface for notices. The views themselves land here in Phase 3.
 *
 * Layout notes that matter for the installed app:
 *   - `env(safe-area-inset-*)` in app.css keeps content clear of the notch and
 *     the home indicator. Without it, the top of the header sits under the
 *     status bar and the bottom of the list under the home bar.
 *   - The back control is drawn by the app, not borrowed from the browser —
 *     an installed iOS app has no back button and its edge-swipe is
 *     unreliable (T011).
 */
export function App() {
  const nav = useNavigation()
  const today = useCurrentDate()

  return (
    <div className="app">
      <header className="app__header">
        {nav.canGoBack && (
          <button type="button" className="app__back" onClick={nav.back}>
            <span aria-hidden="true">‹</span> Back
          </button>
        )}
        <h1 className="app__title">my flat pal</h1>
      </header>

      {/* Notices sit above the content and below the header, so they are seen
          without covering anything. The corrupted-data and read-only notices
          will join StorageNotice here. */}
      <div className="app__notices">
        <StorageNotice />
      </div>

      <main className="app__main">
        {/* Phase 3 replaces this with the schedule, detail, and form views. */}
        <p className="app__placeholder">
          Nothing here yet — the schedule arrives with User Story 1.
        </p>
        <p className="app__debug">Today is {today}.</p>
      </main>
    </div>
  )
}
