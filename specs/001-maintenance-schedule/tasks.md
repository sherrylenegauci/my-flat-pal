---

description: "Task list for maintenance schedule implementation"
---

# Tasks: Maintenance Schedule

**Input**: Design documents from `/specs/001-maintenance-schedule/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [plan.md § Decisions](./plan.md#decisions), [plan.md § Data model](./plan.md#data-model), [plan.md § Storage contract](./plan.md#storage-contract), [plan.md § Running and checking it](./plan.md#running-and-checking-it)

**Tests**: MANDATORY per Constitution Principle III (Test-First, NON-NEGOTIABLE). Every user story
has test tasks, they are listed before the implementation they cover, and each MUST be observed
failing before that implementation begins.

> **Corrected 2026-08-08 (T080)**: `.claude/skills/speckit-tasks/SKILL.md` used to instruct that
> test tasks were optional, and each generated `tasks.md` worked around it in prose. The
> constitution's Governance section requires the conflicting artifact to be fixed instead, so the
> skill now says tests are mandatory. Future task lists inherit that without needing this note.

**Test file layout**: test files are split by behaviour rather than by view, so that tasks marked
`[P]` genuinely touch different files. A previous revision marked 21 tasks parallel that all wrote
the same handful of files.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — verified to touch a different file from every other `[P]` task in its group
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Scaffold a Vite + React + TypeScript project at the repository root per plan.md § Project Structure, creating `src/`, `public/`, `tests/`, and `vite.config.ts`
- [X] T002 Add scripts to `package.json`: `dev`, `build`, `preview`, `test`, `test:run`
- [X] T003 Configure Vitest in `vite.config.ts`: no environment for `tests/domain/**` and `tests/storage/**`, jsdom for `tests/ui/**`
- [X] T004 Create `tests/setup.ts` for RTL cleanup, and point `setupFiles` at it from `vite.config.ts` (depends on T003 — same config file)
- [X] T005 [P] Add `tests/ui/axe-helper.ts` wrapping `axe-core` for structural scans of a rendered container
- [X] T006 [P] Generate the web manifest via `vite-plugin-pwa` (not a static `public/manifest.webmanifest` as originally worded — the plugin emits it to `dist/`) with name, `standalone` display, and `start_url`, plus `public/icons/` at the sizes iOS and Android require
- [X] T007 Configure `vite-plugin-pwa` in `vite.config.ts` for precache generation and an update flow that cannot strand an installed user on a stale bundle (depends on T003, T004 — same config file)
- [X] T008 [P] Define colour tokens in `src/ui/tokens.css`, auditing every foreground/background pair against WCAG 2.1 AA and recording measured ratios in a comment
- [X] T009 [P] Define a visible focus style in `src/ui/focus.css`, meeting AA non-text contrast against every surface it appears on (Principle II — "a visible focus indicator at all times")

**Checkpoint**: `npm run dev` serves an empty shell; `npm run test:run` runs and reports zero tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Verification before implementation

- [X] T010 Verify Storage API behaviour on installed PWAs on current iOS and Android — whether `navigator.storage.persist()` exists, is auto-granted, or prompts, **and whether a grant actually protects `localStorage` against WebKit's script-writable-storage eviction policy**. Record in plan.md § Decisions R3, replacing the ⚠️. **Gates T031–T033.**
- [X] T011 Verify that an installed standalone PWA on **iOS** has no system back affordance, and decide the in-app back control this implies. Record in plan.md § Decisions R4, which currently argues only from Android. **Gates T041.**

### Domain layer — pure functions, no React, no browser APIs

- [X] T012 [P] Define `MaintenanceItem`, `Completion`, `Interval`, `ItemStatus` in `src/domain/types.ts` per plan.md § Data model
- [X] T013 [P] Failing tests in `tests/domain/interval.test.ts`: day/week/month/year addition; month-length clamping (31 Mar + 1 month → 30 Apr); 29 Feb + 1 year → 28 Feb; **day and week arithmetic across a DST boundary landing on the correct calendar day**
- [X] T014 Implement `addInterval` in `src/domain/interval.ts` to pass T013 (depends on T012)
- [X] T015 [P] Failing tests in `tests/domain/next-due.test.ts`: next due anchored to the completion date (FR-013); completing **as of today** never leaves an item immediately due (FR-013a); a **backdated** completion older than one interval legitimately leaves it overdue (FR-013a); completing **early** moves the due date earlier
- [X] T016 [P] Failing tests in `tests/domain/status.test.ts`: never-done, overdue, due, not-due (FR-004, FR-004a); a three-years-overdue annual item yields exactly one overdue status (FR-012); an item due today is overdue when evaluated against tomorrow (FR-005 classification half)
- [X] T017 [P] Failing tests in `tests/domain/ordering.test.ts`: attention items first; **where `due` sorts** (resolve spec.md FR-004 vs plan.md § Data model, which disagree on whether `due` is an attention item — decide, then update whichever document is wrong); overdue ordered by how long overdue; not-due soonest first; **never-done ordered by `createdAt`**
- [X] T018 [P] Failing tests in `tests/domain/undo.test.ts`: undo removes the highest `recordedAt`, not the latest `completedOn`; undoing an item's only completion returns it to never-done
- [X] T019 Implement `nextDueOn`, `classifyStatus`, `orderForDisplay`, `completeItem`, `undoCompletion` in `src/domain/schedule.ts` to pass T015–T018
- [X] T020 [P] Failing tests in `tests/domain/ids.test.ts`: generated ids are unique across a large batch and are never reused after a deletion
- [X] T021 Implement id generation in `src/domain/ids.ts` to pass T020, and set `createdAt` on item creation (plan.md § Data model requires both; neither had a task)

### Storage layer — the only module that touches localStorage

- [X] T022 [P] Define the persisted shape, `SCHEMA_VERSION = 1`, and the `revision` field in `src/storage/schema.ts` per plan.md § Storage contract
- [X] T023 [P] Commit a v1 fixture at `tests/storage/fixtures/v1.json`
- [X] T024 [P] Failing tests in `tests/storage/repository.test.ts`: save/load round trip; absent key loads as an empty schedule, not an error; **every mutation path — create, update, delete, complete, undo — persists** (the previous revision wired persistence for creation only)
- [X] T025 [P] Failing tests in `tests/storage/concurrency.test.ts`: a write whose `revision` no longer matches the stored document **aborts and re-applies** rather than clobbering; `revision` increments on every successful write (plan.md § Storage contract)
- [X] T026 [P] Failing tests in `tests/storage/recovery.test.ts`: corrupted JSON preserves the original under a recovery key before starting empty; a **newer** `schemaVersion` refuses to load and puts the session in read-only mode so no downgraded write can occur
- [X] T027 Failing test in `tests/storage/migrate.test.ts`: the migration chain runs against the v1 fixture and is the identity at v1 (depends on T023, which creates that fixture — T023 previously existed with nothing consuming it)
- [X] T028 Implement `src/storage/repository.ts` with the full CRUD write path and compare-and-swap on `revision`, to pass T024–T025
- [X] T029 Implement `src/storage/migrate.ts` and the recovery/read-only behaviour to pass T026–T027
- [X] T030 Subscribe to the `storage` event in `src/storage/repository.ts` so a second same-origin context refreshes instead of holding stale state

### Durability, date-change trigger, and shell

- [X] T031 [P] Failing tests in `tests/ui/persistence-notice.test.tsx`: when persistence is refused, a plain-language notice appears once; when granted, it does not (depends on T010)
- [X] T032 Implement the persistent-storage request in `src/storage/persistence.ts`, degrading gracefully where the API is absent (depends on T010)
- [X] T033 Implement the refusal notice to pass T031, using the shared notice surface (T037)
- [X] T034 [P] Failing tests in `tests/ui/date-change.test.tsx`: an item due today is re-classified as overdue **without any user interaction** when the date changes while the app is open — the case FR-005 and SC-003 actually require, which no previous task implemented
- [X] T035 Implement a date-change trigger in `src/ui/useCurrentDate.ts` — `visibilitychange` plus a timer to the next local midnight — to pass T034. **This is FR-005's implementing task; it did not previously exist**
- [X] T036 [P] Failing tests in `tests/ui/navigation.test.tsx`: an **in-app back control** on every view below the schedule returns to the list; the Android back gesture (a `popstate`) does the same; from the list, neither closes the app. Asserted through rendered views, not by inspecting `history` calls
- [X] T037 Build the app shell in `src/ui/App.tsx`: layout, `env(safe-area-inset-*)`, navigation state, and a shared notice/error surface used by T033, the recovery notice, and the read-only banner
- [X] T038 Implement `src/ui/navigation.ts` using the History API to pass T036. **T011 settled the iOS question: there is no reliable system back gesture in a standalone iOS app, so an in-app back control is required, not optional.** History integration stays — it is what stops Android's back gesture closing the app — but it is no longer the only way back
- [X] T039 Register the service worker in `src/main.tsx` and wire the update prompt

**Checkpoint**: Domain and storage fully tested, every mutation persists, and status re-evaluates on date change. Stories can begin.

---

## Phase 3: User Story 1 - See what my flat needs (Priority: P1) 🎯 MVP

**Goal**: Record the upkeep the flat needs and see, on opening, whether anything is overdue.

**Independent Test**: Add two items — one due in the future, one whose due date has passed — and confirm the overdue one is presented first and visually distinguished.

### Tests for User Story 1 (MANDATORY) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T040 [P] [US1] Failing test in `tests/ui/empty-state.test.tsx`: with no items, an empty state explains the app's purpose and offers a way to add the first item (FR-011)
- [X] T041 [P] [US1] Failing tests in `tests/ui/item-form.test.tsx`: entering name, interval, and last-done saves the item and shows its next due date; **all four interval units are selectable and round-trip**; an item added with no last-done is never-done with no due date (FR-004a); validation blocks an empty name and a count below 1
- [X] T042 [P] [US1] Failing tests in `tests/ui/schedule-list.test.tsx`: attention items appear before not-due items (FR-004); the next due date is visible on the row **without opening the item** (US1 scenario 4); an overdue row is **visually distinguished** from a not-due row by more than colour (US1 scenario 3)
- [X] T043 [P] [US1] Failing test in `tests/ui/reload.test.tsx`: items and their status survive tearing down and remounting the app against the same storage — US1 scenario 5, which previously had only an assertion buried inside an implementation task
- [X] T044 [P] [US1] Failing test in `tests/ui/duplicate-names.test.tsx`: two items may share a name and remain independently addressable (spec Edge Case)
- [X] T045 [P] [US1] Failing test in `tests/ui/keyboard-us1.test.tsx`: the whole add-and-view flow is completable by keyboard alone (SC-005)
- [X] T046 [P] [US1] Failing test in `tests/ui/axe-us1.test.tsx`: axe structural scan of the schedule list and add form reports no violations

### Implementation for User Story 1

- [X] T047 [P] [US1] Build `src/ui/components/StatusBadge.tsx`, conveying status by text as well as colour
- [X] T048 [P] [US1] Build `src/ui/components/EmptyState.tsx`
- [X] T049 [US1] Build `src/ui/components/ItemRow.tsx` showing name, status, and next due date without a tap
- [X] T050 [US1] Build `src/ui/views/ScheduleView.tsx`, ordering via `orderForDisplay` and recomputing status from `useCurrentDate` (never a persisted status)
- [X] T051 [US1] Build `src/ui/views/ItemFormView.tsx` for creating an item, with 44x44px targets, inline validation, and a visible back/cancel control (T011)
- [X] T052 [US1] Wire creation through the repository to pass T043

**Checkpoint**: **MVP — a usable app.**

---

## Phase 4: User Story 2 - Mark something done (Priority: P2)

**Goal**: Record that a job was done and have the next occurrence scheduled automatically.

**Independent Test**: Mark a due item done and confirm it leaves the attention group, records the completion, and shows a next due date consistent with its interval — and that it survives a reload.

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T053 [P] [US2] Failing tests in `tests/ui/complete.test.tsx`: marking a due item done removes it from the attention group and schedules the next occurrence (FR-006); it takes no more than two taps from the main view (SC-004); **the completion survives a reload** (the defect that made US2 depend on a Phase 5 task)
- [X] T054 [P] [US2] Failing tests in `tests/ui/undo.test.tsx`: undo restores the exact prior state including the previous due date; **undo still works after the app is closed and reopened** (plan.md § Data model — session-scoping was removed because it made a mis-tap permanent)
- [X] T055 [P] [US2] Failing tests in `tests/ui/backdate.test.tsx`: a completion may be backdated; a future `completedOn` is rejected; a backdated completion older than the newest one adds to history **and gives the user feedback that nothing about the schedule changed** (previously a silent no-op contradicting FR-006)
- [X] T056 [P] [US2] Failing tests in `tests/ui/item-detail.test.tsx`: last-done date is shown (US2 scenario 2); completion history lists newest first (FR-008)
- [X] T057 [P] [US2] Failing test in `tests/ui/keyboard-us2.test.tsx`: mark-done, undo, and viewing history are each completable by keyboard alone (SC-005 — "every flow")
- [X] T058 [P] [US2] Failing test in `tests/ui/axe-us2.test.tsx`: axe scan of the detail view reports no violations

### Implementation for User Story 2

- [X] T059 [US2] Build `src/ui/views/ItemDetailView.tsx` showing last-done and history, with a visible back control to the schedule (T011)
- [X] T060 [US2] Add the mark-done action to `src/ui/components/ItemRow.tsx`, reachable in one tap
- [X] T061 [US2] Add the durable undo affordance to `src/ui/App.tsx`
- [X] T062 [US2] Wire completion and undo through the repository (write path already exists from T028)

**Checkpoint**: The schedule now stays true over time, and mis-taps are recoverable.

---

## Phase 5: User Story 3 - Correct the schedule (Priority: P3)

**Goal**: Keep the schedule matching reality by editing or removing items.

**Independent Test**: Change an item's interval and confirm its next due date updates; delete an item and confirm it is gone.

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T063 [P] [US3] Failing tests in `tests/ui/edit.test.tsx`: changing name or interval saves, the due date updates immediately, and **the edit survives a reload**
- [X] T064 [P] [US3] Failing tests in `tests/ui/delete.test.tsx`: deletion asks for confirmation; the confirmation states that history is discarded; **confirming actually removes the item from the schedule**; **cancelling leaves it in place** — US3's Independent Test, which no previous task asserted
- [X] T065 [P] [US3] Failing test in `tests/ui/confirm-dialog.test.tsx`: the dialog traps focus, is dismissible by keyboard, and passes an axe scan
- [X] T066 [P] [US3] Failing test in `tests/ui/keyboard-us3.test.tsx`: editing and deleting are completable by keyboard alone (SC-005)

  **All four landed together in one commit, before any implementation, and were observed failing
  on their assertions** — "Unable to find role=button and name Edit job", the same for "Delete
  job", and "Unable to find an accessible element with the role dialog". `ConfirmDialog.tsx` was
  committed first as a stub returning `null`, so the T065 tests reached their assertions instead
  of dying on an unresolvable import, which fails identically whether a behaviour is missing or a
  name is misspelled.

  **Two of them could not check what they claimed, found by sabotage after the fact and fixed.**
  `delete.test.tsx` deleted the *first* of two seeded jobs, so an implementation that ignored the
  id entirely and returned `items.slice(1)` passed all 257 tests; it now deletes the middle of
  three and asserts the survivors in order. The same defect on the edit side, and the singular
  "1 completion recorded" wording going unread, are recorded on T107.

### Implementation for User Story 3

- [X] T067 [P] [US3] Build `src/ui/components/ConfirmDialog.tsx` with focus trapping and keyboard dismissal

  **Built general, because it has a second customer already**: T103 reuses it to remove one
  completion from a job's history, so the caller supplies the question, the consequence and the
  confirm label and nothing about deleting a job is inside it. That is the second concrete use
  case Principle I asks for before an abstraction appears, and it existed before the file did.

  **Not a native `<dialog>`.** It would give trapping, Escape, the top layer and focus restoration
  for free in a browser, but jsdom 25 implements no `showModal` — probed, not assumed — so the
  behaviour tier could not exercise any of it, and the Testing Strategy forbids a check that
  cannot check.

  **Focus return is the part that took two attempts.** The obvious rule — restore if the dialog
  still holds focus — never fires, because a `useEffect` cleanup is passive and React has already
  detached the dialog by then, so focus is on `<body>` in every case including the ones needing
  the restore. It now restores only when focus was lost, which also leaves alone a caller that has
  placed focus itself.

  **The page behind is made `inert`**, not merely `aria-modal`. `aria-modal` is an instruction a
  screen reader may honour; `inert` removes the content from the focus order and the accessibility
  tree, so a VoiceOver swipe cannot walk out of the dialog into the page behind. `readControlBoxes`
  and `focusNthControl` in `e2e/support/probe.ts` now skip inert subtrees, so the browser sweeps
  measure what a user can actually reach. **This mechanism is covered by exactly one test on one
  engine** — see T108.
- [X] T068 [US3] Extend `src/ui/views/ItemFormView.tsx` to handle editing

  One component for both, not two: they ask for the same two things under the same rules, and the
  first divergence between two copies would be a bug in one of them. `editing` changes the
  heading, the submit label, the starting values, and whether the last-done field exists.

  **The edit form has no last-done field, and FR-007b assumes it does.** FR-009 covers the name and
  the interval; a Completion is immutable once saved (spec, Key Entities). FR-007b nonetheless says
  a wrong last-done date on a new job "is corrected by editing it (FR-009)", which is not something
  FR-009 provides. T103 would make it true by a different route — remove the entry from the
  history and record it again. **Unresolved, and Sherrylene's call**; recorded rather than decided.
- [X] T069 [US3] Wire edit and delete into `src/ui/views/ItemDetailView.tsx` (repository write path already exists from T028)

  Both controls sit at the bottom, below the history a deletion would take with it, so the
  destructive one is furthest from the thumb and last in the Tab order. The confirmation names the
  job and says what it costs — with the number of completions in the sentence, and a different
  sentence for a job that has never been done, because promising to discard a history that does
  not exist teaches the user that these dialogs are boilerplate.

  Editing leaves completions alone; the next due date moves anyway, because it is derived on every
  render and never stored, so US3 scenario 1 needed no code of its own.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish, Verification & Governance

### Real-browser tier (Playwright)

The third tier of the constitution's testing strategy, currently a manual checklist. Justified as
a dependency in `plan.md` § Dependency budget. These run first, because T070–T074 below are
their acceptance criteria — each one names the manual task it takes over.

- [X] T085 Add `@playwright/test`, a `playwright.config.ts` pinned to Chromium and WebKit at a 375px iPhone viewport, an `e2e/` directory outside the Vitest projects, and an `npm run test:e2e` script. Vitest must not pick up `e2e/**` and Playwright must not pick up `tests/**`
- [X] T086 [P] `e2e/accessibility.spec.ts` — run axe via `@axe-core/playwright` against every view in real rendering (**takes over T070**)
- [X] T087 [P] `e2e/layout.spec.ts` — assert no horizontal document overflow at 375px and that every interactive control's bounding box is ≥ 44×44 CSS px (**takes over T071**). This needs real layout; jsdom returns zeros
- [X] T088 [P] `e2e/focus-visibility.spec.ts` — tab through every control, assert a focus indicator is present and compute its contrast against the *resolved* background from `getComputedStyle` (**takes over T073**). This is the bare Principle II MUST that no tier has ever covered, and the check that would have caught the 2.69:1 ring
- [X] T089 [P] `e2e/contrast.spec.ts` — walk the rendered text nodes per view and assert 4.5:1 body / 3:1 large and UI from resolved colours, and `e2e/colour-independence.spec.ts` asserting status is readable with colour suppressed (**takes over T072 and T074**)
- [X] T090 Prove the new specs are non-vacuous by deliberate sabotage, as was done for the unit tests: break the focus ring, shrink a touch target, and confirm the relevant spec fails. A browser test that cannot fail is the exact defect the constitution names

- [X] T091 **Fix the interval `<select>` being 25px tall in WebKit** — found by T087 on its first run. `app.css` set `min-height: var(--touch-target)`, but Safari's UA stylesheet wins on a natively-rendered dropdown and discards it, leaving the control at its 25px content height against Principle II's 44px floor. Chromium honours the rule and reports 44px, so no amount of Chromium testing could have surfaced this, and jsdom cannot express the question at all — it reports every box as zero-sized. Fixed with `appearance: none` plus a drawn chevron in `src/ui/app.css`. **This was a live defect on the target platform, shipped in US1 and invisible to all 142 unit tests.**
- [X] T092 **Teach the focus-visibility background guard to discriminate** — T091's chevron made `resolveBackground` refuse to measure the dropdown, because any background image meant "the colour behind the text is unknown". Correct in general, wrong here: the chevron is pinned right and `padding-right` keeps text clear of it. The guard now computes where the image actually lands and compares it against the *frame* the focus ring paints rather than the rectangle enclosing it, so an image in the ring's hollow centre no longer blocks the measurement. Verified by independent sabotage: moving the chevron under the ring makes it refuse again

- [X] T093 **Fix the interval row's layout and make the dropdown look like one** — found by Sherrylene looking at the running app, not by any check. The `Period` label was a fourth item in a three-column grid, so it wrapped and dragged the dropdown onto its own row, leaving it stranded from the label naming it and reading as a stray text field. The label is now visually hidden (still in the accessibility tree, so it is still announced), the count and unit share a row, and the chevron went from 12×8 to 16×10 so the control announces itself as a dropdown before you tap it. **Nothing automated could have caught this**: axe was satisfied because `htmlFor` correctly associated the label, and the layout checks were satisfied because nothing overflowed and every target met 44×44. It was only wrong to look at — the exact gap the constitution records when it says the real-browser tier cannot replace a person on a device

### Undo, read-only and design (from the 2026-08-11 clarification)

Test tasks come first, as Principle III requires. An earlier revision listed T097 and T099
below as implementation-only, which would have repeated exactly the gap recorded against
US1 — where tests and implementation landed in one commit and test-first became
unverifiable after the fact.

**FR-006a** (recording a past completion) is already covered: T055's tests and the US2
implementation satisfy it. The clarification wrote down behaviour that existed rather than
asking for new behaviour, so it needs no task.

- [X] T094 [P] Failing tests in `tests/domain/undo-window.test.ts`: a pure function deciding whether a completion is still undoable at a given moment, with the moment passed as a parameter and never read from a clock. True just after `recordedAt`, false well after it, and false for a completion recorded days ago. Belongs in the domain tier because it is arithmetic on two timestamps, and because time as a parameter is how every other date decision in this codebase is tested
- [X] T095 [P] Failing tests in `tests/ui/undo-expiry.test.tsx` using fake timers (FR-007, FR-007a): the offer appears on marking done and disappears once the window passes without the user acting; **an app opened on a document containing only old completions offers no undo at all**; and pressing undo once removes exactly one completion and leaves the rest of the history intact. That last assertion is the regression guard for the defect — the current behaviour removes one per press, forever, until nothing is left
- [X] T096 [P] Failing test in `tests/ui/undo-not-after-add.test.tsx` (FR-007b): adding a job with a last-done date raises no undo offer. The current behaviour offers one, and taking it strips the date and turns the job just created into "Never done" — so this test must assert the *absence* of the control, which means it must be observed failing against today's code or it proves nothing
- [X] T097 **Time-limit the undo offer, and stop it deleting history** (issue #98, spec FR-007/FR-007a/FR-007b). Undo is derived from the newest `recordedAt` anywhere in the schedule with nothing to expire it, so on a freshly opened app it offers to delete history the user never touched — verified by probe: three presses removed completions dated 2020, 2022 and 2024, with no confirmation, on a document the app had never written. It is also the first thing above `<main>`, so a keyboard user could Tab once and Enter into losing data. Needs no storage-contract change: `recordedAt` is already stored, so the offer stays derived and additionally checks the completion is within ~10 seconds. Must be measured against `recordedAt` versus now, **not** against when the component mounted, or reopening the app would resurrect an expired offer. Adding a job with a last-done date must raise no offer at all (FR-007b). **This is a data-loss defect, not a polish item — it should land before US3 builds on top of it.**

  **Correction, found while implementing.** The sentence above — "the offer stays derived and
  additionally checks the completion is within ~10 seconds" — is not sufficient, and neither is
  the matching claim in `plan.md` that FR-007b falls out of the bound. It does not. The window
  delivers FR-007 and it stops a freshly opened app offering to delete old history, but two rules
  in FR-007a and FR-007b cannot be derived from the stored document at all:

  - **FR-007b.** An item created today holding one completion recorded a second ago is what you
    get *both* from adding a job with a last-done date *and* from adding a job and then ticking
    it off. The document does not distinguish them, so no rule reading it can.
  - **FR-007a.** Tick two different jobs off within the same ten seconds and undo once: the
    other job's tick-off is now the newest and still inside the window, so the offer returns and
    a second press walks backwards. Verified by probe, both with and without the fix.

  Both are handled by remembering one completion id in `useSchedule` — the entry that must *not*
  be offered, set when a job is added with a date and again after an undo. It is only ever used
  to withhold an offer, so a stale value can only decline to undo something. The alternative that
  would keep the offer purely derived is a field in the stored document, which is a persistence
  choice and therefore needs a plan amendment first (Technology Constraints). Not taken here.

  The cost of that choice is larger than first written, and is now T102: the remembered id does
  not survive a relaunch, so both rules above fail across one. Confirmed by probe, twice
  independently and then a third time by hand.
- [X] T098 [P] Failing tests in `tests/ui/read-only.test.tsx` (FR-010a): with a stored document carrying a higher `schemaVersion`, no control that would change anything is present or enabled — not Add job, not Mark done, not Undo — and the notice explaining why is shown. Seed through the repository rather than the UI, since the UI cannot create this state

  **Written differently from the line above, deliberately.** "No Mark done, no Undo" cannot be
  asserted honestly here: `load()` returns an empty document for a too-new file, so a read-only
  screen has no rows for those controls to belong to and the assertion could never fail — which
  the constitution's Testing Strategy forbids outright. The test enumerates every control the
  read-only screen renders and requires that none of the live ones is a write control, so any
  write control appearing fails it, including ones that do not exist yet. The row-level and
  detail-level write controls remain genuinely uncovered in a read-only session, and that gap is
  recorded in the test file rather than papered over.
- [X] T099 **Make read-only sessions honest** (spec FR-010a). When the stored document came from a newer build, `save` throws `ReadOnlyError`, but Add job, Mark done and Undo all still render. React does not catch errors thrown from event handlers, so the tap saves nothing and says nothing, while the banner claims "Nothing can be changed". Hide or disable every write control instead, so the screen matches the message. Unreachable today — the schema has never left v1 — but US2 moved it from inside a form to the opening screen

  **Done by replacing the view rather than gating controls one by one.** A read-only session now
  renders `src/ui/views/ReadOnlyView.tsx` in place of the schedule: a heading, a paragraph, and
  no controls at all. Gating each control instead would have meant threading a flag through
  `ScheduleView`, `ItemRow` and `ItemDetailView` to reach code that can never run, since the
  read-only document has no items — dead code that no test could honestly exercise.

  **A second dishonesty fixed at the same time, not in the original task.** The read-only screen
  used to render the ordinary empty state, headed "Nothing recorded yet". That is a claim this
  build cannot support: the user may well have a full schedule, written by the newer build, that
  this one declined to read. In an app with no export and no backup, being told your records are
  gone is not a small thing to get wrong.

  **Browser-tier consequence.** The read-only state now has zero interactive controls, which
  trips the `controls.length > 0` guard that `e2e/layout.spec.ts` and `e2e/focus-visibility.spec.ts`
  apply to every state in `APP_STATES`. The guard is right — it stops a state that renders
  nothing from sweeping vacuously — so the exception is made explicit per state rather than the
  guard relaxed
<<<<<<< HEAD
- [X] T103 **RELEASE BLOCKER — a mistaken completion cannot be removed, by any means** (FR-007a). Sequenced after US3 by decision on 2026-08-11: removing a completion needs a confirmation dialog and T067 builds one, so doing this first would build that dialog twice. **Waiting is safe only because nothing is released.** Today: tap Mark done by mistake, let ten seconds pass, and that entry is permanent — there is no control to remove it. **Corrected 2026-08-12, since US3 landed**: this line used to add "and no way to delete the job either, since US3 is unbuilt", which is no longer true and was never much of a remedy anyway. Deleting the job now works, and it destroys that job's entire history to remove one wrong row. The only alternative is clearing site storage, which destroys every job. Neither is a correction; both are amputations. The cost is not one wrong row: the completion is dated today, so the next due date moves a full interval and an annual service drops off the list for a year, and the history — kept because `spec.md` says it is "worth being able to prove" — now records work that never happened. **FR-007a's closing sentence, "correcting an older mistake is done from the item's history", is false until this exists**, and the same claim justifies session-scoped undo in `spec.md`, `plan.md` and T102. Add a control in the detail view's history list that removes one completion, reusing T067's dialog. Do not ship without it

  **Done 2026-08-20.** Every entry in the detail view's History list now carries its own control — visible text "Remove", accessible name "Remove the completion on 5 June 2025" — and confirming goes through T067's `ConfirmDialog`, which was built general for exactly this second caller. No second dialog exists. `removeCompletion(item, completionId)` in `src/domain/schedule.ts` picks **by id, never by recency**, which is the whole difference from `undoCompletion`: the history list is ordered by `completedOn`, and a backdated entry has a late `recordedAt` with an early `completedOn`, so delegating to undo's rule would remove a different row from the one the user named. An id that is not present hands back the same object, which is how `mutate` is told not to write at all.

  **The confirmation states the consequence rather than implying it**, because removing a completion does something a user is unlikely to predict — it moves the schedule, since the next due date is derived from the last completion and never stored. Three sentences, and which one appears is chosen by comparing the due date before and after the removal, never by the row's position or by whether its date matches the job's last-completed date. Two entries recorded on the same day are both "the latest date", and removing either leaves the other holding the schedule exactly where it was; deciding by position would tell the user their schedule is about to move when it is not. Saying so when nothing moves is FR-006a's rule. The status word is read from `STATUS_LABELS`, now exported from `StatusBadge`, so the dialog cannot promise a state the badge never shows. Removing the newest entry moves the due date backwards and can flip a job from Scheduled to Overdue — the correction being made, and pinned by test rather than left to be discovered.

  **Three existing tests were changed, deliberately.** `edit.test.tsx`, `item-detail.test.tsx` and `undo.test.tsx` each read a history row's raw `textContent` and compared it to bare dates; a row now contains a control whose name repeats the date. What they assert is unchanged — the same dates in the same order — and only how they read the row moved, into `tests/ui/history.ts`, which drops the row's controls first. Baking T103's button copy into three FR-008 tests would have been the wrong fix. Verified rather than asserted: removing the sort from `completionsNewestFirst` turns all three red.

  **Verified independently after implementation, and it found a real hole that is now closed.** Nothing pinned *which* of two entries dated the same day actually goes — the case the feature most exists for, since ticking a job off twice in one day is a common way the mistake gets made. Two tests pressed both twins but only read the dialog's consequence sentence, and that sentence is identical for twins by design, so neither confirmed the removal or read storage back. Rewiring the control to select the first entry sharing its row's date left all 294 tests passing while removing the wrong row. Two tests now press each twin, confirm, and assert the stored ids; the same sabotage is red. Verification also confirmed the three edited FR-008 tests are not weaker — blanking the row's visible date, so it survives only inside the button's hidden name, fails exactly those three and nothing else, which is the result that shows `historyDates()` is not reading the button's name back to itself. Two smaller findings were fixed in place: the comment on `setRemovingId(null)` claimed more than the line does, and the removal confirmation had no browser-tier state of its own, so no sweep saw its longer consequence sentence — it has one now, taking the browser tier from 134 to 145. One finding is left open as T112.

  **Two things this cannot discharge, both routed to T078 and the manual checklist.** Whether VoiceOver announces the dialog and confines the rotor to it. And whether two completions recorded on the same date can be told apart at all — they produce two controls with the *same* accessible name, and same-day duplicates are one of the ways this mistake gets made. That one needs a decision about what the name carries when dates collide; it is not an axe violation and no jsdom test can settle it.
=======
- [X] T100 [P] **Design refresh: colour and personality** (issue #99). The app is near-monochrome — white cards on grey, one blue accent, status as small coloured text — and reads as a spreadsheet rather than something for a home. Constraints: Principle I forbids a component library, so this is CSS and tokens; status MUST NOT be carried by colour alone, which `e2e/colour-independence.spec.ts` enforces; 375px first; 44×44 targets hold. **Every ratio must be computed, not estimated** — `tokens.css` once carried twelve ratios recorded as measured that were all estimates, and `focus.css` claimed 3.6:1 for a ring that measured 2.69:1. `e2e/contrast.spec.ts` now checks this against real browser-resolved colours on both engines, so a careless palette turns the suite red rather than shipping

  **Done, with T101, in one pass over `tokens.css`, `app.css` and `focus.css`. Then done a
  second time**, because the first answer was shown to Sherrylene and turned down. Both are
  recorded below: the rejected one because a rejection is a decision and reads as a mistake
  once the reason for it is lost, and the current one because it is what is on screen.

  **Attempt 1 — warm and domestic (2026-08-12, `177e01c`). Rejected on sight.** Warm paper
  (`--surface` #fffcf6) over warm sand (`--surface-sunken` #eee6d9), a deep olive accent
  (#4a5d33), and a pale wash pill behind each status word. It met every constraint in the task
  line and passed both engines, which is precisely the point: the browser tier can tell you a
  palette is legible and cannot tell you it is wanted. The objection was that the whole thing
  was soft — tinted surfaces, tinted pills, low separation everywhere.

  **Attempt 2 — clean and crisp (current).** Cool neutrals in place of warm ones: a white card
  (`--surface` #ffffff) on a cool grey page (`--surface-sunken` #e7ecf2). One accent, a deep
  teal (#0f5f68), used for every interactive thing including text — the separate `--accent-text`
  is gone, because this teal clears 4.5:1 as a word on both surfaces. Teal is the one hue clear
  of all three status hues: it is not adjacent to overdue red, due amber, or never-done violet,
  and it is not warm enough to be mistaken for any of them at a glance down a list.

  Crisper rather than merely different, in numbers: `--text` 15.86:1 → 18.51:1 on a card, the
  control border 5.59:1 → 7.02:1, the card hairline 1.39:1 → 1.51:1. Status keeps its four
  meanings — red, amber, violet, neutral — for the same reason as before: the words already
  teach them.

  **The status pills changed treatment, and this is the argument for it.** They were introduced
  with the warm palette as a pale wash behind the word. A wash is a soft device, and softness is
  what was rejected, so they are now outlined: a 1px edge in the status hue, a tight radius, and
  no fill, so the word sits on the card itself. It says the same thing — this is a label, these
  are its bounds — with definition instead of tint, and it removes a whole class of pair from
  the contrast audit, since a status word no longer needs checking against a wash *and* against
  whatever the wash sits on. Status is still never carried by colour:
  `e2e/colour-independence.spec.ts` passes on both engines.

  **Tracked capitals were the obvious crisp treatment and are not used**, for a mechanical
  reason worth writing down: `innerText` returns text as rendered, `text-transform` included,
  and `e2e/colour-independence.spec.ts` matches "Overdue", "Due today", "Never done" and
  "Scheduled" case-sensitively against it. Uppercasing the badge would have turned that spec red
  for a purely visual change — and the only ways out are editing the spec to suit the CSS, or
  keeping the word as written. It is kept as written.

  **`focus.css` is in scope despite not being named**, and this is the reason: every ratio it
  records is against a surface that moved, so leaving it alone would have left five recorded
  numbers describing a palette that no longer exists — the exact failure this task was written
  about. That has now happened twice, once per pass. Recomputed for the crisp palette: ring on
  `--surface` 19.22:1, on `--surface-sunken` 16.18:1, on `--notice-wash` 16.40:1; on `--accent`
  2.61:1 and on `--danger` 2.94:1, both failing, which is why the white inner ring exists and is
  unchanged (7.35:1 and 6.54:1). The ring itself moved from #14140f to #0b0f14 — a warm
  near-black is the wrong near-black on a cool page.

  **Every ratio computed, none estimated.** Computed by importing `e2e/support/colour.ts` into a
  throwaway script rather than re-implementing the formula, and validated before use against
  four figures already in the tree (17.44, 6.88, 7.46, 2.69) — all four reproduced exactly —
  plus three whose values are fixed by WCAG rather than by this repository (black on white
  21.00, #767676 on white 4.54, #595959 on white 7.00), all three exact. Two pairs are recorded
  as measured *and* below 3:1, deliberately and with the reason beside them: card fill on page
  (1.19:1) and `--border` on `--surface` (1.51:1). Neither is an interface component under WCAG
  1.4.11 — nothing is identified by either, controls use `--border-strong` at 7.02:1, and status
  is identified by its word. Recorded rather than omitted so nobody wonders later whether they
  were checked. The third such pair from attempt 1, pill fill on card at ~1.1:1, no longer
  exists: the pills have no fill.

  **Tokens removed across the two passes**, each because it had no reference left in `src/`:
  `--ok-text` and `--ok-edge` (attempt 1); `--accent-text`, `--notice-edge`, `--radius-pill`,
  the four status washes and `--neutral-wash` (attempt 2). `--surface-raised` went too — it was
  never referenced by anything, in either palette. A token nothing uses is a trap, not a spare.

  **The PWA manifest was two palettes out of date and nothing noticed.** `theme_color` #1f2933
  and `background_color` #f7f7f5 in `vite.config.ts`, and the matching `theme-color` meta in
  `index.html`, still held the *original* palette's values — attempt 1 changed every stylesheet
  and missed these, because they are the one place colour lives that no stylesheet reaches and
  no test tier reads. They now carry `--surface` and `--surface-sunken`, and they will need
  updating by hand on any future palette change.
>>>>>>> main
- [X] T104 [P] **Pin the undo window to the completion, not to mount** (FR-007). Nothing in the suite establishes this. Sabotage proved it: capture a timestamp when the hook first runs and measure the window from that instead of from `recordedAt`, and **209 of 209 tests still pass** — reproduced independently by the verification agent and by me. The regression it permits points the opposite way from the original defect and is worse in practice: with a mount-relative window, anyone who has had the app open more than ten seconds gets no undo offer at all when they tick something off, which is every real user. `tests/domain/undo-window.test.ts` pins the arithmetic; nothing pins what is passed into it. Add a behaviour test that opens the app, lets well over the window pass with nothing recorded, then marks a job done and asserts the offer appears and works

  **Done. No source change — this task was coverage for behaviour that was already correct**, which
  is why the acceptance step was sabotage rather than a green run. "offers undo, and honours it,
  for a job ticked off long after the app was opened" is in `tests/ui/undo-expiry.test.tsx`. It
  lets three windows pass with nothing recorded, then ticks a job off, and asserts the offer both
  appears and takes the entry back. Applying the exact sabotage in the task line — a `mountedAt`
  ref substituted for `newest.completion.recordedAt` at the render-time offer and for
  `offerRecordedAt` at the press-time re-check — turned that one test red and nothing else:
  3 failed / 211 passed, where two of the three were the T105b tests still awaiting their fix.
  `src/ui/useSchedule.ts` was restored byte-identical afterwards. The press half is not decoration:
  the substitution made only inside `undoLast` leaves the button on screen and would slip past an
  appearance-only assertion.

  **The file's header claimed two other tests did this job.** They do not, and the header is
  corrected under T106.
- [X] T105 [P] **Test the guard that stops undo deleting another context's completion** (FR-007a). **Decision 2026-08-11: the expired press stays silent — no message, closed as won't-fix.** The rationale is that the list already tells the truth: after a completion the row shows as done with its new due date, and it does not revert, so nothing is concealed from a user who looks. A message would add weight to a 375px screen for a case whose state is already on screen. Noted as a decision rather than an oversight, so it is not re-raised as a defect: the *other* silent press (another window saved in between) genuinely was one, because there the user's expectation and the stored state diverge with nothing on screen explaining it. Load-bearing and untested: delete the id comparison in `undoLast` and the suite still passes 209 of 209, while a probe shows the button labelled "Undo recording Boiler service as done" deleting a *different* job's entry written by a second tab. Add a test where a second context writes a completion, the standing offer is pressed, and both jobs' stored histories are asserted unchanged. Worth fixing while there: that press is a silent no-op which still increments `revision` — the same "a control that visibly does nothing reads as a fault" problem FR-010a exists to legislate against

  **Done, in two halves that were held to different standards.** All four tests are in
  `tests/ui/undo-other-context.test.tsx`, which models a second tab by calling `save()` from the
  repository directly — jsdom dispatches no `storage` event for a same-document write, so the
  running app genuinely never hears about it, which is the only way the offer can still be standing
  when its target is no longer newest. A test that fired a storage event would make the app reload
  and withdraw the offer, leaving nothing to press.

  *The guard* was already correct, so its test was accepted on sabotage: replacing
  `if (target === null || target.completion.id !== offerId)` with `if (target === null)` turned
  "deletes nothing from either job when another window has saved since" red. The failure is a diff
  showing Smoke alarms' entry deleted by a button naming Boiler service.

  **The count that sabotage gives has since changed, and this note used to state it as a fact
  anyone could reproduce.** At the test commit it was 3 failed / 211 passed and the guard test was
  the only previously-green one among them. At HEAD it is 4 failed / 211 passed, because the fix
  below added three tests that stand downstream of the same mechanism: with the guard gone the
  press succeeds, so no refusal notice is raised, no `StaleWriteError` is provoked, and the axe
  sweep has no refusal state to visit. That is the mechanism being well covered rather than the
  test failing to isolate — but "and nothing else" is no longer true and is withdrawn.

  *The silent no-op* was a real fix and went test-first. Both tests were observed failing against
  the old code — one on the absent message (`Alerts on screen: []`), one on a `StaleWriteError` the
  other context should never have seen. `mutate` now treats a change function returning the array
  it was given as a decision not to write, on the first attempt and on the stale-write
  re-application alike, and reports whether anything landed; `undoLast` uses that to raise a
  `role="alert"` notice naming the job: "<job> is still recorded. Something else was saved in
  another window, so nothing was taken back." It clears on the next thing the user records, adds or
  undoes. `axe-us2.test.tsx` now visits the state, which no other sweep reaches.

  **Two judgements, recorded because the task did not settle them.** The wording and the choice of
  `role="alert"` over `status` are mine — alert because the user asked for something and did not
  get it, and because focus moves to the heading on every press, so a polite announcement would
  queue behind the heading's. Whether VoiceOver actually interrupts and reads it is a real-device
  question and jsdom cannot answer it.

  **Not fixed, and it is the same class of silence**: pressing Undo *after the window has passed*
  is also a no-op that only removes the button. `useSchedule` treats the button disappearing as
  sufficient there. The two cases need different sentences, so unifying them is a scope decision
  rather than a tidy-up, and it is Sherrylene's.
- [X] T106 [P] **Correct four places that still describe the pre-T102 design.** They do not change behaviour; they hand the next reader an invariant the code does not have. `src/domain/schedule.ts` says undo is derived "which is what makes it survive the app being closed... no remembered session, nothing to expire" — all three clauses now false, on the function the whole offer is built on. `plan.md` calls the derived design "genuinely good" eighteen lines above the paragraph explaining why it was insufficient, and still files "session-scoped undo made a mis-tap permanent — undo is now durable" under fixed findings, which is exactly what T102 reversed. And `undo-expiry.test.tsx`'s header claims two tests discriminate mount-relative from completion-relative expiry, which T104 shows they no longer do

  **Done, and it was five places rather than four.** `plan.md` also listed "durable undo" among
  what the UI tests cover, in the same list-of-coverage sentence — the same falsehood as the fixed
  finding, so it is corrected with it and now reads "session-scoped undo and its window".

  **Nothing was deleted.** Both `plan.md` entries record real findings that were correct when made,
  and the constitution's own history keeps superseded reasoning rather than erasing it. The
  "genuinely good" paragraph keeps the praise and says what it was believed about and why the
  property being praised is the one that had to go. The fixed finding keeps "session-scoped undo
  made a mis-tap permanent" and records that the answer changed twice: durable undo was right until
  the detail view existed, produced two data-loss defects of its own (T097, T102), and was reversed
  on 2026-08-11 once full history gave an older mistake a home.

  `src/domain/schedule.ts`'s comment on `mostRecentlyRecorded` mattered most and got the most: it
  now says outright that being newest is necessary and nowhere near sufficient, names the two
  conditions `useSchedule` adds that no function reading the document could supply, and keeps the
  struck-through claim so the next reader recognises it if they meet it elsewhere. It also keeps
  the one thing the derived answer still genuinely buys — that the entry the notice names and the
  entry `undoCompletion` removes are computed the same way and cannot drift apart
- [X] T102 **Scope the undo offer to the session that recorded the completion** (FR-007, FR-007a, FR-007b). **Decision taken 2026-08-11: session scope, not a stored field.** Invert the current logic — instead of remembering one completion id to *refuse*, remember the completion id this session *recorded* and offer undo only for that. It fails closed: a lost memory means no offer rather than a wrong one, where the current arrangement fails open. It needs no change to what is stored, so no plan amendment for a persistence change. It drops undo across a relaunch entirely, which is consistent with the ten-second window already chosen — locking the phone after tapping was already accepted as losing the offer. Two existing tests in `tests/ui/undo.test.tsx` assert survival across a reopen inside the window and must change; **change them deliberately and say so**, since editing a test to fit an implementation is how a broken feature gets hidden. Session-scoping was rejected in the original design because it made a mis-tap permanent when the phone backgrounded — that no longer holds, because the detail view now shows full history. Numbered after the design tasks because it was found after them, by verification of T097; it is not lower priority than them. The offer is derived from the stored document, but the one id the app refuses to offer lives in a React ref, so a relaunch resets the refusal without resetting the offer. Two sequences, both reproduced by probe three times independently:

  1. Add a job with a last-done date. No offer, correctly. Reopen the app within ten seconds and the offer is there — "Undo recording Gutters as done". Pressing it leaves storage at `{"Gutters":[]}` and the row reads "Never done". That is the exact outcome FR-007b exists to prevent.
  2. Tick off Boiler, tick off Alarms two seconds later, press undo once. Correctly no second offer. Reopen within the window and the offer returns naming Boiler; pressing it removes Boiler's tick-off too. Two presses, two completions, separated only by a relaunch — FR-007a's "repeated use MUST NOT walk backwards through history".

  **Bounded, not unbounded.** The window still holds, so only completions recorded in the last ten seconds are reachable and the 2020/2022/2024 history that started all this is not. Both entries a user could lose this way are ones they made seconds earlier. This is a much smaller defect than the one T097 fixed, but it is the same defect.

  **Three fixes, all with costs, and the choice is Sherrylene's because they differ in kind:**
  - *Move the refused id into the stored document.* Satisfies every requirement including across a relaunch, and keeps the offer derived as `plan.md` describes. Costs a change to the persistence contract, which the constitution says must be specified in the plan before implementation — so this needs a plan amendment first, which is why it was not taken unilaterally.
  - *Invert to a positive marker* — offer undo only for a completion this session recorded. Fails closed, needs no stored change, and closes both sequences. Costs undo across a relaunch entirely, and contradicts two tests that currently assert the offer survives one. Note those tests assert more than FR-007 requires: the spec demands undo "immediately after recording", and says the offer must not appear on a freshly opened app.
  - *Accept it as documented.* Defensible given how narrow it is, but FR-007a and FR-007b are written without qualifiers, so this means amending the spec rather than leaving it be.

  **Done: the second option, as decided.** `useSchedule` now holds `recordedThisSession` — the completion id `markDone` minted, cleared when undo is pressed, never set by `addItem`. The offer requires that id *and* that the entry is still the newest by `recordedAt` *and* that it is inside the window; each refuses on its own. The newest-entry check stays because `undoLast` removes the most recently recorded completion, so offering anything else would delete an entry other than the one named. `addItem` now satisfies FR-007b by doing nothing, and does not clear the marker: adding a job with a date makes that completion the newest, so an earlier offer is withheld without help, and adding one without a date is no reason to remove the way back from the user's last tap.

  **The task line above is wrong on one detail.** The two tests asserting survival across a reopen are one per file — `tests/ui/undo.test.tsx` ("still works after the app has been closed and reopened inside the window") and `tests/ui/undo-expiry.test.tsx` ("still offers undo when the app is reopened inside the window"). Both were changed to require the offer's absence *and* that the completion is still stored, so neither can pass against an implementation that withholds the offer by discarding the tick-off; `undo.test.tsx` also asserts the entry is listed in the job's detail-view history. Both sequences above are now tests in `tests/ui/undo-across-relaunch.test.tsx`, observed failing against the old code with the button rendered and named ("Undo recording Gutters as done", "Undo recording Boiler service as done").

  **Two comments left standing that are now weaker than they read.** `undo-expiry.test.tsx`'s "does not resurrect an expired offer when the app is reopened" and "offers nothing on an app opened on old completions" still pass, but session scope alone now satisfies them, so they no longer discriminate mount-relative expiry from completion-relative expiry. The window is still genuinely exercised by "withdraws itself once the window passes" and by the press-time enforcement test, both within one session.
<<<<<<< HEAD

  **The justification above was not true when this task was closed, and is true now (T103, 2026-08-20).** This line says session-scoping is acceptable "because the detail view now shows full history", and `spec.md` and `plan.md` said the same thing in their own words. Showing a mistake is not correcting it: the history was a read-only list of dates, so from 2026-08-11 until T103 landed a user could see the entry that should not be there and could do nothing at all about it. For that week the very property session-scoping had originally been rejected for — a mis-tap being permanent — was live again, in the state the decision was supposed to have made safe, and it read as settled in three documents. The decision itself stands and nothing about undo changed; what changed is that the capability it was discharged against now exists. Recorded here because the failure was not about undo — a decision was closed against a capability nobody checked for.
=======
- [X] T101 [P] **Design refresh: typographic hierarchy** (issue #99). Everything sits at roughly the same size and weight, so a job's name, its status and its due date compete instead of reading in order of importance. Touches `tokens.css` and `app.css` only; do not change markup structure, because the heading and list semantics are what the axe and VoiceOver checks depend on

  **Done, with T100. No markup changed** — not one `.tsx` file was touched, so the heading levels,
  the list semantics and the accessible names US3's dialog rests on are byte-for-byte what axe and
  the VoiceOver pass will see.

  A five-step scale in `tokens.css` (`--text-xs` through `--text-xl`, 13.8px to 23.4px on a 17px
  root) replaces the literals that were scattered through `app.css`. In a row the ladder is now:
  name at 19.1px/600 in `--text`, status at 13.8px/600 in its own hue, date at 13.8px/400 in
  `--text-muted` — three separations (size, weight, colour) where there was previously about half
  of one. Rows also gained padding, a wider gap and a very light shadow, which is what stops the
  list reading as a spreadsheet; the type alone would not have.

  **One inversion found by looking at it rather than by a test, and fixed.** On the job detail
  view `.detail__subtitle` ("Record it as done", "History") was smaller, lighter and muted above
  field labels set in full `--text` — an h3 reading as less important than the label it
  introduces, which is the same competing-for-attention defect this task exists to remove, one
  level down. Subtitles are now 17px/600 in `--text`; labels moved down to 15.9px/600. No test
  in any tier can see this: contrast and layout both pass either way. It was caught by rendering
  each state at 375px and reading the screenshots.
>>>>>>> main

### Found by verifying US3 (2026-08-12)

- [X] T107 [P] **Close three US3 assertions that cannot fail.** All three were found by sabotage after US3 went green, and each lets an obviously wrong implementation ship: (1) **nothing establishes that an edit changes the job you opened** — every editing test seeds one job and reads storage back as `items[0]`, so an `editItem` that ignores `itemId` and always rewrites the first stored job passes all 257 tests. This is the identical defect already fixed on the delete side, where deleting the first of two could not be told apart from `items.slice(1)`. Seed three, edit the middle one, change the name *and* the interval, assert all three of each in storage order. (2) **The singular consequence sentence is rendered under test and never read** — replacing `completion${n === 1 ? '' : 's'}` with a bare `completions`, so the dialog says "1 completions recorded", passes everything. (3) **Focus returning to "Delete job" after a cancel is pinned only in `confirm-dialog.test.tsx`'s own harness**, never in the app, where the opener survives and the wiring differs

  **Done. Five tests, 257 → 262, each accepted on sabotage rather than on a green run**, since all
  three cover behaviour that was already correct. `editItem` rewritten to ignore `itemId` and
  always change `items[0]` fails only the two new "changes only the job that was opened" tests
  (2 failed / 260 passed) — they seed three jobs, edit the middle one, change the name *and* the
  interval together, and read all three names and all three intervals back from storage in seeded
  order. A bare `completions` in the consequence fails only "counts one completion in the
  singular". And focus return was sabotaged on the *app* side rather than in `ConfirmDialog`,
  by remounting the corrections row so the opener is disconnected when the dialog reaches for
  it: the two new app-level tests fail and every test in `confirm-dialog.test.tsx` stays green,
  which is exactly the wiring mistake a harness cannot see.

  **A fourth hole closed on the way**: every edit test typed a number and left the period dropdown
  alone, so an edit form that discarded the unit and re-saved the loaded one would have gone
  unnoticed. The new tests change months to years.
- [ ] T108 **The dialog's containment is verified on one engine, and not the one the phone runs.** Removing `sibling.setAttribute('inert', '')` from `ConfirmDialog` leaves all 257 unit tests green and fails exactly one browser test: the Tab-order sweep in `e2e/focus-visibility.spec.ts`, which skips WebKit by design because Safari does not Tab to buttons unless the user turns that on. So on WebKit nothing establishes that a user cannot leave the dialog and reach the page behind it, and `inert`'s interaction with VoiceOver's rotor is precisely the open question. Not fixable in the browser tier without running a Tab sweep that WebKit would pass vacuously — which is the check the constitution forbids. **Routed to T078 instead**, where it now names the dialog explicitly; recorded here so a green suite is not read as covering it
<<<<<<< HEAD
- [ ] T112 [P] **The hook's decline-to-write guard on removing a completion is undefended.** Deleting `if (corrected === target) return items` from `removeCompletion` in `src/ui/useSchedule.ts` leaves all 296 tests green. Without it, a removal whose target has already gone writes an unchanged document anyway, bumps `revision`, and sends any other open window into stale-write recovery over a write with nothing in it — the exact harm the comment above the line describes, and the same harm `editItem` and `deleteItem` each carry their own guard against. The *domain* half is pinned: `tests/domain/remove-completion.test.ts` asserts `toBe(item)` identity twice and breaking it goes red. It is the hook half — the part that actually reaches `mutate` — that nothing exercises, because it needs a genuine race: a second context removing the same entry between this one rendering the dialog and the user confirming it. `tests/storage/concurrency.test.ts` has the shape. Low severity, since the only cost is a spurious `revision` bump, but the code claims a guarantee nothing holds it to. Found by verification of T103, 2026-08-20. **Also recorded here: a flake seen exactly once** — `tests/ui/reload.test.tsx > coming back later > still has the jobs you added` failed on one sabotage run and then passed on immediate re-run and on eight consecutive isolated runs. Unrelated to the sabotage, not reproduced since, and not worth acting on until it is seen again; noted so a second sighting is recognised as a second rather than a first

- [X] T111 **FR-007b pointed at a correction FR-009 does not provide.** It said a wrong last-done date on a new job "is corrected by editing it (FR-009)", and FR-009 covers the name and the interval only — a Completion is immutable once saved, so the edit form has no last-done field and never had one. Raised on T068 as "unresolved, and Sherrylene's call", and left open because the alternative route did not exist yet. **Done 2026-08-20 by T103**, which is that route: remove the entry from the history and record the right one. FR-007b now says so and names FR-007a rather than FR-009, and `spec.md`'s Key Entities line — "Can't be edited once saved, only undone" — was corrected in the same pass, since removal from the history is now a second way an entry can go. **This task did not exist in `tasks.md` when the work was assigned**; it was described in the brief as already recorded. Added here so the change has a number to cite

=======
- [ ] T109 [P] **Two US3 guards that no test defends.** Neither is wrong today; both are load-bearing and unpinned. (1) **FR-010a and the read-only view**: Edit and Delete are unreachable in a read-only session because `load()` returns an empty document for a too-new file, so there is no job to open — not because of the `readOnly ?` branch that leads `App`'s render. Moving that branch to the end of the ternary leaves all 257 tests green. It cannot be tested through the app today (the read-only document has no items by construction), and `tests/ui/read-only.test.tsx` already records the class of gap — but its header names only "Mark done" and the detail view's "Add" (called "Record it" when T109 was written; renamed by T113) and needs US3's two controls adding. This becomes reachable the moment a read-only session shows the user's data. (2) **`handleDelete`'s explicit `headingRef.current?.focus()`**: deleting the line leaves all 257 green, because `nav.back()` changes the view name and the existing effect focuses the heading anyway. The line closes the window *before* `popstate` arrives, when focus has fallen to `<body>`; whether that window is observable through Testing Library's act-based waiting is not established either way, so the comment on it should say what it protects and that nothing distinguishes it, or the line should go
>>>>>>> main

**The design tasks need no new test tasks.** `e2e/contrast.spec.ts` and `e2e/colour-independence.spec.ts` already check exactly what could go wrong here, on both engines, against real rendered colours — that is the safety net that makes a palette change safe to attempt. Adding jsdom tests for colour would be writing a check that cannot check, which the constitution forbids.

**Not absorbed, and staying manual**: T075 (service-worker update path), T076/T077 (timings needing
a named device), T078 (real-iPhone/Android gate, including home-screen install), T079 (durability
across force-quit and restart). A green e2e suite must not be read as covering these.

### Verification

- [X] T070 [P] Run an axe structural scan across every view and fix violations — **now automated in `e2e/accessibility.spec.ts`**, run on Chromium and WebKit
- [X] T071 [P] Verify no horizontal page scrolling at 375px and every touch target ≥ 44x44px — **now automated in `e2e/layout.spec.ts`**, run on Chromium and WebKit
- [X] T072 [P] Verify status is distinguishable without colour — **now automated in `e2e/colour-independence.spec.ts`**, run on Chromium and WebKit
- [X] T073 **Verify visible focus on every interactive control in a real browser, measuring the focus indicator's contrast** — a bare Principle II MUST that no previous task covered anywhere — **now automated in `e2e/focus-visibility.spec.ts`**, run on Chromium and WebKit
- [X] T074 Measure contrast **per view** in a real browser (DevTools/Lighthouse) against 4.5:1 body and 3:1 large/UI. A token-pair audit at setup does not establish per-view contrast, which is what the constitution's gate requires — **now automated in `e2e/contrast.spec.ts`**, run on Chromium and WebKit
- [ ] T075 Verify the service worker update path, including that the persisted document survives an update (FR-010's "across app updates", previously unverified end-to-end)
- [ ] T076 Measure app-shell start-up against SC-002 on a named device or a stated CPU-throttle factor — "mid-range phone" is not reproducible
- [ ] T077 Time a first-time user recording their first item against SC-001, which had no verification at all
- [ ] T078 **Run the full manual device checklist in plan.md § Running and checking it on a real iPhone and a real Android phone** — SC-006 and Constitution gate 2b. Not automatable
  - **Now also covers touch-free operation.** Constitution v1.4.0 makes VoiceOver on a real iPhone the check that discharges the accessibility gate; automated keyboard traversal is supporting evidence only. So this task must include driving each flow with VoiceOver — swipe between elements, double-tap to activate — for adding a job, marking one done, undoing, and viewing history. Nothing in the repository approximates this.
  - **Extended by US3, 2026-08-12, and three of these are new questions rather than more of the same.** Add: **editing a job** (including changing the interval unit, which is the one control nothing automated operates — jsdom implements no keyboard behaviour for `<select>` at all, so "every six months instead of three" is verified only in the half that is a number input); **deleting a job**; and **the confirmation dialog**, which needs the most attention of anything on this list. Four separate things to check on it, none of which any tier can answer: that VoiceOver announces the dialog has opened rather than leaving the user to discover it; that it reads the question *and* the consequence, since the consequence is carried by `aria-describedby` and is the sentence saying the history is about to go; that the rotor and swipe navigation stay inside the dialog — the app sets `inert` on everything behind it, and whether WebKit honours that for VoiceOver is unverified; and that after cancelling, focus lands back on the control that opened it. Also check the scrim's doubled safe-area insets: a `position: fixed` overlay escapes `.app`'s own insets, so the card is padded separately and nothing has looked at that on a device with a notch.
  - **Extended by T103, 2026-08-20, and one of these is an open design question rather than a check.** Add **removing one completion from a job's history**, which the same dialog now guards, so everything in the paragraph above applies to it again with a different consequence sentence. Two things are specific to it. **The Remove control is the one destructive control the app repeats down a list that grows without limit**, on rows that stack closely, and a mis-tap there is the same class of accident the control exists to repair — jsdom reports a zero-sized box for every element, so nothing in the behaviour tier can tell 44x44 from 4x4, and while the browser tier measures it at 375px on both engines only a thumb can say whether the spacing is enough in the hand. And **two completions recorded on the same date currently produce two controls with the same accessible name** — both "Remove the completion on 5 June 2025" — so a VoiceOver user swiping the rotor meets two identically named destructive controls with nothing to say which row they are on, or which one went afterwards. Same-day duplicates are one of the ways the mistake gets made in the first place, so this is not a rare shape. It is not an axe violation and no jsdom test can settle it; it needs a decision about what the name carries when dates collide.
  - **Partly done, 2026-08-09**: the interval dropdown was checked on a real iPhone in Safari and opens the native wheel picker correctly. Still outstanding: everything else on the checklist, and home-screen install in particular, which cannot be checked over a LAN address because service workers require HTTPS or localhost. A proper HTTPS preview is needed to close this task.
  - **Do not test dropdowns in Chrome's device emulation.** A `<select>`'s option list is drawn by the browser and the OS outside the document — it has no DOM node, no CSS reaches it, and it does not appear in screenshots, so neither Playwright nor a page capture can see it. Under device emulation the page is scaled to a fake phone while that popup is positioned and sized in real screen coordinates, so it renders small and lands top-right instead of under the field. This is an emulation artifact affecting every site with a `<select>`, and it cost an investigation before being recognised. Judge native pickers on a real device only.
- [ ] T079 Verify the data durability checklist: persistence requested, refusal reported honestly, items survive force-quit and device restart (SC-007)
- [X] T080 **Correct `.claude/skills/speckit-tasks/SKILL.md`, which still instructs that tests are optional** — Governance requires correcting the conflicting artifact, not working around it in prose
- [X] T081 **Restore Principle I's three-call-site rule and Complexity-Tracking requirement to `.specify/templates/plan-template.md` gate 1**, and Principle II's text-alternatives and verified-before-complete clauses to gate 2. The template's gates are currently weaker than the principles they cite
- [X] T082 **Add 44x44 touch targets to `.specify/templates/spec-template.md`'s mandatory criteria** — a Principle II MUST that would otherwise be silently omitted from every future spec
- [ ] T083 [P] Write `README.md` covering run, test, build, and stating plainly that data is device-bound with no export
- [ ] T084 Re-run `/speckit-analyze` after remediation and confirm the findings are closed

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → **User Stories (3–5)** → **Polish (6)**
- **Critical paths in Foundational**: `T010 → T031/T032/T033` (Storage API); `T011 → T038` (iOS back affordance); `T037` (shared notice surface) must precede `T033`
- **US1, US2, US3** each depend only on Foundational. The full repository write path now lands in T028, so **US2 no longer depends on a Phase 5 task**
- **Known cross-story coupling** (was previously claimed absent): US2's T060 edits `ItemRow.tsx` from US1's T049, and US3's T069 edits `ItemDetailView.tsx` from US2's T059. Stories are independently *testable* but not independently *buildable* in arbitrary order — build in priority order

---

## Parallel Opportunities

Every `[P]` group below was checked for file collisions.

- **Phase 1**: T005, T006, T008, T009. T003/T004/T007 all edit `vite.config.ts` — sequential
- **Phase 2 domain**: T013, T015, T016, T017, T018, T020 — six distinct test files
- **Phase 2 storage**: T022, T023, T024, T025, T026, T027 — distinct files
- **Phase 3**: T040–T046 — seven distinct test files
- **Phase 4**: T053–T058 — six distinct test files
- **Phase 5**: T063–T066 — four distinct test files. **T067 is not in fact parallel with T068 and T069**, and its `[P]` marker is wrong: `ItemDetailView` imports `ConfirmDialog`, so T069 cannot be written against a component that does not exist. Built in the order T067 → T068 → T069

```bash
# Phase 3 — genuinely parallel, one file each:
Task: "tests/ui/empty-state.test.tsx"
Task: "tests/ui/item-form.test.tsx"
Task: "tests/ui/schedule-list.test.tsx"
Task: "tests/ui/reload.test.tsx"
Task: "tests/ui/duplicate-names.test.tsx"
Task: "tests/ui/keyboard-us1.test.tsx"
Task: "tests/ui/axe-us1.test.tsx"
```

---

## Implementation Strategy

1. Phase 1 Setup
2. Phase 2 Foundational — largest phase, because this feature carries the shell, persistence, navigation, and test harness every later feature inherits. Not a template for future features
3. Phase 3 → **STOP and VALIDATE**: use it for your own flat for a few days
4. Phase 4, then Phase 5
5. Phase 6 — the verification that makes it releasable

---

## Notes

- **Verify tests fail before implementing** — a test that passes on first write is testing nothing
- **Two unverified platform claims are gated**: Storage API behaviour (T010) and the iOS back affordance (T011). Neither may be implemented against an assumption
- **Still open, deliberately out of this remediation pass**: write-failure handling (quota exceeded, Safari private browsing) has no requirement or task; the `.recovered.*` key has no path back to the user; `recordedAt` ordering assumes a monotonic device clock. Each is a real gap, recorded here rather than silently dropped

---

## Phase 7: Convergence

Appended 2026-08-12 by `/speckit-converge`. These are gaps between what the spec, plan and
constitution now require and what the code does. Two of them are new because the **constitution
changed**, not because the code did: v1.5.0 added Principles IV and V an hour before this ran.

- [ ] T110 **CRITICAL — colour is defined outside `tokens.css`** per Constitution V (contradicts). `src/ui/focus.css` defines `--focus-ring` and `--focus-ring-inner` itself; `src/ui/app.css` carries eight colour literals. All of it predates the amendment. Move what can move. **Two genuinely cannot and must be recorded as exceptions rather than quietly left**: the `select` chevron is a data URI, which cannot read a custom property, and the dialog scrim needs alpha, which a hex token cannot supply without restating the value. Where an exception stands, put the reason beside it — an unexplained literal is indistinguishable from an oversight
- [ ] T119 **MEDIUM — the manifest's colours sit where no stylesheet reaches and no tier reads** per Constitution V (partial). `theme_color` in `vite.config.ts` and the `theme-color` meta in `index.html` held the *original* palette through two complete design passes without anything noticing — an installed app opened with a status bar belonging to neither palette. They are correct now. Add a note at the token definitions saying these two must move with them, or a check that compares them; the failure mode is silent and will recur

**Recorded here rather than made a task: Constitution IV is currently violated and 001 does not own the fix.** The app has no top-level structure — Principle IV requires one from which every feature is reachable, and `plan.md` R4 rejected a router on reasoning that has since been annotated as conditional. That is cross-cutting work belonging to its own feature specification, not to the maintenance schedule. Recorded so the violation is visible from this file rather than only from the constitution.

**Was "not a task": the wording on the job detail view. Settled 2026-08-12 and built.** It stated one action three ways — a "Record it as done" heading, a "Date it was done" label, and a "Record it" button — alongside "Every 1 year" and single dates given full cards. Copy was Sherrylene's to settle rather than something to specify unilaterally, and she settled it. Recorded as T113 below with what was actually changed, because the paragraph above described a screen that no longer exists.

- [X] T113 **The detail view says each thing once, and the storage warning is said where the user lands** (`design/refresh`, 2026-08-12). Six copy and placement changes, tested before any of them existed — the test-only commit is 27 failed / 271 passed, and the implementation commit touches no test file.

  **Five on the detail view.** The `<h3>` "Record it as done" is gone: the field's label explains and the button acts, which is the ordinary division of labour between the two, and the heading was a section title for a single field. The label is now "Add a date you did it" and the button is "Add", beside the field rather than beneath it. `formatInterval` in `src/ui/format.ts` drops the count when it is 1 **and only then** — the tempting implementation keys off the unit, which reads correctly on the annual job that prompts the change and turns "Every 3 months" into "Every month", so the matrix in `tests/ui/detail-interval.test.tsx` walks four units at counts 1, 2, 3 and 10, and the twelve plural rows carry as much weight as the four singular ones. The interval and the last-done fact merged onto one line with an `aria-hidden` middle dot, as drawn in the agreed shape. History entries lost their cards: a card holds something with parts, and these hold one date each. The empty-field error moved from "Choose the date it was done." to "Add the date you did it." so the removed phrasing does not survive in the one place it would still be read aloud.

  **One on the shell.** `StorageNotice` renders on the schedule list only, from a `showingScheduleList` derived from what `<main>` actually renders rather than from `nav.view.name` — the two disagree when a `detail` or `edit` route points at a job another window deleted, and the route version left the warning off a screen that was, to the user, the list. Dismissal is unchanged.

  **What no tier can establish, and what was found by sabotage rather than by a green run.** Four wrong implementations survived the first pass at 297 unit and 134 browser tests: hiding the warning on an empty list (the first run is the launch it exists for), showing it in a read-only session (FR-010a: that screen's contract is that there is nothing to press), replacing the visible `<label>` with an `aria-label` (`getByLabelText` cannot tell the two apart), and keying the notice on the route. All four now fail. The button-beside-field arrangement is checked in `e2e/layout.spec.ts` against real engine boxes, since jsdom lays nothing out. The history entries no longer being cards is **not** pinned anywhere, deliberately: asserting "no border, no radius, no shadow, transparent" pins the absence of decoration that a hairline separator would legitimately restore, and `e2e/contrast.spec.ts` already re-measures those entries against whatever they now sit on. That the label is *painted* where a sighted user expects it is likewise unpinned — jsdom loads no stylesheet, so a `.visually-hidden` span would satisfy the test that exists.
- [ ] T114 [P] **`interval.count` is validated nowhere, and one display rule now leans on it.** `src/storage/repository.ts` checks only `typeof it['interval'] === 'object'` — nothing establishes that `count` is a number, an integer, or positive. The add form refuses those (`ItemFormView`), so today the only way in is a hand-edited document or a future writer, but `formatInterval`'s `count === 1` is indistinguishable from `count <= 1` given any fixture set a test would reasonably use, and `"1" === 1` is false, so `count: "1"` would render "Every 1 years". Found by sabotage during T113 and **left alone on purpose**: what the app should display for a count of zero is undefined by the spec, so a test asserting an answer would be writing the spec rather than checking it. Either the repository rejects the document, or the spec says what a nonsense interval reads as. Not both, and not neither
- [ ] T115 [P] **The edit form is now the only place in the app that says "every 1 years".** `ItemFormView` renders "How often — every | 1 | years" as a label, a number input and a period dropdown, so opening the annual boiler job for editing shows the grammar T113 removed from the view beside it. It is a control rather than a statement of the schedule, which is why it is not the same defect — a dropdown cannot sensibly re-label itself as the number changes without moving focus under the user. Recorded because it is the last survivor, and because the fix is a copy decision rather than a technical one

  **Still open after T116, and the label it quotes has changed.** T116 shortened that label to "Every", so the row now reads "Every | 1 | years" rather than "How often — every | 1 | years". The grammar this task is about is untouched: a job that comes round yearly still reads "Every 1 years" on the form while the view beside it reads "Every year". Nothing here has been decided — the copy question is Sherrylene's and she has not been asked it

- [X] T116 **The interval fieldset asked the same question twice, and now asks it once** (`design/refresh`, 2026-08-19). Reported by Sherrylene from using the app; recorded nowhere before this, and *not* what T115 above describes — T115 is about the grammar of "every 1 years", which this does not touch.

  **The change.** The `<legend>` read "How often does it need doing?" and the `<label>` one line beneath it read "How often — every". The legend keeps the question; the label is now "Every".

  **Why the input also references the legend through `aria-labelledby`.** The premise the change was requested on — that a `<legend>` is announced with each field inside its fieldset, so the field would be heard as the question plus "Every" — does not hold, and was checked against `dom-accessibility-api` before anything was written. A legend names the fieldset's **group**, not the controls inside it, so shortening the label alone computes this input's accessible name to a bare "Every": thinner than the self-contained "How often — every" it replaced, which Principle II does not permit trading for a tidier screen. The explicit reference restores the intended name — "How often does it need doing? Every" — without depending on whether a given screen reader announces group names at all. **The cost is recorded rather than hidden**: where the group name *is* announced, the question is heard twice. Which of the two reads better is a VoiceOver question and is on the device checklist below, not settled here.

  **Fifteen lookups moved, and that was the risk.** Seven test files drove this field by `getByLabelText(/how often/i)`, plus one `page.getByLabel` in `e2e/support/app.ts`. All are re-anchored on `^every$`. `/how often/i` would have gone on matching the input through the `aria-labelledby`, so it can no longer be observed failing and is not evidence of anything; `edit.test.tsx`'s `countField` helper now also asserts it resolved to an `input[type=number]`, because the failure worth catching is the query drifting onto the period `<select>` beside it. Red run before implementation: 32 failed / 278 passed / 310 total, the seven failing files being the seven touched. Green after: 310 unit, and the browser tier unchanged at 136 passed / 12 skipped — which is also what establishes that `label` plus `aria-labelledby` does not trip axe's `form-field-multiple-labels`.

  **Two things independent verification found afterwards, neither of them a regression.** The validation error — "How often it comes round must be a whole number, at least 1." — renders **inside this same fieldset**, so an invalid count puts "How often" back on screen twice: once as the question, once as the error. A question and an error are not the same duplication, and no test trips on it today because none of the new cases submits an invalid form. But the "asked once" test counts `/how often/gi` across the whole fieldset, so adding an error-state case to that `describe.each` would fail it for a reason unrelated to what it is testing. Recorded before someone does. Separately, the `exact` on the e2e lookup was justified in a comment by an ambiguity that does not exist — a loose `getByLabel('Every')` resolves to one element in both engines. The anchor is worth keeping; the reason beside it was corrected rather than left for a future reader to trust.

  **The T113 gap applies here unchanged.** Nothing establishes that "Every" is *painted*. The test asserts the text lives in a `<label>` element, which is the T113 lesson applied and would catch someone swapping it for an `aria-label` — but jsdom loads no stylesheet and the contrast walk only samples what is visible, so a `.visually-hidden` on that label would satisfy both tiers. The same is true of the legend.

  **Two things this does not settle.** What VoiceOver actually announces on an iPhone — no tier here reaches it (Principle II, Constitution v1.6.0), and both the add and the edit form need swiping onto the interval box with the result written down. And the layout: `.form__field--inline` in `src/ui/app.css` gives the visible label `grid-column: 1 / -1`, so "Every" renders on its own full-width row above the number and unit rather than inline with them. Measured in WebKit at 375px — legend at y=233, label at y=257, both boxes at y=289 — before and after the change, identical. The shape the fix was sketched against puts the three on one line. Making that happen is a grid change, not a copy change, so it was not made

- [X] T117 **The app bundles its own typeface, and the type scale was re-judged around it** (`design/refresh`, 2026-08-20). Reported by Sherrylene from using the app: the fonts look **generic**, and the **weights and sizes** are wrong. Two complaints, and they need different answers.

  **Settled: Source Sans 3, chosen by Sherrylene from screenshots on 2026-08-20.** Three candidates were built rather than one described, each complete on its own branch — vendored woff2, self-hosted, precached, OFL 1.1, variable weight axis, tests, and the plan's dependency budget corrected with that candidate's real shipped size — and screenshotted at 375px in WebKit from the committed state of each. **A — Source Sans 3** alone, 28,740 bytes: chosen. **B — IBM Plex Sans** alone, 45,712 bytes, more character of its own and 10% wider, which costs a size step because a job's name runs out of room sooner. **C — Newsreader over Source Sans 3**, 86,824 bytes, serif headings, the strongest answer to "generic" and the one that more than doubles a first load.

  The losing branches are deleted. Their commits were `701b268` (B) and `41fb007` (C), recoverable with `git branch <name> <sha>` until they are garbage-collected; nothing in them is needed and neither is worth keeping alive as a branch. Why one face rather than two is recorded beside `--font-heading` in `src/ui/tokens.css`, which is where anyone tempted to try the split again will be standing.

  **"Generic" is not fixable on the system stack**, which is the Principle I justification and is recorded in `plan.md` § Dependency budget. The stack was `-apple-system, …` — San Francisco on the phone this is for. A good typeface, free in every sense, and the default, which *is* the complaint. Nothing in the existing dependencies can synthesise a typeface. The file is vendored rather than depended on: `@fontsource-*` publishes exactly these files as packages and we take the file and leave the package.

  **Self-hosted because it must work offline, and that was already broken before anyone noticed.** `workbox.globPatterns` did not cover `woff2`, so Vite copied the font into `dist/fonts/` and workbox left it out of the precache manifest — an installed launch with no network would have fetched nothing and fallen back to the system stack, legibly, so nobody would have reported it. A third Vitest project, `build`, now runs the production build and reads what workbox actually wrote. It was red before the config changed.

  **"Weights and sizes" is a separate fix and it needed measuring, not taste.** Each face's x-height and set width were measured in WebKit against the system stack and the scale re-judged from those numbers rather than transposed — see the type section of `src/ui/tokens.css` on each branch for the reasoning and the consequences, which differ per face. The root size moved into a token (`--text-root`); weights became tokens too, and are chosen per size rather than picked from four static cuts, which is what the variable axis is for. Heading leading dropped from the body's 1.5 to ~1.25, so a job name long enough to wrap reads as one name.

  **Two floors held deliberately, not by luck.** No step reaches 24px and no weight reaches 700, so `requiredTextRatio` in `e2e/support/colour.ts` keeps every text node on WCAG's full 4.5:1 rather than the relaxed 3:1 — verified against 207 rendered samples across twelve states and two engines, not against the comment. And **the palette is untouched**: 17 colour tokens, 47 recorded ratios and both `rgba()` values in `app.css` are byte-identical to `design/refresh` on all three branches. The colour is still under review and a typeface change that also moved it would make that verdict impossible.

  **What the tests do not establish, and it is not small.** How any of this looks on a real iPhone at 3× — nobody has seen it on a phone, and typography is the one thing where that matters most. Whether the first-load swap from the fallback to the bundled face is a visible reflow worth adding a `<link rel="preload">` for; it happens once per install and was left alone rather than solved by a filename duplicated where nothing checks it. And now that a single face won, the `--font-heading` route is checked by nothing: setting that token to something invalid makes the property invalid at computed-value time, so it inherits `--font` — the same face — and every heading is still right for the wrong reason. That was a false claim in a comment before independent verification measured it (198.16px either way). It becomes a real check only if a second face is ever introduced. Recorded in `e2e/typeface.spec.ts` beside the sample it applies to, and beside `--font-heading` in `tokens.css`.

  **Not discharged by this task: the accessibility gate.** Constitution v1.4.0 makes VoiceOver on a real iPhone the check that counts, and no tier here reaches it. Every view changed size, weight and leading, so every flow wants re-driving: the schedule list, marking done, the undo offer, the add and edit forms, and the delete confirmation. That belongs to T078 and T078 is still open. The automated keyboard traversal that did run is supporting evidence and does not discharge it alone

- [X] T118 **The app has a mark, and the icons stopped being two palettes stale** (`design/mark`, `design/mark-b-window`, `design/mark-c-door`, 2026-08-20). Reported by Sherrylene from looking at the app: the logo is **very plain**. It was worse than plain, and the second half of this was not reported by anyone because nobody could see it.

  **Open: which candidate.** Three are built, each on its own branch, each complete — inline SVG in the header, the three home-screen PNGs regenerated, tests in all three tiers, `plan.md`'s dependency budget updated. `design/refresh` is untouched. Nothing is chosen; screenshots are the deliverable, at `~/Desktop/my-flat-pal-mark/`, with `all-three.png` as the side-by-side. **A — the block**: the building a flat is in, three storeys and a way in at street level. **B — the window**: four panes on a sill, symmetrical, so it loses detail evenly as it shrinks. **C — the door**: a front door on its threshold with a handle; the most legible small, and the one closest to the generic "exit" glyph. When one is chosen the other two branches are deleted and this task records which and why.

  **The icons were the actual defect.** `public/icons/*.png` were a generic white house on `rgb(26, 26, 23)` — a warm near-black that appears nowhere in `tokens.css`. They were drawn in the app's **first** palette and survived two complete design passes untouched. Nothing caught it and nothing could: no stylesheet reaches a PNG and **no test tier had ever opened one**. It is the same class of drift T112 is still open about, where the manifest's `theme_color` sat two palettes behind the app.

  **`tests/assets/icons.test.ts` is the check that was missing**, and it is a fourth Vitest project rather than a fourth file in the build tier, because that tier runs a full production build and nothing about an icon needs one. Both sides of every colour comparison are parsed out of `src/ui/tokens.css` at test time, so what is asserted is "the icons are the colours the app is" rather than "the icons are teal" — a hard-coded hex would go green on the day the palette moves and the icons do not, which is the defect with a passing test on top of it. It also checks the maskable safe zone against the pixels: every pixel further than `0.4 × 512` from the centre must be bare ground, since Android crops to a shape of the launcher's choosing. Red before the icons were regenerated: **7 failed / 321 passed of 328**, all seven in that file. Decoding a PNG needed `zlib`, which Node ships, plus a chunk walk and five scanline filters — about ninety lines in `tests/support/png.ts`, rather than an image library for one call site.

  **The heading announces exactly what it announced before.** The mark is `aria-hidden` with no `role` and no `<title>`, inside the `h1` rather than beside it, so the accessible name is still "my flat pal" and still said once. **This is the part a green suite does not establish on its own**: `tests/ui/mark.test.tsx` passes before *and* after, because everything in it says something must not change. Its capability to fail was shown by sabotage instead — `role="img" aria-label="my flat pal"` makes the name "my flat pal my flat pal" and fails four of six; a `<title>` describing the drawing makes it "A block of flats my flat pal" and fails two. **axe stayed green through the first of those**, which is the argument for the file existing: a decorative mark labelled with the wordmark is a perfectly valid `img` with a name as far as axe is concerned.

  **Contrast measured, not estimated.** White on `--accent` is **7.35:1** in both Chromium and WebKit, read off the `fill` and `stroke` the engines resolved and computed with `e2e/support/colour.ts`. WCAG 1.4.11 asks 3:1 of a non-text interface component. **No colour was introduced into the app** — both values are tokens it already had, which is what makes the mark the same object as the accent every interactive thing is drawn in. `scripts/screenshot-mark.mjs` does carry four literals, for the fake wallpaper and captions of the review contact sheet; the reason is written beside them, and judging an icon against the app's own palette would be the wrong test anyway.

  **No dependency was added**, and `git diff d0e0793..HEAD -- package.json package-lock.json` is empty. The PNGs are rasterised with Playwright, already a devDependency for the browser tier; a browser is the one thing in this repository that already turns SVG into PNG. Recorded in `plan.md` § Dependency budget, because it changes what a dependency is *for* even though it adds no package. Two **undeclared imports** were introduced and then removed rather than lived with: the scripts imported bare `playwright`, which is only a transitive child of `@playwright/test` — now imported from the declared package, which re-exports `chromium` — and `tests/ui/mark.test.tsx` imported `dom-accessibility-api`, three levels down under Testing Library. That one now goes through Testing Library's own `getByRole({ name })`, which runs the same computation through a package we declare, and the local type shim it needed is deleted. Both would have failed loudly rather than silently, but "no dependency was added" and "two imports of packages nobody declares" are different statements.

  **Three things independent verification found afterwards, and all three were real.** (1) **The mark could be made invisible with every test green.** `opacity: 0` on `.mark__outline` left all six browser tests passing, because `getComputedStyle` reports a stroke colour on a hidden element; the header drew a bare teal tile and nothing noticed. `e2e/mark.spec.ts` now screenshots the mark and counts pixels, which also closes a second hole — a literal `#ffff00` in place of `var(--surface)` passed the contrast, colour and axe sweeps together, so **Principle V was enforced for the icons and not for the header**. That test caught a trap of its own on its first run: `--surface` is both the mark's colour and the header's background, so the rounded tile's corners counted as figure and the hidden mark still measured 10.08%; it now samples only inside the tile. (2) **The icons could be any drawing at all.** `icons.test.ts` is entirely about colour — replacing `icon-192.png` with a white square and `icon-512.png` with the old generic house, both in the correct palette, left the suite green at 328 of 328. `tests/assets/icon-geometry.test.ts` now redraws each icon from `src/ui/mark.ts` through the generator's own code and compares pixels; the white-square sabotage fails it with 10,064 of 36,864 pixels differing. This closes the gap the first version of this task recorded as "left open on purpose" — it was cheap after all. (3) **Three measured percentages in a comment were measurements of other files** (13.6/13.4/6.8 against the real 19.42/20.21/11.12), and the `focusable="false"` rationale claimed an axe violation that no tier here observes. Both corrected in place.

  **What that costs.** `tests/assets/icon-geometry.test.ts` launches Chromium, so `npx vitest run` now needs Playwright's browsers installed. That is already true of the browser tier and the whole file runs in about a second, but it is a real extension of what the unit suite requires. `scripts/mark-svg.mjs` became `scripts/mark-svg.ts` so the test can import the generator's actual code rather than a reimplementation of it — a reimplementation being exactly how a test comes to agree with a bug.

  **Found on the way, and fixed: the browser tier was being served by a different checkout.** `playwright.config.ts` hard-coded port 5173 with `reuseExistingServer` on outside CI. This repository is worked on in several git worktrees at once and `vite` in any of them binds that port, so whichever checkout started a dev server first answered every browser run started from any of them — silently, with nothing in the output naming the tree that replied. Observed both ways within minutes: red against a checkout without the change, green against one without the fix. `PLAYWRIGHT_PORT` now overrides it. **The "136 passed" baseline recorded against T116 and the 146 measured at the start of this task were both very likely measured against the main checkout rather than the branch under test.**

  **Two things this does not settle, and neither is small.** How any of it looks on a real iPhone at 3× — whether the mark holds beside the wordmark at the header's real size, and whether an icon that reads at 48px in a browser reads at 48px on a springboard among thirty others. And, for candidate C specifically, whether an arch-headed opening is read as a front door or as the "exit" glyph that signposting has used for decades; the handle is what distinguishes them and the handle is the first thing to disappear as the icon shrinks. Both are judgements about a rendered image on a device, and no tier here reaches one (Principle II, Constitution v1.6.0). They belong with T078.

  **One gap narrowed, and what is left of it.** Nothing compares the header's rendered SVG against the rasterised PNG *directly*. Both are now pinned to `src/ui/mark.ts` from their own side — the browser tier counts the painted pixels of the header mark, the asset tier redraws the icons through the generator — so a change to the shared geometry moves both and a change to either consumer alone fails on that side. What is still unpinned is the relationship: the two use different scale fractions (`MARK_SCALE.header` 0.66 against `icon` 0.7), and nothing says they should look like the same object at their two sizes. That is a design judgement about two rendered images, which is what the screenshots are for.
