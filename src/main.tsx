import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './ui/App'

/**
 * Entry point, and service worker registration (T039).
 */
const root = document.getElementById('root')
if (!root) throw new Error('No #root element to mount into')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * The update flow.
 *
 * The constitution requires that a stale worker must not strand an installed
 * user on an old bundle, and that an update must not discard work in progress.
 * Those pull in opposite directions, so this asks rather than deciding:
 * `registerType: 'prompt'` means the new version waits, and the user takes it
 * when they are ready. Auto-updating would satisfy the first requirement and
 * violate the second, by reloading mid-edit.
 *
 * Not yet wired to the shell's notice surface — that is part of the polish
 * phase (T075), which also verifies the whole update path on a real device.
 */
const updateSW = registerSW({
  onNeedRefresh() {
    // Deliberately a plain confirm for now. It is honest about the state and
    // it blocks nothing; a styled prompt in the notice surface replaces it.
    const accepted = window.confirm(
      'A new version of my flat pal is ready. Reload to use it? Anything you are part-way through will be kept.',
    )
    if (accepted) void updateSW(true)
  },
  onOfflineReady() {
    // The app shell is cached, so a home-screen launch with no network shows
    // the app rather than a browser error page. Nothing to say to the user.
  },
})
