# Implementation Plan: Room designer

**Feature**: `specs/003-room-designer` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)
**Governed by**: [constitution v1.6.0](../../.specify/memory/constitution.md), which records this
feature and binds three constraints on it.

---

## What this document is

`spec.md` says what this does. This says how it gets built. As with 001 and 002, research, data
model and the checking guide are folded in here rather than sitting in four files.

The short version:

- **A room is a rectangle with things in it.** Both are boxes. Everything interesting is arithmetic
  on rectangles, and that lives in the domain tier where it can be tested without a browser.
- **3D is a view.** Every operation works from an ordinary list too, because Principle II requires
  it and because you cannot drag a sofa by swiping.
- **The 3D engine is the only new dependency**, it is the largest thing in the app by far, and it
  is loaded only when someone opens a room.
- **This cannot ship until the app has a shell**, which it does not.

---

## Blocking dependency

**The app has no top-level structure.** Constitution IV requires one from which every feature is
reachable; nothing implements it. This feature is unreachable until it exists, and building it is
not this feature's job.

Recorded here as well as in the spec because a plan that quietly assumes a shell will produce tasks
that quietly assume one too.

---

## Technical Context

**Language / stack**: unchanged — TypeScript 5.x, React 19, Vite 6, `vite-plugin-pwa`.

**New dependency**: one 3D rendering library. See [D2](#d2--the-3d-engine-is-a-recorded-principle-i-violation).

**Storage**: `localStorage`, the same versioned document. Rooms are a new top-level collection
alongside items. `SCHEMA_VERSION` goes to 2, and the migration is additive — see
[Storage](#storage-and-the-first-real-migration).

**Testing**: the three tiers. The collision and fit arithmetic is pure and belongs in the domain
tier; the lists and forms are behaviour tests; layout, contrast and focus go to the browser tier.
**Nothing automated can check that a 3D scene looks right**, and the plan says so where that gap
lives rather than pretending otherwise.

**Target**: unchanged — installed PWA, Safari on iOS at 375px.

**Scale**: a flat has a handful of rooms and perhaps twenty objects each. Kilobytes. That number is
why collision detection can be the naive pairwise check and why no spatial index is warranted.

---

## Constitution Check

| # | Gate | Principle | Status |
|---|------|-----------|--------|
| 1 | Dependencies justified; violations recorded | I. Simplicity | **PASS WITH A RECORDED VIOLATION** — one 3D engine, recorded in [D2](#d2--the-3d-engine-is-a-recorded-principle-i-violation). It cannot meet the three-call-site rule and is not argued into compliance. |
| 2 | 375px first; 44x44; operable without touch; visible focus; AA contrast | II. Accessibility | **PLANNED — discharged on the device.** The model-first rule in [D1](#d1--the-room-is-a-model-3d-is-a-view-of-it) is what makes this satisfiable at all. VoiceOver on a real iPhone closes it. |
| 2b | Works installed; safe areas; verified on a real device | II + PWA | **PLANNED** — and heavier here than elsewhere: a full-bleed canvas interacts with safe areas in a way no other view does. |
| 3 | Tests precede implementation | III. Test-First | **PLANNED** — every implementation task preceded by a failing-test task. |
| 4 | Static-deployable SPA | Technology Constraints | **PASS** — a renderer is a client library; nothing gains a server. |
| 5 | No secrets | Technology Constraints | **PASS** — no key, because suggestions are out of scope. |
| 6 | *(decor suggestions only)* | LLM constraints | **N/A** — deliberately. `TODO(LLM_KEY_CUSTODY)` stays open and this feature does not touch it. |
| IV | Feature declares where it lives; shell is cross-cutting | IV. One App | **BLOCKED** — the spec declares where it lives; the shell does not exist. |
| V | One palette in tokens.css; contrast computed | V. Visual Identity | **PLANNED** — a 3D scene has colours. They come from the tokens, and the ones a user must distinguish are measured, not judged. |

---

## Decisions

### D1 — The room is a model, 3D is a view of it

Walls, dimensions and placed objects are data. The 3D canvas renders that data. Every operation —
add, move, resize, remove — works from an ordinary list and form as well.

This is the constitution's rule, not a preference, and the reason is Principle II: dragging on a
canvas cannot be done without touch, so a canvas-only feature would violate a MUST that predates it.

It pays for itself twice over. The interesting logic — does this fit, does it collide, is it inside
the walls — becomes arithmetic on rectangles, testable in the domain tier with no browser and no
scene. And the 3D layer becomes replaceable: if the engine choice turns out wrong, the model and
every test survive it.

### D2 — The 3D engine is a recorded Principle I violation

**Violation**: one 3D rendering library, at one call site.

**The engine is `three`** (three.js), used directly and imperatively from a single React component.
**Not** `@react-three/fiber`, and **not** Babylon.js. Recorded 2026-08-22 by T001, with the sizes
below measured rather than quoted.

**Why**: WebGL by hand means writing shaders, a camera, a scene graph and pointer-to-3D-space
maths. That is not "no dependency", it is "write the dependency", and worse for a project whose
whole posture is to stay small.

**Why not the simpler thing**: there isn't one. A 2D top-down plan on a canvas would avoid it
entirely and is a genuinely smaller feature — but the spec asks to *see the room*, and a floor plan
is not that.

#### The cost, measured

Each candidate was built with Vite 6 and esbuild minification from an entry that does what the room
view will actually do — a scene, a perspective camera, a WebGL renderer, box geometry, a standard
material, ambient and directional light, and orbit controls — not a hello-world. `react` and
`react-dom` are marked external, so these are the **marginal** bytes this feature adds to a bundle
that already has React in it. Gzip is level 9; brotli is the default quality. Versions: `three`
0.185.1, `@react-three/fiber` 9.7.0, `@babylonjs/core` 9.22.1.

| Candidate | raw | gzip | brotli |
|---|---|---|---|
| **`three`, tree-shaken, imperative** | 835 kB | **176 kB** | 137 kB |
| `three` + `@react-three/fiber` | 1917 kB | 409 kB | 311 kB |
| `@babylonjs/core`, tree-shaken | 2741 kB | 576 kB | 443 kB |
| *(for scale)* the whole app today | 223 kB | 71 kB | 61 kB |

**So the engine is roughly two and a half times the entire application, gzipped.** That is the
number this decision is really about, and it is why [D3](#d3--the-3d-layer-loads-only-when-a-room-is-opened)
is not optional.

Two supporting measurements, because they are the reasons for the choice rather than decoration:

- `three` imported wholesale (`import * as THREE`) is **267 kB gzip**, against 168 kB for the
  tree-shaken subset without orbit controls. Tree-shaking three is worth about 100 kB gzip, and it
  only works if the import list stays explicit.
- Orbit controls cost about **8 kB gzip** (176 against 168). Camera movement is acceptance scenario
  US3-2, so it is paid for.

#### Why not `@react-three/fiber`

It is the pleasanter API by a distance — a scene as JSX, which is how the rest of this app is
written — and it costs **233 kB gzip more than three alone**, more than three whole copies of the
current app.

That cost is structural rather than incidental, so it will not improve: r3f imports three as a
namespace, which defeats the tree-shaking above, and it bundles a second React reconciler.

What it buys is reconciliation — diffing a declarative tree against a live scene graph. That earns
its keep across many components with independent state. Here there is **one** component, rendering
a plain data structure that [D1](#d1--the-room-is-a-model-3d-is-a-view-of-it) already says is the
source of truth, into a scene rebuilt when that structure changes. A handful of rooms and perhaps
twenty boxes each. Reconciling that is not a problem we have.

The honest cost of refusing it: the room view will hold imperative setup and teardown inside a
React component, which is a known place for bugs — a renderer not disposed, a listener not removed,
an animation loop still running after unmount. That is one component's worth of care, written once,
and it is a smaller thing to get right than 233 kB is to send to a phone.

#### Why not Babylon.js

Largest of the three, and its strengths are all things this feature excludes: physics, a PBR
material pipeline, asset import, WebGPU. The spec rules out photorealism, materials and imported
models, so we would be paying 400 kB gzip over three for capability the spec forbids using.

#### What this decision is not

It is not irreversible, and D1 is what keeps it that way: the model and every test over it survive
an engine swap, because nothing outside `Room3DView.tsx` knows an engine exists. **Nothing is
installed yet** — T001 is a decision, and an unused dependency in `package.json` is a claim the
code does not support. `three` arrives at T026, which is the first task that needs it, and T026
re-measures the real chunk in place. These numbers are library builds; the shipped chunk is this
plus the view code, and shared-module deduplication may move it a little either way.

### D3 — The 3D layer loads only when a room is opened

Dynamic import. Someone who opens the app to check whether the boiler is overdue must not pay for a
renderer, and SC-003 says so in user terms. This also means the app stays usable if the engine fails
to load — which FR-008 requires anyway, and which is far easier to honour when the failure mode is
"this view did not open" rather than "the app did not start".

### D4 — Collision is rectangle overlap on the floor, not volumes

Objects are boxes, and furniture sits on the floor. Two objects collide when their footprints
overlap — a comparison of two rectangles. Height is stored and drawn but does not participate.

This is deliberately less than reality: it forbids a shelf above a desk. That is the wrong answer
for a handful of real cases and the right answer for the common one, and it keeps the check to four
comparisons that anyone can read. If the shelf case matters later, it becomes an interval check on
a third axis and the tests written now still hold.

### D5 — Ready-made pieces are data, not components

The set of pieces — sofa, bed, wardrobe — is a table of names and default dimensions in the domain
layer. Not a component each, not a registry, not a plugin point. Adding a piece is adding a row.

Principle I forbids the abstraction before the second use case, and there is exactly one use case:
put a box in a room with a sensible starting size.

### D6 — Rooms are rectangular

L-shaped rooms, bay windows and alcoves are out. A rectangle is what a tape measure gives you, it is
what the collision maths above assumes, and it is describable without touch. Non-rectangular rooms
are a much larger feature — an editable polygon, drawn — and the spec excludes them.

---

## Data model

### What gets stored

**Room** — `id`, `name`, `widthMm`, `depthMm`, `heightMm`, and its placed objects. Owns them:
deleting a room deletes its contents.

**PlacedObject** — `id`, `pieceId` (which ready-made piece it started as), `name`, `widthMm`,
`depthMm`, `heightMm`, and `x` / `y` in millimetres from the room's near-left corner.

Millimetres throughout, as integers. Floating-point centimetres would make two objects that visibly
touch differ by 0.0000001, and the collision check would flicker. The unit shown to the user is a
display concern.

**Piece** — the ready-made set. `id`, `name`, default dimensions. **Not stored** — it is code, so a
placed object keeps its own dimensions and is unaffected when a default changes.

### Storage and the first real migration

`SCHEMA_VERSION` goes to **1 → 2**, adding a `rooms` collection. `src/storage/migrate.ts` exists for
exactly this and has never run a real migration — it has been the identity at v1 since 001, and 001's
plan recorded it as an abstraction with no second use case, justified by the asymmetry of retrofitting
one later. **This is that second use case**, and the justification comes due.

The migration is additive: a v1 document gains an empty `rooms` array. Nothing existing changes
shape, so the risk is low — but it is the first migration to run against documents already on a
phone, with no export and no way back, so it gets its own tests against a committed v1 fixture.

---

## What changes, by layer

**Domain** (`src/domain/rooms.ts`, new) — the piece table, and the arithmetic: does this object fit
inside the room, does it overlap another, where does a move land. Pure functions over rectangles. No
React, no engine, no clock.

**Storage** — the `rooms` collection, the v1→v2 migration, and validation as strict as 001's: a room
with impossible dimensions makes the document corrupt rather than crashing the app on load, which is
the lesson T114 taught.

**Interface** — a list of rooms; a room's own view with its objects as a list; a form for dimensions;
a picker for the ready-made set. All of it works without the canvas.

**The 3D view** — dynamically imported, rendering the stored model. Camera controls, and selecting an
object. Everything it can do, the lists can do.

---

## Testing, and what none of it can tell you

The domain tier carries the weight: fit, overlap, and placement are rectangle arithmetic, and they
are where the bugs will be.

**FR-005 and FR-005a are MUST NOTs**, and this project has shipped negative requirements whose tests
could not fail — FR-004a's assertions never matched the rendered text, and three undo mechanisms were
unprotected while 209 tests passed. Both here need proving by sabotage: make the overlap check always
return false, and confirm the test that forbids overlap goes red.

**What no tier can check**: whether the room *looks* right. A scene can render every object at the
stored coordinates and still be unusable — the camera inside a wall, the scale unreadable, the
lighting flat. There is no assertion for "this looks like a room". That belongs on the device
checklist and is stated here rather than discovered later.

**Also for the device**: whether a canvas can be operated at all with VoiceOver, whether the
full-bleed view respects safe areas, and whether a phone renders it at a usable frame rate.

---

## Risks

**The engine is the largest thing in the app and the hardest to remove later.** D1 is the mitigation
— the model survives an engine swap — but the choice still wants making carefully rather than by
familiarity.

**"Objects are boxes" is unproven.** Whether a rectangular volume called "sofa" answers "does this
fit and does it look right" is the assumption the whole feature rests on. If it does not, the honest
consequence is modelled furniture, which is a far larger feature than this one.

**A room is worth more per minute than a job list, and there is still no backup.** Accepted
deliberately, recorded in the spec, and worth re-reading before the first person loses one.
