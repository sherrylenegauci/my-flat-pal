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

- [ ] T063 [P] [US3] Failing tests in `tests/ui/edit.test.tsx`: changing name or interval saves, the due date updates immediately, and **the edit survives a reload**
- [ ] T064 [P] [US3] Failing tests in `tests/ui/delete.test.tsx`: deletion asks for confirmation; the confirmation states that history is discarded; **confirming actually removes the item from the schedule**; **cancelling leaves it in place** — US3's Independent Test, which no previous task asserted
- [ ] T065 [P] [US3] Failing test in `tests/ui/confirm-dialog.test.tsx`: the dialog traps focus, is dismissible by keyboard, and passes an axe scan
- [ ] T066 [P] [US3] Failing test in `tests/ui/keyboard-us3.test.tsx`: editing and deleting are completable by keyboard alone (SC-005)

### Implementation for User Story 3

- [ ] T067 [P] [US3] Build `src/ui/components/ConfirmDialog.tsx` with focus trapping and keyboard dismissal
- [ ] T068 [US3] Extend `src/ui/views/ItemFormView.tsx` to handle editing
- [ ] T069 [US3] Wire edit and delete into `src/ui/views/ItemDetailView.tsx` (repository write path already exists from T028)

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
- [ ] T100 [P] **Design refresh: colour and personality** (issue #99). The app is near-monochrome — white cards on grey, one blue accent, status as small coloured text — and reads as a spreadsheet rather than something for a home. Constraints: Principle I forbids a component library, so this is CSS and tokens; status MUST NOT be carried by colour alone, which `e2e/colour-independence.spec.ts` enforces; 375px first; 44×44 targets hold. **Every ratio must be computed, not estimated** — `tokens.css` once carried twelve ratios recorded as measured that were all estimates, and `focus.css` claimed 3.6:1 for a ring that measured 2.69:1. `e2e/contrast.spec.ts` now checks this against real browser-resolved colours on both engines, so a careless palette turns the suite red rather than shipping
- [ ] T102 **The undo offer's refusal does not survive a relaunch — needs a decision before it can be fixed** (FR-007a, FR-007b). Numbered after the design tasks because it was found after them, by verification of T097; it is not lower priority than them. The offer is derived from the stored document, but the one id the app refuses to offer lives in a React ref, so a relaunch resets the refusal without resetting the offer. Two sequences, both reproduced by probe three times independently:

  1. Add a job with a last-done date. No offer, correctly. Reopen the app within ten seconds and the offer is there — "Undo recording Gutters as done". Pressing it leaves storage at `{"Gutters":[]}` and the row reads "Never done". That is the exact outcome FR-007b exists to prevent.
  2. Tick off Boiler, tick off Alarms two seconds later, press undo once. Correctly no second offer. Reopen within the window and the offer returns naming Boiler; pressing it removes Boiler's tick-off too. Two presses, two completions, separated only by a relaunch — FR-007a's "repeated use MUST NOT walk backwards through history".

  **Bounded, not unbounded.** The window still holds, so only completions recorded in the last ten seconds are reachable and the 2020/2022/2024 history that started all this is not. Both entries a user could lose this way are ones they made seconds earlier. This is a much smaller defect than the one T097 fixed, but it is the same defect.

  **Three fixes, all with costs, and the choice is Sherrylene's because they differ in kind:**
  - *Move the refused id into the stored document.* Satisfies every requirement including across a relaunch, and keeps the offer derived as `plan.md` describes. Costs a change to the persistence contract, which the constitution says must be specified in the plan before implementation — so this needs a plan amendment first, which is why it was not taken unilaterally.
  - *Invert to a positive marker* — offer undo only for a completion this session recorded. Fails closed, needs no stored change, and closes both sequences. Costs undo across a relaunch entirely, and contradicts two tests that currently assert the offer survives one. Note those tests assert more than FR-007 requires: the spec demands undo "immediately after recording", and says the offer must not appear on a freshly opened app.
  - *Accept it as documented.* Defensible given how narrow it is, but FR-007a and FR-007b are written without qualifiers, so this means amending the spec rather than leaving it be.
- [ ] T101 [P] **Design refresh: typographic hierarchy** (issue #99). Everything sits at roughly the same size and weight, so a job's name, its status and its due date compete instead of reading in order of importance. Touches `tokens.css` and `app.css` only; do not change markup structure, because the heading and list semantics are what the axe and VoiceOver checks depend on

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
- **Phase 5**: T063–T066 — four distinct test files

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
