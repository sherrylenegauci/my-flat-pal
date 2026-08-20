/**
 * Photograph the mark, for a person to choose from.
 *
 *   node scripts/screenshot-mark.mjs <output-dir> [base-url]
 *
 * A candidate mark is not settled by a test. The typeface was chosen the same
 * way — three branches built complete, screenshots at 375px, and the person the
 * app is for picked one from what she could see. This is that, for the mark.
 *
 * Two shots, because a mark has two jobs and they disagree about size:
 *
 *   - **The header at 375px**, from the running app rather than a mock-up, so
 *     the mark is judged next to the real wordmark in the real typeface at the
 *     width Principle II designs for.
 *   - **The icons at home-screen size**, from the real generated PNGs rather
 *     than from the SVG they came from. A mark that resolves at 512 can turn to
 *     mud at 48, and rasterising is where that happens, so the sheet has to show
 *     the file that ships.
 *
 * The maskable icon is shown twice, cropped to a circle and to a squircle,
 * because Android picks the shape and the app does not get a say.
 *
 * Needs a dev server already running. Start one on a port of your own —
 * Sherrylene may well have `npm run dev` open on 5173 looking at the app.
 *
 * ## The contact sheet's own chrome carries colour literals, on purpose
 *
 * Principle V says a *feature* must not define a colour outside `tokens.css`.
 * The sheet below is not a feature; it is a darkroom, and its greys exist to
 * stand in for a home-screen wallpaper and a caption — things the app does not
 * have tokens for and should not grow them for. Judging the mark against the
 * app's own palette would also be the wrong test: an icon has to hold up
 * against whatever wallpaper someone happens to use.
 *
 * The one colour that *is* read from the tokens is the page behind it,
 * `--surface-sunken`, because that is the app's own surface and the header shot
 * sits on it. Said here because "no colour was introduced" is a claim this
 * change makes elsewhere, and it is true of the app and not of this file.
 */

import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const outDir = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://localhost:5173'
if (outDir === undefined) {
  throw new Error('Usage: node scripts/screenshot-mark.mjs <output-dir> [base-url]')
}
mkdirSync(outDir, { recursive: true })

const { readToken } = await import(join(here, 'mark-svg.ts'))
const tokens = join(root, 'src/ui/tokens.css')
const sunken = readToken(tokens, '--surface-sunken')

/**
 * The same seed the browser tier uses, inlined rather than imported.
 *
 * `e2e/support/app.ts` is written against Playwright's test fixtures and pulls
 * in `expect`; this is a script, not a test. Copying four job names is cheaper
 * than making that module serve two callers, and if they drift the screenshot
 * simply shows different job names — nothing here asserts anything.
 */
const SEED = {
  schemaVersion: 1,
  revision: 1,
  items: [
    {
      id: 'seed-overdue',
      name: 'Bleed the radiators',
      interval: { count: 6, unit: 'month' },
      createdAt: '2025-01-04',
      completions: [
        { id: 'c1', completedOn: '2025-06-01', recordedAt: '2025-06-01T09:00:00.000Z' },
      ],
    },
    {
      id: 'seed-due',
      name: 'Test the smoke alarms',
      interval: { count: 1, unit: 'month' },
      createdAt: '2025-02-10',
      completions: [
        { id: 'c2', completedOn: '2026-05-15', recordedAt: '2026-05-15T09:00:00.000Z' },
      ],
    },
    {
      id: 'seed-never',
      name: 'Service the boiler',
      interval: { count: 1, unit: 'year' },
      createdAt: '2025-03-01',
      completions: [],
    },
    {
      id: 'seed-not-due',
      name: 'Change the water filter',
      interval: { count: 1, unit: 'year' },
      createdAt: '2025-04-01',
      completions: [
        { id: 'c3', completedOn: '2026-05-01', recordedAt: '2026-05-01T09:00:00.000Z' },
      ],
    },
  ],
}

const browser = await chromium.launch()

// ---- The header, in the running app, at 375px --------------------------------
{
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  })
  await page.addInitScript(
    ([raw]) => {
      window.localStorage.clear()
      // `STORAGE_KEY` from src/storage/schema.ts. Inlined for the same reason
      // the seed is: this is a script and that module is TypeScript imported by
      // the app. If it ever drifts the app boots empty and the screenshot shows
      // the empty state, which is loud rather than silent.
      window.localStorage.setItem('my-flat-pal.schedule', raw)
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          persist: () => Promise.resolve(true),
          persisted: () => Promise.resolve(true),
          estimate: () => Promise.resolve({ quota: 0, usage: 0 }),
        },
      })
    },
    [JSON.stringify(SEED)],
  )
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'))
  await page.goto(baseUrl)
  await page.getByRole('heading', { name: 'my flat pal', level: 1 }).waitFor()

  writeFileSync(join(outDir, 'app-375.png'), await page.screenshot())

  const header = page.locator('.app__header')
  writeFileSync(join(outDir, 'header-375.png'), await header.screenshot())
  await page.close()
}

// ---- The icons, at the sizes a home screen actually draws them ---------------
{
  const asDataUri = (name) =>
    `data:image/png;base64,${readFileSync(join(root, 'public/icons', name)).toString('base64')}`

  const small = asDataUri('icon-192.png')
  const large = asDataUri('icon-512.png')
  const maskable = asDataUri('icon-512-maskable.png')

  const homeScreen = [48, 60, 76, 120]
    .map(
      (size) => `<figure class="app" style="--s:${size}px">
        <img src="${small}" alt="" width="${size}" height="${size}">
        <figcaption>Flat Pal<br><small>${size}px</small></figcaption>
      </figure>`,
    )
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; padding:28px; background:${sunken};
      font-family: system-ui, -apple-system, sans-serif; color:#0e141b; }
    h2 { font-size:14px; font-weight:600; color:#4a5563; margin:0 0 12px; }
    section { margin-bottom:30px; }
    .home { display:flex; align-items:flex-end; gap:26px; padding:20px 24px;
      background:#7c8797; border-radius:14px; width:max-content; }
    .app { margin:0; display:flex; flex-direction:column; align-items:center; gap:7px; }
    .app img { border-radius: calc(var(--s) * 0.225); display:block; }
    .app figcaption { font-size:10px; color:#fff; text-align:center; line-height:1.35; }
    .app small { opacity:.75; }
    .big { display:flex; gap:24px; align-items:flex-start; }
    .big figure { margin:0; }
    .big figcaption { font-size:11px; color:#4a5563; margin-top:8px; }
    .big img { display:block; width:180px; height:180px; }
    .circle { border-radius:50%; overflow:hidden; width:180px; height:180px; }
    .squircle { border-radius:50px; overflow:hidden; width:180px; height:180px; }
    .teardrop { border-radius:50% 50% 50% 12px; overflow:hidden; width:180px; height:180px; }
  </style></head><body>
    <section>
      <h2>On a home screen — icon-192.png, at the sizes iOS and Android draw it</h2>
      <div class="home">${homeScreen}</div>
    </section>
    <section>
      <h2>icon-512.png, and icon-512-maskable.png under the crops Android chooses</h2>
      <div class="big">
        <figure><img src="${large}"><figcaption>icon-512.png</figcaption></figure>
        <figure><div class="circle"><img src="${maskable}"></div>
          <figcaption>maskable, circle</figcaption></figure>
        <figure><div class="squircle"><img src="${maskable}"></div>
          <figcaption>maskable, squircle</figcaption></figure>
        <figure><div class="teardrop"><img src="${maskable}"></div>
          <figcaption>maskable, teardrop</figcaption></figure>
      </div>
    </section>
  </body></html>`

  const page = await browser.newPage({ viewport: { width: 940, height: 700 }, deviceScaleFactor: 2 })
  await page.setContent(html)
  writeFileSync(join(outDir, 'icons.png'), await page.screenshot({ fullPage: true }))
  await page.close()
}

await browser.close()
console.log(`wrote app-375.png, header-375.png and icons.png to ${outDir}`)
