import { useEffect, useRef } from 'react'
import { StorageNotice } from './components/StorageNotice'
import { ScheduleView } from './views/ScheduleView'
import { ItemFormView } from './views/ItemFormView'
import { useNavigation } from './navigation'
import { useSchedule } from './useSchedule'
import type { NewItemInput } from './useSchedule'
import './tokens.css'
import './focus.css'
import './app.css'

/**
 * The app shell.
 *
 * Layout notes that matter once installed:
 *   - `env(safe-area-inset-*)` in app.css keeps content clear of the notch and
 *     the home indicator.
 *   - The back control is drawn here, not borrowed from the browser. An
 *     installed iOS app has no back button and its edge-swipe is unreliable
 *     (verified, T011).
 */
export function App() {
  const nav = useNavigation()
  const schedule = useSchedule()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Moving focus after a view change keeps a keyboard or screen-reader user
  // oriented. Without it focus falls to <body> and they are silently returned
  // to the top of the document with no idea anything happened.
  useEffect(() => {
    headingRef.current?.focus()
  }, [nav.view.name])

  function handleSave(input: NewItemInput) {
    schedule.addItem(input)
    nav.back()
  }

  return (
    <div className="app">
      <header className="app__header">
        {nav.canGoBack && (
          <button type="button" className="app__back" onClick={nav.back}>
            <span aria-hidden="true">‹</span> Back
          </button>
        )}
        <h1 className="app__title" ref={headingRef} tabIndex={-1}>
          my flat pal
        </h1>
      </header>

      <div className="app__notices">
        <StorageNotice />
        {schedule.readOnly && (
          <div role="alert" className="storage-notice">
            <p>
              This app is showing an older version than the one that saved your data. Nothing can
              be changed until it updates, so your records stay safe.
            </p>
          </div>
        )}
        {schedule.loadKind === 'corrupt' && (
          <div role="alert" className="storage-notice">
            <p>
              Some saved data couldn’t be read, so the schedule is starting empty. The original
              was kept in case it can be recovered.
            </p>
          </div>
        )}
      </div>

      <main className="app__main">
        {nav.view.name === 'new' ? (
          <ItemFormView today={schedule.today} onSave={handleSave} onCancel={nav.back} />
        ) : (
          <ScheduleView views={schedule.views} onAdd={() => nav.go({ name: 'new' })} />
        )}
      </main>
    </div>
  )
}
