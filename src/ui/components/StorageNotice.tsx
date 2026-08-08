import { useEffect, useState } from 'react'
import { requestPersistence } from '../../storage/persistence'

/**
 * Tells the user, once, if their history might not survive.
 *
 * This is the entire mitigation for a risk the app cannot otherwise address.
 * There is no export and no backup, and the app cannot detect after the fact
 * that data was lost — so a warning up front is the only honest signal
 * available. Since export was deliberately cut, the user is entitled to know
 * what the actual guarantee is.
 *
 * Deliberately silent in every case except an outright refusal: a granted
 * request needs no announcement, and inventing a warning from an absent API
 * would be its own kind of dishonesty.
 */
const DISMISSED_KEY = 'my-flat-pal.storage-notice-dismissed'

export function StorageNotice() {
  const [refused, setRefused] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'yes')

  useEffect(() => {
    let cancelled = false
    void requestPersistence().then((state) => {
      if (!cancelled) setRefused(state === 'refused')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!refused || dismissed) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'yes')
    setDismissed(true)
  }

  return (
    <div role="status" className="storage-notice">
      <p>
        This device hasn’t promised to keep your history safe. It should be fine day to day, but
        if the phone runs short of space your maintenance records could be cleared, and there’s no
        backup to restore from.
      </p>
      <button type="button" onClick={dismiss}>
        Got it
      </button>
    </div>
  )
}
