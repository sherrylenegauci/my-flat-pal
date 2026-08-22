---
description: "Task list for the app shell"
---

# Tasks: App shell

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: MANDATORY per Constitution Principle III (Test-First, NON-NEGOTIABLE). Test tasks come
before the implementation they cover, and each MUST be observed failing for the right reason first.

**This feature is the first to carry the v1.7.0 rule.** Journeys in the real-browser tier are
written as behaviour scenarios traceable to the acceptance scenario they cover. Rendering sweeps
stay plain Playwright — Given/When/Then around a contrast measurement has no user and no journey to
trace to.

**`playwright-bdd` was weighed and rejected** — T001, recorded as plan.md § D5. The rule's
requirement still stands and is met: the journey names the acceptance scenario it covers in its
title and carries the Given/When/Then in `test.step`. What was declined is the tool, not the
traceability.

**Nothing blocks this.** Every other planned feature is waiting on it — 003 records itself as
unreachable until this exists.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 **Justify or reject `playwright-bdd` in `plan.md` § Decisions, then act on that.** Constitution v1.7.0 records it as the tool for journey tests and explicitly does *not* discharge Principle I. Record the shipped size, the build step it adds, and the third test tool it makes. **A conclusion that the cost is not worth paying is a legitimate outcome** and must be written down as one rather than avoided. If adopted, add it and wire the generation step into `package.json`
  - **Outcome: rejected.** Recorded as plan.md § D5 with the measurements — 36 packages, ~23 MB, a `bddgen` step, one journey to express. Nothing ships to a user either way. T018 is therefore a plain Playwright spec.
- [X] T002 [P] Add a `journeys` Playwright project in `playwright.config.ts` pointed at the new feature files, separate from the rendering sweeps. **Give it its own port** rather than reusing 5173 — `reuseExistingServer` on a hard-coded port silently pointed three separate agents at the wrong checkout during 001, and this is the moment a second project makes that worse

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Both stories stand on the navigation change.** Nothing renders until the stack knows about areas.

- [X] T003 [P] Failing tests in `tests/ui/navigation-areas.test.tsx`: `View` carries an area; `switchTo` changes the current area; each area keeps its own stack; `canGoBack` is false at an area's first screen and true below it (FR-007)
- [X] T004 [P] Failing tests in `tests/ui/navigation-reset.test.tsx` (FR-003): going several screens into an area, switching away and returning shows that area's **first** screen, not where the user left off
- [X] T005 [P] Failing tests in `tests/ui/navigation-history.test.tsx`: a history entry records the area it belongs to, and the system back gesture returns within the same area rather than crossing into another. **This is the subtle one** — plan.md § D2 names it as the handful of lines most likely to be wrong, and 001's T011 established the Android back gesture is live in an installed app
- [X] T006 Implement areas, per-area stacks and `switchTo` in `src/ui/navigation.ts` to pass T003–T005

**Checkpoint**: the app knows what an area is. Nothing on screen has changed.

---

## Phase 3: User Story 1 - Move between the parts of the app (Priority: P1)

**Goal**: any area is reachable from any screen in one action, and switching returns you to that area's top.

**Independent Test**: from anywhere in one area, reach another in one tap, and get back the same way.

### Tests for User Story 1 (MANDATORY) ⚠️

- [X] T007 [P] [US1] **(FR-001, FR-002)** Failing tests in `tests/ui/tab-bar.test.tsx`: the areas are visible from every screen; tapping one moves to it in a single action; tapping the current area's own tab while already at its first screen does nothing jarring (US1/AC4)
- [X] T008 [P] [US1] **(FR-008, negative)** Failing test in `tests/ui/tab-bar-hidden.test.tsx`: with only one area, **no tab bar is rendered at all** — not an empty bar, not a bar of one. **Prove it by sabotage**: render it unconditionally and confirm this test goes red. This project has twice shipped MUST NOTs whose tests could not fail
- [X] T009 [P] [US1] **(FR-010)** Failing test in `tests/ui/areas-unchanged.test.tsx`: adding, completing and editing a job behave exactly as before. This feature adds a frame and changes nothing inside it, and that claim needs a check rather than an assurance

### Implementation for User Story 1

- [X] T010 [US1] Build `src/ui/components/TabBar.tsx` — the only new component
- [X] T011 [US1] Render it from `src/ui/App.tsx`, routing on area as well as view name
- [X] T012 [US1] Lay it out in `src/ui/app.css`, pinned to the bottom edge with `env(safe-area-inset-bottom)` (plan.md § D4). Colours from `tokens.css`; Principle V allows no local colour

**Checkpoint**: with one area the app looks exactly as it does today. With two, you can move between them.

---

## Phase 4: User Story 2 - Know where I am (Priority: P2)

**Goal**: the current area is obvious, including to someone who cannot see the screen.

**Independent Test**: open each area in turn and confirm the current one is distinguishable — with colour ignored, and by someone who cannot see the screen.

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T013 [P] [US2] **(FR-004, FR-005)** Failing tests in `tests/ui/tab-current.test.tsx`: the current area is marked as current in the accessibility tree, and each tab is identifiable by name
- [X] T014 [P] [US2] **(FR-006)** Failing test in `tests/ui/tab-focus.test.tsx`: switching areas moves focus to the start of the new area rather than leaving it where the old screen was. 001 learned this the hard way — focus falling to `<body>` returns a non-sighted user to the top of the document with nothing announced
- [X] T015 [P] [US2] **(FR-004)** Failing test in `e2e/rendering/tab-colour-independence.spec.ts`: with colour stripped, the current area is still identifiable. `e2e/colour-independence.spec.ts` already knows how to do this; extend rather than reinvent
  - **Written in full and skipped**, on `AREAS.length < 2`. FR-008 means there is no bar in a real browser until 003, so this cannot pass or fail yet. It starts running by itself when rooms lands.

### Implementation for User Story 2

- [X] T016 [US2] Mark the current area in `src/ui/components/TabBar.tsx` — by more than colour, and correctly in the accessibility tree
- [X] T017 [US2] Move focus to the new area's heading on switch, in `src/ui/App.tsx`
  - **Done, but not to the letter of the task.** Focus goes to the `<main>` region showing the new area, not to a heading inside it: the region is what every area has, including ones whose content is not built, and the app's own `<h1>` sits above the areas and is common to all of them. The reasoning is in `App.tsx`, and `tests/ui/tab-focus.test.tsx` deliberately asserts "inside main" rather than pinning the choice. Recorded because a ticked task reads as the record of what was built. What VoiceOver says on landing on an unnamed `<main>` is T022.

**Checkpoint**: both stories work independently.

---

## Phase 5: Polish & Cross-Cutting

- [X] T018 **Write the journey as a behaviour scenario** (Constitution v1.7.0). A feature file naming the acceptance scenarios it covers — move between areas, return to an area's first screen — run through whatever T001 concluded. **If T001 rejected `playwright-bdd`**, write the journey as a plain Playwright spec and record why the scenario link is prose rather than machinery
  - Done as `e2e/journeys/moving-around-the-app.spec.ts`, plain Playwright with `test.step` carrying the Given/When/Then and the acceptance scenario named in each title. **US1/AC5 runs; US1/AC2 and US1/AC3 are skipped until rooms exists**, for the same FR-008 reason as T015. The scenario link is a string in a title and nothing checks it against `spec.md` — stated in the file, and true of `playwright-bdd` too.
- [X] T019 **Guard SC-002, which this feature is most likely to break.** The maintenance list fits four jobs above the fold at 375×812 with about 46 pixels of headroom, and a bottom bar spends some of it. Nothing guards it today — 001's tasks already record "without scrolling" as unguarded. Add a browser-tier check that the first overdue row is above the fold with the bar present. **If it goes red, the answer is the bar's height or the list's density, not deleting the guard**
  - Done as `e2e/rendering/above-the-fold.spec.ts`, which puts the bar's own markup into the real page so `app.css` sizes it, because FR-008 leaves nothing to measure otherwise. **SC-002 passes with 478px in hand.** What the bar did cost, measured identically in both engines: the bar is 45px (44px touch target + 1px hairline, the floor), and **the fourth job's row now ends 1px below the bar's top edge**, with 19px of scroll appearing on a list that had none. That is not SC-002 — it is 001's four-jobs-above-the-fold design property — so it is reported rather than asserted or quietly fixed. Sherrylene's call.
- [ ] T020 [P] Add the shell to `APP_STATES` in `e2e/support/app.ts` so contrast, 375px overflow, 44×44 targets and focus visibility sweep the bar on both engines. A view missing from that list is a view no browser check covers
  - **Not done, and not tickable: there is nothing to add.** FR-008 hides the bar while one area exists, so every state in that list renders an app with no bar in it, and a new entry would report a pass for a component that was never on the page. The gap this leaves — no browser-tier coverage of the bar's contrast, focus ring, Tab order or 375px overflow — is written into `e2e/support/app.ts` where the list is, and belongs to 003. Its height and 44×44 target *are* covered, by T019.
- [X] T021 [P] Prove T008 non-vacuous by running its named sabotage, confirming it breaks that test and only that test, then restoring
  - Done. The sabotage turns T008's two absence tests red, so they can fail. It also turned up a third: `tests/ui/read-only.test.tsx` asserts the read-only screen has zero buttons, and a tab is a button — so that assertion, and `noControlsBecause` in `e2e/support/app.ts`, break the day rooms exists. Recorded where the assertion lives. A tab navigates rather than writes, so this is a re-statement, not a fix.
- [ ] T022 **Drive the shell with VoiceOver on a real iPhone.** Constitution v1.4.0 makes this the check that discharges the accessibility gate. Specifically: whether each tab is announced by name, whether the current one is announced as current, whether switching areas lands somewhere that makes sense, and **whether a thumb can comfortably reach a 44px target sitting above the home indicator**. **Not automatable**
- [ ] T023 Re-run `/speckit-analyze` across the three documents and confirm the findings are closed

---

## Raised during implementation, and not settled here

Three questions came out of building this that the specification does not answer. None of them
blocks the feature today; each of them lands on whoever builds 003. They are written down because a
question that lives only in a report is a question nobody finds.

1. **Does a bar that paints over content while the page is scrolled satisfy FR-009's "MUST NOT
   obscure content"?** The bar is sticky and in flow, so nothing can be *permanently* hidden — at
   full scroll it sits after the content. But while scrolled up it does cover what is beneath it, and
   with the four seeded jobs the fourth row's last pixel is under it at scroll 0. Either FR-009 means
   "never permanently unreachable", which holds and should be said, or it means "never covered",
   which does not and needs 45px of padding under the list.

2. **How much of the fold is the bar allowed?** It is 45px — 44px of touch target plus a hairline,
   which is Principle II's floor and cannot shrink without breaking a MUST. That costs the fourth job
   its place above the fold at 375x812, measured in both engines. SC-002 is not breached and has
   478px in hand. The choice is between accepting three jobs above the fold, tightening the list's
   density, or deciding the fourth job was never a promise.

3. **Where does a relaunch land once there is more than one area?** spec.md's Edge Cases say the app
   opens at the first screen "of the area it was in"; plan.md § Data model decides the current area is
   not persisted and reads that as the first area. Today they coincide, because there is one area.
   The day rooms exists they do not, and nothing tests it.

A fourth is recorded where it will be met rather than here: with two areas the tab bar appears on the
read-only screen, and `tests/ui/read-only.test.tsx` asserts that screen has no buttons at all
(FR-010a). A tab navigates rather than writes, so the assertion probably wants re-stating rather than
the bar hiding — but that is a decision, and it is written beside the assertion it breaks.

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
