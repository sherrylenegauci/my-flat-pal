---
description: "Task list for the app shell"
---

# Tasks: App shell

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: MANDATORY per Constitution Principle III (Test-First, NON-NEGOTIABLE). Test tasks come
before the implementation they cover, and each MUST be observed failing for the right reason first.

**This feature is the first to carry the v1.7.0 rule.** Journeys in the real-browser tier are
written as behaviour scenarios traceable to the acceptance scenario they cover, using
`playwright-bdd`. Rendering sweeps stay plain Playwright — Given/When/Then around a contrast
measurement has no user and no journey to trace to. **The dependency is not discharged by that
rule**: T001 owes Principle I an argument, and may conclude the cost is not worth paying.

**Nothing blocks this.** Every other planned feature is waiting on it — 003 records itself as
unreachable until this exists.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 **Justify or reject `playwright-bdd` in `plan.md` § Decisions, then act on that.** Constitution v1.7.0 records it as the tool for journey tests and explicitly does *not* discharge Principle I. Record the shipped size, the build step it adds, and the third test tool it makes. **A conclusion that the cost is not worth paying is a legitimate outcome** and must be written down as one rather than avoided. If adopted, add it and wire the generation step into `package.json`
- [ ] T002 [P] Add a `journeys` Playwright project in `playwright.config.ts` pointed at the new feature files, separate from the rendering sweeps. **Give it its own port** rather than reusing 5173 — `reuseExistingServer` on a hard-coded port silently pointed three separate agents at the wrong checkout during 001, and this is the moment a second project makes that worse

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Both stories stand on the navigation change.** Nothing renders until the stack knows about areas.

- [ ] T003 [P] Failing tests in `tests/ui/navigation-areas.test.tsx`: `View` carries an area; `switchTo` changes the current area; each area keeps its own stack; `canGoBack` is false at an area's first screen and true below it (FR-007)
- [ ] T004 [P] Failing tests in `tests/ui/navigation-reset.test.tsx` (FR-003): going several screens into an area, switching away and returning shows that area's **first** screen, not where the user left off
- [ ] T005 [P] Failing tests in `tests/ui/navigation-history.test.tsx`: a history entry records the area it belongs to, and the system back gesture returns within the same area rather than crossing into another. **This is the subtle one** — plan.md § D2 names it as the handful of lines most likely to be wrong, and 001's T011 established the Android back gesture is live in an installed app
- [ ] T006 Implement areas, per-area stacks and `switchTo` in `src/ui/navigation.ts` to pass T003–T005

**Checkpoint**: the app knows what an area is. Nothing on screen has changed.

---

## Phase 3: User Story 1 - Move between the parts of the app (Priority: P1)

**Goal**: any area is reachable from any screen in one action, and switching returns you to that area's top.

**Independent Test**: from anywhere in one area, reach another in one tap, and get back the same way.

### Tests for User Story 1 (MANDATORY) ⚠️

- [ ] T007 [P] [US1] **(FR-001, FR-002)** Failing tests in `tests/ui/tab-bar.test.tsx`: the areas are visible from every screen; tapping one moves to it in a single action; tapping the current area's own tab while already at its first screen does nothing jarring (US1/AC4)
- [ ] T008 [P] [US1] **(FR-008, negative)** Failing test in `tests/ui/tab-bar-hidden.test.tsx`: with only one area, **no tab bar is rendered at all** — not an empty bar, not a bar of one. **Prove it by sabotage**: render it unconditionally and confirm this test goes red. This project has twice shipped MUST NOTs whose tests could not fail
- [ ] T009 [P] [US1] **(FR-010)** Failing test in `tests/ui/areas-unchanged.test.tsx`: adding, completing and editing a job behave exactly as before. This feature adds a frame and changes nothing inside it, and that claim needs a check rather than an assurance

### Implementation for User Story 1

- [ ] T010 [US1] Build `src/ui/components/TabBar.tsx` — the only new component
- [ ] T011 [US1] Render it from `src/ui/App.tsx`, routing on area as well as view name
- [ ] T012 [US1] Lay it out in `src/ui/app.css`, pinned to the bottom edge with `env(safe-area-inset-bottom)` (plan.md § D4). Colours from `tokens.css`; Principle V allows no local colour

**Checkpoint**: with one area the app looks exactly as it does today. With two, you can move between them.

---

## Phase 4: User Story 2 - Know where I am (Priority: P2)

**Goal**: the current area is obvious, including to someone who cannot see the screen.

**Independent Test**: open each area in turn and confirm the current one is distinguishable — with colour ignored, and by someone who cannot see the screen.

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T013 [P] [US2] **(FR-004, FR-005)** Failing tests in `tests/ui/tab-current.test.tsx`: the current area is marked as current in the accessibility tree, and each tab is identifiable by name
- [ ] T014 [P] [US2] **(FR-006)** Failing test in `tests/ui/tab-focus.test.tsx`: switching areas moves focus to the start of the new area rather than leaving it where the old screen was. 001 learned this the hard way — focus falling to `<body>` returns a non-sighted user to the top of the document with nothing announced
- [ ] T015 [P] [US2] **(FR-004)** Failing test in `e2e/rendering/tab-colour-independence.spec.ts`: with colour stripped, the current area is still identifiable. `e2e/colour-independence.spec.ts` already knows how to do this; extend rather than reinvent

### Implementation for User Story 2

- [ ] T016 [US2] Mark the current area in `src/ui/components/TabBar.tsx` — by more than colour, and correctly in the accessibility tree
- [ ] T017 [US2] Move focus to the new area's heading on switch, in `src/ui/App.tsx`

**Checkpoint**: both stories work independently.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T018 **Write the journey as a behaviour scenario** (Constitution v1.7.0). A feature file naming the acceptance scenarios it covers — move between areas, return to an area's first screen — run through whatever T001 concluded. **If T001 rejected `playwright-bdd`**, write the journey as a plain Playwright spec and record why the scenario link is prose rather than machinery
- [ ] T019 **Guard SC-002, which this feature is most likely to break.** The maintenance list fits four jobs above the fold at 375×812 with about 46 pixels of headroom, and a bottom bar spends some of it. Nothing guards it today — 001's tasks already record "without scrolling" as unguarded. Add a browser-tier check that the first overdue row is above the fold with the bar present. **If it goes red, the answer is the bar's height or the list's density, not deleting the guard**
- [ ] T020 [P] Add the shell to `APP_STATES` in `e2e/support/app.ts` so contrast, 375px overflow, 44×44 targets and focus visibility sweep the bar on both engines. A view missing from that list is a view no browser check covers
- [ ] T021 [P] Prove T008 non-vacuous by running its named sabotage, confirming it breaks that test and only that test, then restoring
- [ ] T022 **Drive the shell with VoiceOver on a real iPhone.** Constitution v1.4.0 makes this the check that discharges the accessibility gate. Specifically: whether each tab is announced by name, whether the current one is announced as current, whether switching areas lands somewhere that makes sense, and **whether a thumb can comfortably reach a 44px target sitting above the home indicator**. **Not automatable**
- [ ] T023 Re-run `/speckit-analyze` across the three documents and confirm the findings are closed

---

## Dependencies

- **Phase 2 blocks both stories.** Nothing renders before the stack knows about areas.
- **US1 → US2.** The bar must exist before it can indicate anything.
- **T006 blocks T010**; **T010 blocks T011, T012, T016**.
- **T001 blocks T018**, and may change what T018 is.
- **T020 depends on T010**, since it sweeps a component that must exist.

## Parallel opportunities

Phase 2: **T003–T005**, three separate files. US1: **T007–T009**. US2: **T013–T015**. Polish:
**T020, T021**.

Implementation is a chain: T006 → T010 → T011/T012 → T016/T017.

## Implementation strategy

**MVP is US1 alone** — you can move between areas. US2 makes it obvious which one you are in, which
matters and is not what makes the feature work.

**This can merge before rooms exist.** FR-008 hides the bar while only one area exists, so shipping
this changes nothing a user sees and unblocks 003 immediately. That is the whole reason to build it
now rather than alongside rooms.

**The one thing to watch is vertical space.** T019 is the guard, and it is the task most likely to
fail. It failing is the guard working.
