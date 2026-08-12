# Implementation Plan: Maintenance Schedule

**Branch**: `feat/001-maintenance-schedule` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

---

## What this document is

`spec.md` says **what the app does** — read that one first, it's written for you.

This one says **how we're going to build it**, and holds every technical decision, the data shapes,
the storage rules, and how to check the result. It used to be five separate files; they're all
folded in here now.

`tasks.md` is the **work list** — 84 numbered steps in the order they get done.

Those three files are the whole project. The short version of this one:

- **React and Vite, in TypeScript.** A website that installs to your home screen. No server anywhere.
- **Your data sits in the browser's local storage** as one lump of JSON. Plenty for a few dozen jobs.
- **Very few outside libraries.** No routing library, no state library, no date library — each
  skipped on purpose, reasons in [Decisions](#decisions).
- **The date logic is kept away from anything on screen**, so it can be tested properly. It's the
  part most likely to be wrong.
- **Two checks aren't passed yet and the scorecard says so.** They need a real phone. An earlier
  version of this document claimed they'd passed, which wasn't true.

---

## Summary

Build the first feature of my-flat-pal: a recurring maintenance schedule that records what the flat
needs, shows what's overdue, and reschedules when you tick something off. It's also the app's
foundation — it establishes the shell, the storage layer, the install plumbing, and the test setup
that every later feature inherits.

The approach is deliberately small. Scheduling is a handful of pure functions over dates with no
framework involved, which makes the test-first rule cheap to honour and keeps the logic readable.
Everything else sits on top of that.

## Technical Context

**Language**: TypeScript 5.x, targeting ES2022

**Dependencies**: React 19, Vite 6, `vite-plugin-pwa`. Only React and React DOM reach the user's
device; everything else is build- or test-time. Full list in [Decisions](#dependency-budget).

**Storage**: `localStorage`, one versioned JSON document. See [Storage contract](#storage-contract).

**Testing**: Vitest + React Testing Library + jsdom for automated tests; a manual phone checklist for
the installed-app criteria nothing headless can verify.

**Target**: Installed PWA. Mobile Safari on iOS and Chrome on Android, at 375px. Desktop scales up
but isn't the design target.

**Performance**: The targets are user-facing — first job recorded within 60 seconds (SC-001),
overdue status legible within 5 seconds of opening (SC-002). The binding constraint is start-up
time on a phone, since SC-002 is measured from tapping the icon.

**Constraints**: No server. No secrets. Data device-bound with no export. Keyboard-operable at
375px, 44x44px touch targets, WCAG 2.1 AA contrast. Must work launched from the home screen.

**Scale**: One person, one device. Realistically tens of jobs and hundreds of tick-offs over years —
kilobytes, not megabytes. That number is why several decisions below land on the simpler option.

---

## Constitution Check

Gates derived from the project constitution (`.specify/memory/constitution.md`, v1.2.2).

**Status vocabulary.** A gate whose test is "someone verified this" can't be marked PASS by a plan —
no code exists yet. Those are **PLANNED**, naming the task that will settle them. An earlier version
marked them PASS, including gate 2b, whose text literally reads "verified on a real device".

| # | Gate | Principle | Status |
|---|------|-----------|--------|
| 1 | Dependencies justified; nothing used at fewer than three call sites; no abstraction without a second use case; **violations recorded** | I. Simplicity | **PASS WITH RECORDED VIOLATIONS** — 11 packages (not 8; the earlier count grouped them into rows and couldn't be audited per-package). Four violations recorded below, which is what the principle asks for. |
| 2 | 375px first; 44x44px targets; semantic HTML; **operable without touch**; visible focus; AA contrast | II. Accessibility | **PLANNED — discharged by T078, not by the suite.** Constitution v1.4.0 makes VoiceOver on a real iPhone the check that satisfies this gate; automated keyboard traversal is supporting evidence and never sufficient alone, since it only ever runs on Chromium (Safari does not Tab to buttons unless the user enables it). T070–T074 are complete and automated in `e2e/` — axe, 375px overflow, 44x44, focus visibility, and per-view contrast from browser-resolved colours on both engines. **They do not close this gate.** Treating a green suite as accessibility sign-off is precisely what this row previously invited. |
| 2b | Works installed; standalone navigation; safe areas; **verified on a real device** | II + PWA constraints | **PLANNED** — T078. The iOS back affordance is an open question (T011); the original research argued only from Android. |
| 3 | Tests precede implementation; each story has a test covering its scenarios | III. Test-First | **PASS** — every implementation task is preceded by a failing-test task. The previous justification argued that pure functions are *testable*, which isn't the same as covered; six behaviours had no test at all and now do. |
| 4 | Static-deployable React/Vite SPA; external services behind one interface | Technology Constraints | **PASS** — no external service here. Vite confirmed over Next.js (R1). |
| 5 | No secrets in the bundle | Technology Constraints | **PASS** — this feature has no credentials. |
| 6 | *(decor suggestions only)* | LLM constraints | **N/A** — doesn't touch suggestions. `TODO(LLM_KEY_CUSTODY)` stays open and unblocked. |

### Recorded violations

Four, recorded as violations. An earlier version listed three under "No violations… recorded for
visibility rather than as violations". Principle I has no such category — a SHOULD you override is a
violation with a justification, and the relabelling is what let gate 1 read PASS.

| Violation | Why | Why not the simpler thing |
|---|---|---|
| `vite-plugin-pwa` — 1 call site | Generates the service-worker precache list over Vite's hashed filenames, and the update flow | A hand-written worker still needs that generated list, so "no dependency" means writing a build plugin instead |
| `jsdom` — 1 call site | Test environment for DOM tests | A real browser for the whole suite is slower and heavier for the majority of tests, which are pure logic |
| `@vitejs/plugin-react` — 1 call site, **and was missing from this table entirely** | JSX transform and fast refresh | No way to run React through Vite without it. Its earlier justification — "recorded in the constitution" — was false; the constitution records React and Vite, not this plugin |
| `src/storage/migrate.ts` — **an abstraction with no second use case** | Retrofitting migrations later means writing the first one against documents already on people's phones, unrecoverable with no export | Nothing. A deliberate override, justified by the asymmetry of the risk — and exactly the future-facing reasoning Principle I exists to reject, so it belongs here rather than dressed up as compliance |

`@testing-library/react`, `user-event` and `axe-core` pass the three-call-site test. `react`,
`react-dom`, `typescript`, `vite`, `vitest` are the constitution's own mandated stack.

**Also open, not resolved**: `repository.ts` is justified partly by a hypothetical second storage
backend, and the application *state* model (as opposed to persistence) is specified nowhere, though
Technology Constraints requires it before implementation.

---

## Decisions

Six technical questions settled before building. If you ever wonder "why did we do it that way",
it's here.

| # | Question | Answer |
|---|---|---|
| R1 | Vite or Next.js? | **Vite** |
| R2 | Where does the data go? | **localStorage**, one JSON document |
| R3 | Can the app tell if data got wiped? | **No — and it says so** |
| R4 | Routing library? | **No** |
| R5 | Date library? | **No** |
| R6 | How is accessibility checked? | Automated for structure; **contrast can't be, and needs a real browser** |

### R1 — Vite, not Next.js

Next.js's main draws are server rendering, server components and API routes. Here they aren't merely
unused, they're **forbidden** by the no-server rule. Adopting a framework whose value proposition is
unavailable, then configuring it off, is the opposite of Principle I. Vite also ships a smaller
bundle, which matters directly for SC-002.

*This closed `TODO(BUILD_TOOL_CONFIRMATION)`.*

### R2 — localStorage, one document

Scale settles it: tens of jobs and hundreds of tick-offs over years is kilobytes. IndexedDB's whole
value is handling volumes and query patterns this feature doesn't have. One document also makes the
round trip trivial to test and migrations a single function.

localStorage being synchronous is a real drawback, but at this size the read is sub-millisecond and
happens once at start-up.

*Revisit if the app grows multiple properties, attachments, or history that won't sit in memory.*

### R3 — The app cannot detect data loss

Worth reading properly, because it's the most honest thing in this document.

Anything that would prove your data once existed lives in the same storage that gets wiped. After a
wipe the app is, by construction, indistinguishable from a fresh install. **There is no signal to
read.** So the app doesn't claim to detect loss.

What it does instead is prevention: ask the browser to protect the app's storage
(`navigator.storage.persist()`), and **if the browser says no, tell you plainly** — once — that your
history might not survive. Since export was cut, you're entitled to know the real guarantee.

**✅ Verified 2026-08-08 (T010).** The answer is better than feared, and it changes the risk
materially.

| Question | Answer |
|---|---|
| Does `navigator.storage.persist()` exist? | Yes — Baseline widely available across browsers since December 2021. HTTPS only (localhost counts). |
| Will Safari grant it to us? | Likely. WebKit "currently grants a request based on heuristics **like whether the website is opened as a Home Screen Web App**" — being installed is explicitly one of the things that earns a grant. |
| Does WebKit's 7-day storage cap apply to us? | **No.** "The first-party domain of home screen web applications is exempt from ITP's 7-day cap on all script-writeable storage, i.e. ITP always skips that domain in its website data removal algorithm." |
| Does a grant protect `localStorage` specifically? | Yes. Persistent mode covers script-writable storage, and "origins with active pages or persistent-mode storage are protected from eviction". |
| Do we get a decent quota? | Yes. A home-screen app "has the same origin quota and overall quota as when it is opened in a browser app" — full browser-level allocation, not the reduced one other apps get. |

**What this does not protect against**, and what the user still needs telling about:

- **The user clearing website data.** That is an explicit user action and no API prevents it.
- **Severe system storage pressure.** Persistent mode resists least-recently-used eviction, but the
  overall-quota and storage-pressure paths still exist.
- **Deleting the app.**

So the honest position stands: the app requests persistence, and reports plainly if refused. What
changes is the expected outcome — a grant is likely rather than doubtful, and the 7-day cap, which
was the single largest worry, does not apply to an installed app at all.

One claim seen in secondary sources — that the permission "has to be requested every time the app
is opened" — is **not** in WebKit's or MDN's documentation and is treated as unverified. Calling
`persisted()` on start-up and only requesting when it returns false costs nothing and is correct
either way.

Sources: [WebKit — Tracking Prevention](https://webkit.org/tracking-prevention/),
[WebKit — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/),
[MDN — StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

### R4 — No router

Three screens don't justify a routing library, and nobody deep-links into a personal app. But *some*
history integration is genuinely needed, and it's a platform fact rather than a preference:
**Android's back gesture is live in an installed app.** With no history entries, that gesture closes
the app — so opening a job's detail and swiping back would eject you. About thirty lines against
React state handles it.

**✅ Verified 2026-08-08 (T011). The gap is real: the app needs its own back control.**

iOS standalone is a genuinely different situation from Android:

- **iOS has no system back button at all** — it is a gesture-based OS, and going back is either a
  swipe or a control the app itself draws.
- **Whether the edge-swipe works in a standalone web app is inconsistent.** Reports go both ways
  across iOS versions and framework bug trackers, including cases where an app's own swipe handling
  and the platform's fire together and navigate back twice. It is not a thing to build on.
- The widely-recommended answer is the obvious one: **draw a back control in the app.** Without one,
  a user who opens a job's detail can be stranded with no way out but to kill the app.

**Decision**: every view below the schedule list gets a visible in-app back control. The History API
integration from this section stays — it is what makes Android's back gesture do the right thing
rather than closing the app — but it is no longer the *only* way back, and iOS is not left depending
on a gesture that may not fire.

This also satisfies Principle II more squarely than the original design did: "navigation MUST NOT
depend on the browser's back button" is easier to honour when the app has its own.

Sources: [Ionic — iOS PWA swipe back broken](https://github.com/ionic-team/ionic-framework/issues/29733),
[Discourse Meta — Back button in iOS PWA](https://meta.discourse.org/t/back-button-in-ios-pwa/93909)

*Revisit the router when a second feature adds screens.*

### R5 — No date library

One non-trivial operation: add N days/weeks/months/years, handling months that are shorter than the
source day. Roughly forty lines and a table of tests.

**Rule adopted**: 31 March + 1 month is **30 April**, not 1 May. Clamping keeps a job near its
intended day; overflowing drifts it forward every short month.

⚠️ **A claim in the original research was wrong** and is corrected here: it said this design is
"clear of timezone arithmetic entirely". It isn't. JavaScript's `Date` has no calendar-date type —
`new Date("2026-08-08")` is UTC midnight, `new Date(2026, 7, 8)` is local midnight, and converting
between them shifts the day for anyone west of UTC. Day and week arithmetic across daylight-saving
boundaries is also unspecified. This was the specific bug the rejected date library would have
prevented.

**✅ Settled in implementation 2026-08-08.** `src/domain/interval.ts` works on the date parts of a
`YYYY-MM-DD` string and never converts through a local-midnight `Date`. Where it does use `Date` it
uses the UTC constructors, which have no daylight saving. `CalendarDate` is a distinct type from
`Timestamp` in `src/domain/types.ts`, so the calendar-date/instant distinction the original claim
glossed over is now visible in the type system. `tests/domain/interval.test.ts` pins both UK
changeover dates, and comparison is plain string comparison, which is correct for this format and
involves no timezone at all.

### R6 — Accessibility checking, and its limits

- **Automatable**: roles, names, labelling, focus order, ARIA misuse. `axe-core` catches these and
  they're the bulk of real defects.
- **Not automatable in jsdom — contrast.** jsdom computes no layout and resolves no colour, so an
  automated contrast assertion there is theatre. Contrast is guaranteed at source (a small set of
  audited colour tokens) **and measured per view in a real browser** (T074). A token-pair audit
  alone doesn't establish per-view contrast, because which pairs actually co-occur is a view-level
  fact.
- **Not automatable at all**: the installed-app criteria. Safe areas, standalone window, back
  gesture — these need a phone (T078).

### Dependency budget

11 packages, of which 2 reach the user's device.

| Package | Kind | Why |
|---|---|---|
| `react`, `react-dom` | Runtime | The constitution's stack. The only code on your phone. |
| `typescript`, `vite`, `@vitejs/plugin-react` | Build | The constitution's stack (R1 confirms Vite). |
| `vite-plugin-pwa` | Build | Manifest, precache, update flow. *Recorded violation.* |
| `vitest` | Test | Shares Vite's config, so it's a runner rather than a second toolchain. |
| `@testing-library/react`, `user-event` | Test | Principle III requires asserting behaviour through the interface a user actually uses. |
| `jsdom` | Test | DOM environment. *Recorded violation.* |
| `axe-core` | Test | Automated structural accessibility checks. |
| `@playwright/test` | Test | Real-browser tier. Justified below. |

**On adding Playwright.** The constitution permits automated browser tests but does not mandate
them, and asks that the trigger be the manual checklist growing long enough that people skip it.
That has happened: Phase 6 carries **nine** manual verification tasks (T070–T078), and a
nine-item checklist run by hand before every release is one that gets run properly once.

It earns its place by checking things no other tier *can*. jsdom computes no layout and resolves
no cascaded colour, which is why the constitution forbids writing a contrast assertion there — it
would pass regardless of the real colours. A real browser resolves both. Concretely, Playwright
can take over T070 (axe per view, against real rendering), T071 (375px overflow and 44×44 hit
targets, which need layout), T072 (colour independence), T073 (focus visibility, which needs
computed style) and T074 (contrast per view). That is five of the nine, and they are the five
most tedious to repeat.

It does **not** absorb the rest, and the checklist does not go away. T075's service-worker
update path is testable in principle but genuinely fiddly; T076 and T077 are timings that need a
named device rather than a CI runner; T078 is the real-iPhone-and-Android gate, and no headless
browser can verify a home-screen install. Those stay manual, and Phase 6 should say so plainly
rather than let a green suite imply cover it does not give.

**Rejected**: a router (R4), a state library (React's own state suffices at three screens; Principle
I forbids the abstraction before a second use case), a date library (R5), a component library (the
UI is a list, a form and a dialog — and an imported library would need auditing against Principle II
anyway, which is more work than writing three accessible components).

---

## Data model

### What gets stored

Two things: **jobs**, and **tick-offs**. A job owns its list of tick-offs.

**Maintenance Item**

| Field | Rules |
|---|---|
| `id` | Stable, unique, never reused |
| `name` | Required, non-empty after trimming. **Not unique** — two "filter change" jobs is fine |
| `interval` | Required. `count` (≥ 1) and `unit` (day/week/month/year) |
| `completions` | **Order not guaranteed** — `completeItem` appends, so storage is in the order entries were made. Empty means never done. Anything needing an order sorts explicitly: `completionsNewestFirst` sorts by `completedOn` (the day the work happened), with `recordedAt` as tie-break |
| `createdAt` | For stable ordering; not shown |

**Completion**: `id`, `completedOn` (a calendar date, no time), `recordedAt` (a real timestamp —
when you typed it, as distinct from when the work happened). Immutable once saved, except by undo.

### What is never stored

**Due dates and statuses are worked out fresh every time, never saved.**

This is the load-bearing decision. A saved status would quietly become wrong the moment the date
changed while your phone sat in your pocket — and FR-005 requires status to re-evaluate without a
reload. Deriving it on read makes that true by construction rather than by remembering to clear a
cache.

### Status

| Status | When | Shown as |
|---|---|---|
| `never-done` | No tick-offs yet | Needs attention. No due date |
| `overdue` | Due date has passed | Needs attention, longest overdue first |
| `due` | Due today | Needs attention |
| `not-due` | Due later | Soonest first |

**One job has exactly one status.** An annual job untouched for three years is `overdue`, not three
piled-up occurrences — that falls out of counting from the last tick-off rather than generating a
series, so missed occurrences can't accumulate.

> **✅ Resolved 2026-08-08 (T017).** `spec.md` FR-004 said "items needing attention" without
> enumerating which statuses those were, so a `due` job could sort anywhere and every test would
> still pass. **Decision: attention is `overdue`, `due`, `never-done`** — a job due today is one to
> do today. Recorded as `ATTENTION_STATUSES` in `src/domain/types.ts` and pinned by
> `tests/domain/ordering.test.ts`, which also fixes the secondary order within the group: longest
> overdue first, then due, then never-done by when it was added.

### Next due date

`nextDueOn = addInterval(lastCompletedOn, interval)` — counted from **when you actually did it**,
never from the date you missed.

- Ticking something off **today** can never leave it immediately due again.
- A **backdated** tick-off can, and should. Recording that the boiler was serviced two years ago on
  an annual interval yields an overdue job. That's the truth, not a bug.
- Original timing drifts later with each late tick-off. Accepted.

Month and year arithmetic **clamps** to the last valid day when the target month is shorter.

### Ticking off, and undo

Ticking off appends a completion and recomputes. Backdating is allowed — recording a service you
forgot is normal — but future dates are rejected.

**Undo removes the most recently *recorded* tick-off** (highest `recordedAt`), not the latest
`completedOn`. That's what makes it correct when you backdate something by mistake: the entry you
just made is the one that disappears.

**Undo is a short window on the completion just recorded.** Ticking off costs a single tap with no
confirmation — SC-004 caps it at two, and the built control uses one — so a stray tap can push an
annual service a year out. Undo exists for that, and nothing else.

**The offer was originally *derived* rather than stored**, reading `recordedAt` off the newest
completion instead of remembering that an offer had been made. This paragraph used to call that
"genuinely good — reopening the app reconstructs the state exactly, with no session, no timer, and
no marker that can drift out of step with the data", eighteen lines above the paragraph explaining
why it was insufficient. The praise is kept here as the record of what was believed and struck
through as what is no longer true: the design now has a session, a timer and a marker, all three
added deliberately, and the property being praised — reconstructing the offer exactly on reopen —
is the property that had to go. Deriving the offer from the document is what a *purely* derived
design cannot stop being, and it is not something the two rules below can tolerate.

Derived-with-nothing-to-expire-it was a data-loss defect. A probe on a freshly opened app,
against a document the app had never written, deleted completions dated 2020, 2022 and 2024 in
three presses, with no confirmation at any point. The offer was also the first focusable thing on
the page, so Tab-then-Enter destroyed history.

The fix has two parts, and the second is not a refinement of the first — it is doing work the first
cannot do at all.

**The bound.** The offer stands only while the completion it names is within roughly ten seconds of
now, measured against that completion's `recordedAt` versus the current time — **not** against when
the component mounted, or reopening the app would restart the clock and resurrect an expired offer.
The window is checked when Undo is *pressed* as well as when the app renders, because a phone
suspends backgrounded pages and throttles timers, so a `setTimeout` that was going to hide the offer
cannot be relied on to have fired.

**The session scope.** Undo is offered only for a completion *this session recorded*, and never on a
freshly opened app. This is not something the bound could deliver, and an earlier revision of this
paragraph wrongly presented it as a consequence of the bound. Two cases prove otherwise, both
confirmed by probe. Storage cannot distinguish adding a job with a last-done date from adding a job
and then ticking it off — both leave an item created today holding one completion recorded seconds
ago — so nothing reading the document can satisfy FR-007b. And ticking off two jobs inside ten
seconds, then undoing one, leaves the other newest and still inside the window, so the offer returns
and a second press walks backwards.

**Why session-scoping is acceptable now, having been rejected before.** It was removed from the
original design because it made a mis-tap permanent once the phone backgrounded, and at that time
nothing else could recover it. The detail view now shows full history, so an older mistake has a
home. The property that made session-scoping wrong no longer holds — it is safe *because* that view
exists, and would not have been before it.

Correcting an older mistake therefore happens in the item's history. And adding a job with a
last-done date raises no offer at all: the user added a job rather than completing one, and undo
there would strip the date while leaving the job, silently turning something just created into
"never done".

See FR-007, FR-007a and FR-007b, and T094–T099 plus T102.

An earlier revision of this paragraph said undo was "most recent only, one step, no stack". That
was true of each individual press and false of the sequence, and it is the sentence that let the
defect look like the design.

Deleting a job needs confirmation, because it throws away the history too.

### States

```text
   create without a date        ┌──────────────┐
   ────────────────────────────▶│  never-done  │
                                └──────┬───────┘
                                       │ tick off
                                       ▼
   ┌──────────┐  date passes  ┌──────┐  date passes  ┌─────────┐
   │ not-due  │──────────────▶│ due  │──────────────▶│ overdue │
   └──────────┘               └──────┘               └─────────┘
        ▲                         │                       │
        └─────────────────────────┴───────────────────────┘
                          tick off

   Undo reverses the most recent move, restoring the exact prior state —
   including back into never-done, if you undo a job's only tick-off.
```

### Validation

| Rule | On failure |
|---|---|
| Name non-empty after trimming | Form blocks submission, message tied to the field |
| `interval.count` ≥ 1 | Same |
| `completedOn` not in the future | Blocked — you can't have already done something you haven't |
| `completedOn` before the item was created | **Allowed.** A boiler serviced years before you installed the app is exactly the history worth having |

**The domain layer is pure.** It takes dates as parameters and returns values — never reads the
clock, never touches storage. That's what makes the scheduling rules testable by passing dates in,
including the midnight case.

---

## Storage contract

The app has no network API. Its one real contract is **the document it saves on your phone** — and
it's a contract in the strict sense, because a future version has to read what today's version
wrote. With no export, this is the only copy.

**Location**: `localStorage`, key `my-flat-pal.schedule`
**Owner**: `src/storage/` — nothing else may touch that key

```json
{
  "schemaVersion": 1,
  "revision": 7,
  "items": [
    {
      "id": "itm_9f2c1a",
      "name": "Boiler service",
      "interval": { "count": 1, "unit": "year" },
      "createdAt": "2026-08-08",
      "completions": [
        { "id": "cmp_3d7e04", "completedOn": "2026-06-14", "recordedAt": "2026-08-08T09:21:44.512Z" }
      ]
    }
  ]
}
```

Dates are `YYYY-MM-DD` with **no time component** — a job is due for a whole day. `recordedAt` is a
real instant, and is the ordering key for undo.

### Why `revision` exists — the concurrency guard

`localStorage` is shared by **every same-origin context**. The installed app and an ordinary browser
tab can both be open at once — routine, since you opened the site in a browser to install it. Each
holds the whole document in memory, and each save replaces the whole document.

Without a guard, a tick-off saved in one context is destroyed by the next save from the other, and
**with no export the loss is total**. That's strictly worse than the split-across-keys hazard a
store-per-entity layout was rejected for, and the trade wasn't acknowledged when the single-document
shape was chosen.

So: every writer re-reads immediately before writing, aborts if `revision` changed, and re-applies
against fresh state. `revision` increments on every write. Readers also listen for the `storage`
event so an open context refreshes rather than sitting on stale data.

### Reading rules

- An absent key means "no data yet", not an error. A first run and a wiped storage are
  indistinguishable (R3), and both mean an empty schedule.
- Older versions run through the migration chain first.
- **A newer `schemaVersion` must refuse to load** and put the session in read-only mode. An old
  build reading a new document — a stale service worker serving an old bundle, exactly what the
  update-path rule is about — must fail closed rather than parse half of it and overwrite. This is
  the single most destructive bug available in this design.
- **Never discard data that fails validation.**

### Corrupted data

1. **Preserve the original** — copy the raw string to `my-flat-pal.schedule.recovered.<timestamp>`.
2. Start empty so the app still works.
3. **Tell the user plainly** that data couldn't be read and the original was kept.

Silently starting fresh isn't acceptable. With no export, that corrupted string may be the only
remaining copy — and unparseable isn't the same as unrecoverable.

> **Known gap**: nothing ever *reads* a `.recovered.*` key. It's a recovery artefact with no
> recovery path — you can't reach it from a phone. Recorded, not solved.

### Migration

`storage/migrate.ts` holds ordered upgrade functions, each taking version N to N+1. At v1 the chain
is empty. It exists now, before there's any data to lose, because writing the first migration later
means writing it against documents already on people's phones.

- Migrations are pure functions of the document — no clock, no storage, no network.
- Every version keeps a committed fixture in `tests/storage/fixtures/`, so migrations are tested
  against a real historical document rather than one rebuilt from memory.
- Never drop an unrecognised field. Renaming or removing is a version bump, never an in-place edit.

---

## Project structure

```text
public/
├── manifest.webmanifest     # Name, icons, standalone display
└── icons/                   # Home-screen icons, incl. iOS sizes

src/
├── domain/                  # Pure scheduling rules — no React, no browser APIs
│   ├── types.ts  schedule.ts  interval.ts  ids.ts
├── storage/                 # The only place localStorage is touched
│   ├── repository.ts  schema.ts  migrate.ts  persistence.ts
├── ui/
│   ├── App.tsx              # Shell: layout, safe areas, navigation, notices
│   ├── navigation.ts        # History API — back gesture without a router
│   ├── useCurrentDate.ts    # Date-change trigger (FR-005)
│   ├── tokens.css  focus.css
│   ├── views/               # ScheduleView, ItemDetailView, ItemFormView
│   └── components/          # ItemRow, StatusBadge, EmptyState, ConfirmDialog
└── main.tsx                 # Entry point; service worker registration

tests/
├── domain/                  # The bulk of the suite — pure, fast, no DOM
├── storage/                 # Round trip, concurrency, recovery, migration
└── ui/                      # Behaviour through the interface a user actually uses
```

**Why three layers.** `domain/` is pure so the scheduling rules — the part most likely to be wrong
and most expensive to get wrong — can be tested exhaustively without rendering anything. `storage/`
is one boundary so the persistence choice can change without touching feature code. `ui/` is
everything React. Three layers because the domain/UI split is what makes test-first affordable, not
because layering is good in itself.

---

## Running and checking it

### Setup

```bash
npm install
npm run dev          # http://localhost:5173
npm run test:run     # single pass — this is the merge gate
```

### What the automated tests cover

- **Domain** (most of the suite): due-date derivation, all four statuses, one-status-for-long-overdue,
  completion anchoring including backdated and early, month clamping, DST-safe day arithmetic,
  ordering, undo, id uniqueness.
- **Storage**: round trip, every mutation persisting, `revision` compare-and-swap, corrupted-data
  recovery, newer-version refusal, migration against the fixture.
- **UI**: empty state, adding, ordering, visible due dates, reload survival, duplicate names,
  ticking off, session-scoped undo and its window, backdating, keyboard-only flows, axe
  scans.

  **This list named "edit, delete-actually-deletes" until 2026-08-12, and both were fiction.** US3
  is unbuilt: there is no `onEdit` or `onDelete` anywhere in `src/`, and no test file covers
  either. It was written when the plan described what the tests *would* cover and never corrected
  once the tasks were sequenced. It also flatly contradicted T103, which says in the same repo that
  there is "no way to delete the job either, since US3 is unbuilt". T063–T069 are the tasks that
  will make it true.

### What has to be done by hand

The constitution requires installed behaviour verified on a real phone before this is done. Nothing
headless can check it.

```bash
npm run build
npm run preview -- --host    # note the network URL, open it on your phone, install it
```

- [ ] Installs to the home screen on **iOS**, correct icon and name
- [ ] Installs to the home screen on **Android**
- [ ] Opens in its own window — no address bar
- [ ] Nothing hidden behind the notch, dynamic island, or home indicator
- [ ] **Android back gesture** returns from detail to list, doesn't close the app
- [ ] **iOS has a working way back** (see R4 — this may need an in-app control)
- [ ] Every tap target comfortable one-handed
- [ ] No sideways scrolling at 375px
- [ ] **Focus is clearly visible** on every control
- [ ] Opening with no network shows the app, not a browser error
- [ ] Contrast measured per view, not eyeballed
- [ ] Status readable without relying on colour
- [ ] Persistent storage requested on first use; refusal reported plainly
- [ ] Jobs survive force-quitting and a phone restart

---

## Review history

**2026-08-08.** Three adversarial reviewers plus a `/speckit-analyze` pass examined the spec, plan
and tasks — all written by one author who then certified them compliant. They returned around 60
findings. The self-review found 10 and missed every one of the five most serious.

Fixed:

- **FR-013 contradicted itself** — it required due dates to count from the completion date *and*
  forbade anything ever being immediately overdue. The spec's own acceptance test produced exactly
  that case. Split into FR-013 and FR-013a.
- **Ticking off would have been lost on reload** — the storage write path sat in a later phase.
- **FR-005 had no implementing task** — nothing triggered a re-check when the date changed.
- **Two open contexts could destroy the whole history** — now guarded by `revision`.
- **Session-scoped undo made a mis-tap permanent** — undo was made durable, and that was later
  **reversed**. The finding was correct when it was made: at the time nothing else could recover a
  mis-tap, because the detail view showing full history did not exist yet. Making the offer durable
  then produced two data-loss defects of its own (T097, T102), and once the detail view existed the
  property that made session scope unacceptable no longer held. Undo is session-scoped again as of
  2026-08-11, by decision, and an older mistake is corrected from the job's history instead. Left
  here rather than deleted because it is the record of a real finding and of why the answer changed
  twice; see the undo paragraphs above for what the design actually is now.
- Document integrity: a requirement number pointing at two different requirements, a wrong amendment
  date, three documents citing three constitution versions, 21 falsely-parallel task markers.

**Still open, recorded rather than dropped**: write failures (storage full, private browsing) have
no requirement; the `.recovered.*` key has no path back to you; undo assumes the phone's clock only
moves forward; the application state model is unspecified; and the timezone problem in R5.

**T084 re-runs `/speckit-analyze` after implementation** to confirm these are closed.
