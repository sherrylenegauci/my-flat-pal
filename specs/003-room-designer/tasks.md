---
description: "Task list for the room designer"
---

# Tasks: Room designer

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: MANDATORY per Constitution Principle III (Test-First, NON-NEGOTIABLE). Test tasks come
before the implementation they cover, and each MUST be observed failing for the right reason first.

> **BLOCKED before any of this runs.** Constitution IV requires a top-level structure from which
> every feature is reachable, and the app has none. The room designer is unreachable until that
> exists, and building it is not this feature's job. These tasks are written and orderable now, but
> Phase 3 onward has nowhere to render.

**Two negative requirements need proving by sabotage.** FR-005 and FR-005a are MUST NOTs. This
project has twice shipped negative requirements whose tests could not fail — FR-004a's assertions
could never match the rendered text, and three undo mechanisms were unprotected while 209 tests
passed. Each names the sabotage that must break it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: touches a different file from every other `[P]` task in its group
- **[Story]**: US1, US2, US3

---

## Phase 1: Setup

- [ ] T001 Choose the 3D rendering library and record it in `plan.md` § D2 as a Principle I violation, with the shipped size measured rather than quoted from documentation. Do not install it yet — Phase 3 is the first task that needs it, and an unused dependency in `package.json` is a claim the code does not support
- [ ] T002 Add a `rooms` Vitest project to `vite.config.ts` for `tests/domain/rooms/**`, matching how `build` and `assets` were added, so room arithmetic runs in the node environment with no DOM

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story works until this is done.** Every story stands on the room model and the
arithmetic over it.

- [ ] T003 [P] Define `Room`, `PlacedObject` and `Piece` in `src/domain/rooms/types.ts` per plan.md § Data model. **Millimetres as integers throughout** — floating-point centimetres make two objects that visibly touch differ by 0.0000001 and the collision check flickers
- [ ] T004 [P] Failing tests in `tests/domain/rooms/pieces.test.ts`: the ready-made set is a table of names and default dimensions; every piece has a positive width, depth and height; ids are unique. It is data, not components (plan.md § D5)
- [ ] T005 [P] **Failing tests in `tests/domain/rooms/fits.test.ts` (FR-005, negative)**: an object wholly inside the walls fits; one crossing a wall does not; one exactly touching a wall does. **Prove it by sabotage**: make the check always return true and confirm this test fails
- [ ] T006 [P] **Failing tests in `tests/domain/rooms/collides.test.ts` (FR-005a, negative)**: two footprints that overlap collide; two that touch edge-to-edge do not; one entirely inside another does. Height is stored but takes no part (plan.md § D4). **Prove it by sabotage**: make the check always return false and confirm this test fails
- [ ] T007 Implement `pieces`, `fitsInRoom` and `collidesWith` in `src/domain/rooms/geometry.ts` to pass T004–T006 (depends on T003)
- [ ] T008 [P] Failing tests in `tests/storage/rooms-schema.test.ts`: a document holding rooms round-trips through save and load unchanged; a room with impossible dimensions makes the document **corrupt** rather than crashing on load. T114 taught that lesson — `addInterval` threw on a hand-edited count and took the whole app down
- [ ] T009 [P] Failing tests in `tests/storage/migrate-v2.test.ts` against a committed v1 fixture: a v1 document gains an empty `rooms` array and is otherwise byte-identical; the chain is the identity at v2. **This is the first migration that will ever run against a document on a real phone, with no export and no way back** (plan.md § Storage)
- [ ] T010 Raise `SCHEMA_VERSION` to 2 and implement the additive migration in `src/storage/migrate.ts` and `src/storage/schema.ts` to pass T008–T009

**Checkpoint**: the app knows what a room is and can store one. Nothing is on screen.

---

## Phase 3: User Story 1 - Describe a room (Priority: P1)

**Goal**: a room can be recorded with its measurements, and shown at the size described.

**Independent Test**: describe a room by its measurements, confirm it is saved, and confirm it is shown at the size described rather than at a default.

### Tests for User Story 1 (MANDATORY) ⚠️

- [ ] T011 [P] [US1] **(FR-001, FR-002)** Failing tests in `tests/ui/room-form.test.tsx`: a room saves with a name and three measurements; a measurement of zero, a negative, or one absurdly large is refused with a reason and nothing is saved; the units entered are the units shown
- [ ] T012 [P] [US1] **(FR-004)** Failing tests in `tests/ui/room-list.test.tsx`: rooms are listed with their measurements; the empty state says what the screen is for rather than showing nothing

### Implementation for User Story 1

- [ ] T013 [US1] Build `src/ui/views/RoomListView.tsx` and its empty state
- [ ] T014 [US1] Build `src/ui/views/RoomFormView.tsx` for adding and editing a room's name and measurements
- [ ] T015 [US1] Wire rooms through `src/ui/useSchedule.ts` or a sibling hook, and add the routes to `src/ui/navigation.ts`. **The way back must be an in-app control** — 001's T011 established that an installed PWA on iOS has no system back affordance

**Checkpoint**: rooms can be described and listed. Nothing can be put in them.

---

## Phase 4: User Story 2 - Put things in it and move them around (Priority: P2)

**Goal**: ready-made pieces can be placed, moved, resized and removed — all without touching the screen.

**Independent Test**: place an object in a room, move it, confirm the position persists, and confirm the same move can be made without touching the screen.

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T016 [P] [US2] **(FR-003, FR-003a)** Failing tests in `tests/ui/place-object.test.tsx`: a piece is chosen from the ready-made set and arrives with its default dimensions; those dimensions can then be changed; a resized piece keeps its own measurements when the set's default later differs
- [ ] T017 [P] [US2] **(FR-004, FR-005, FR-005a)** Failing tests in `tests/ui/move-object.test.tsx`: an object moves and the position persists; a position outside the walls is refused **with a reason**; a position overlapping another object is refused **with a reason**. Neither may be silently corrected nor silently accepted
- [ ] T018 [P] [US2] **(FR-006)** Failing test in `tests/ui/room-keyboard.test.tsx`: adding, positioning, moving and removing an object are each completable without a pointer. This is the automatable half of SC-002; the VoiceOver half is T029
- [ ] T019 [P] [US2] Failing test in `tests/ui/axe-rooms.test.tsx`: an axe scan of the room view and the object form reports no violations

### Implementation for User Story 2

- [ ] T020 [US2] Build the piece picker and the object form in `src/ui/views/ObjectFormView.tsx` — position and dimensions as numbers, editable without a pointer
- [ ] T021 [US2] Build `src/ui/views/RoomView.tsx` listing a room's objects with their positions, and wire add, move, resize and remove through the domain checks from T007
- [ ] T022 [US2] Add removal behind the existing `ConfirmDialog`, stating what is lost. Do not build a second dialog — T067 wrote it general and T103 already reuses it

**Checkpoint**: a room can be furnished and rearranged entirely from lists and forms. There is no 3D.

---

## Phase 5: User Story 3 - See it in three dimensions (Priority: P3)

**Goal**: the room can be looked at as a space, rendered from the same stored description.

**Independent Test**: open the 3D view of a room described earlier, confirm what is shown matches the description, and confirm someone who never opens it is unaffected.

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T023 [P] [US3] **(FR-009)** Failing test in `tests/build/room-3d-chunk.test.ts`: the production build emits the 3D engine in a **separate chunk** that the entry does not import. Modelled on `tests/build/typeface-precache.test.ts`, which runs the real build and reads what was actually written — the only tier that could have caught the font never being precached
- [ ] T024 [P] [US3] **(FR-008)** Failing test in `tests/ui/room-3d-unavailable.test.tsx`: when the 3D module fails to load, the room stays fully usable and says so. Simulate the failed import; do not simulate a missing WebGL context, which jsdom cannot model
- [ ] T025 [P] [US3] **(FR-007)** Failing test in `tests/ui/room-3d-sync.test.tsx`: a change made in the list is visible in the view's model, and the reverse. They are two views of one thing

### Implementation for User Story 3

- [ ] T026 [US3] Install the library chosen in T001 and record the real installed size in `plan.md`
- [ ] T027 [US3] Build `src/ui/views/Room3DView.tsx`, **dynamically imported**, rendering the stored model. Colours from `tokens.css` — Principle V allows no local colour, and a scene is not an exception
- [ ] T028 [US3] Add camera controls and object selection to `src/ui/views/Room3DView.tsx`, with every action also reachable from the list

**Checkpoint**: all three stories work independently.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T029 **Run every flow with VoiceOver on a real iPhone** — describing a room, placing and moving an object, and the 3D view. Constitution v1.4.0 makes this the check that discharges the accessibility gate; axe passing is supporting evidence and does not close it. **The canvas is the hardest thing in this app to operate without touch**, and if it cannot be, the model-first rule is what saves the feature. **Not automatable**
- [ ] T030 [P] Add the room views to `APP_STATES` in `e2e/support/app.ts` so contrast, 375px overflow, 44x44 targets and focus visibility sweep them on both engines. A view missing from that list is a view no browser check covers — in 001 that is how a control 25px tall shipped
- [ ] T031 [P] Prove T005 and T006 non-vacuous by running both named sabotages, confirming each breaks its own test and only its own, then restoring. Report which sabotage produced which failure
- [ ] T032 **Look at a room on a phone and judge whether it reads as a room.** No tier can check this: a scene can place every object at exactly the stored coordinates and still be unusable — camera inside a wall, scale unreadable, lighting flat. Also check the full-bleed canvas against the safe areas, and the frame rate. **Not automatable**
- [ ] T033 Re-run `/speckit-analyze` across the three documents and confirm the findings are closed

---

## Dependencies

- **Phase 2 blocks everything.** No story works before the room model and its arithmetic exist.
- **US1 → US2 → US3** in priority order. US2 needs US1's rooms; US3 needs US2's objects to render.
- **T010 blocks T013** — nothing can be listed before it can be stored.
- **T007 blocks T021** — the room view enforces rules that must exist first.
- **T026 blocks T027 and T028**, and T001 blocks T026.
- **T030 depends on T013, T021 and T027**, since it sweeps views that must exist.

## Parallel opportunities

Phase 2: **T003–T006** and **T008–T009** are separate files. US1: **T011, T012**. US2: **T016–T019**,
four distinct files. US3: **T023–T025**. Polish: **T030, T031**.

Implementation tasks are mostly chains — T013/T014 could overlap, but T020→T021→T022 and
T026→T027→T028 are sequential.

## Implementation strategy

**MVP is US1 and US2 together**: describe a room and furnish it, entirely from lists and forms. That
is independently useful — you can answer "does the sofa fit" with arithmetic and no rendering at
all — and it is the whole feature minus its most expensive part.

**US3 is where the cost is.** One dependency larger than everything else in the app, loaded on
demand, and the only part no test can judge.

**Before starting: this feature has nowhere to live.** Constitution IV requires a top-level
structure and the app has none. That is cross-cutting work belonging to its own specification, and
Phase 3 is unreachable until it exists.
