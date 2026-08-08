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

- [ ] T053 [P] [US2] Failing tests in `tests/ui/complete.test.tsx`: marking a due item done removes it from the attention group and schedules the next occurrence (FR-006); it takes no more than two taps from the main view (SC-004); **the completion survives a reload** (the defect that made US2 depend on a Phase 5 task)
- [ ] T054 [P] [US2] Failing tests in `tests/ui/undo.test.tsx`: undo restores the exact prior state including the previous due date; **undo still works after the app is closed and reopened** (plan.md § Data model — session-scoping was removed because it made a mis-tap permanent)
- [ ] T055 [P] [US2] Failing tests in `tests/ui/backdate.test.tsx`: a completion may be backdated; a future `completedOn` is rejected; a backdated completion older than the newest one adds to history **and gives the user feedback that nothing about the schedule changed** (previously a silent no-op contradicting FR-006)
- [ ] T056 [P] [US2] Failing tests in `tests/ui/item-detail.test.tsx`: last-done date is shown (US2 scenario 2); completion history lists newest first (FR-008)
- [ ] T057 [P] [US2] Failing test in `tests/ui/keyboard-us2.test.tsx`: mark-done, undo, and viewing history are each completable by keyboard alone (SC-005 — "every flow")
- [ ] T058 [P] [US2] Failing test in `tests/ui/axe-us2.test.tsx`: axe scan of the detail view reports no violations

### Implementation for User Story 2

- [ ] T059 [US2] Build `src/ui/views/ItemDetailView.tsx` showing last-done and history, with a visible back control to the schedule (T011)
- [ ] T060 [US2] Add the mark-done action to `src/ui/components/ItemRow.tsx`, reachable in one tap
- [ ] T061 [US2] Add the durable undo affordance to `src/ui/App.tsx`
- [ ] T062 [US2] Wire completion and undo through the repository (write path already exists from T028)

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
