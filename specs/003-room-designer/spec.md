---
description: "Feature specification for the room designer"
---

# Feature Specification: Room designer

**Feature directory**: `specs/003-room-designer` | **Date**: 2026-08-19
**Governed by**: [constitution v1.6.0](../../.specify/memory/constitution.md), which records this
feature as planned and binds three constraints on it before anything is built.

---

## In one paragraph

You can lay out a room in your flat — its shape and size, the furniture in it, where things go — and
see it in three dimensions. The point is deciding: whether the sofa fits under the window, whether
there is room to open the wardrobe, what the place would look like with the bed against the other
wall. Today you do that with a tape measure and imagination, or you buy something and find out.

**How you fill a room:** you pick from a set of ready-made pieces — a sofa, a bed, a wardrobe —
each of which already knows roughly what size it is. If yours is a different size, you change its
measurements. A ready-made sofa resized to your sofa is your sofa; there is no separate "describe
your own object" to learn.

**One thing to know up front:** everything you can do by dragging something around in the 3D view,
you can also do from an ordinary list. That is not a fallback for a rainy day — it is how the
feature is built, because someone using VoiceOver on a phone must be able to lay out a room too, and
you cannot drag a sofa by swiping. The 3D view shows you the room; the list is how it is described.

---

## Where this lives *(mandatory per Constitution IV)*

A top-level destination in the app, alongside maintenance. Someone who opens the app to check
whether the boiler is overdue never enters it and never waits for it to load.

> **Blocked**: the app currently has **no** top-level structure — Constitution IV requires one and
> nothing implements it. This feature cannot be reached until that exists. It is not this feature's
> job to build it, and this specification must not be planned as though it were.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Describe a room (Priority: P1)

I want to tell the app the shape and size of a room, so that anything I put in it is to scale.

**Why this priority**: nothing else in this feature means anything without it. A sofa "fitting" is
only a claim if the room has real dimensions.

**Independent Test**: describe a room by its measurements, confirm it is saved, and confirm it is
shown at the size described rather than at some default.

**Acceptance Scenarios**

1. **Given** I have no rooms, **When** I add one and give it dimensions, **Then** it is saved and
   appears in my list of rooms.
2. **Given** a room I have described, **When** I look at it, **Then** its measurements are shown in
   the units I entered them in.
3. **Given** I am describing a room, **When** I enter a measurement that cannot be real — zero,
   negative, or absurd — **Then** it is refused with a reason, and nothing is saved.
4. **Given** a room I have described, **When** I make it smaller than something in it, **Then** it
   saves, and I am told which objects no longer fit — nothing is moved, resized or removed for me.

---

### User Story 2 - Put things in it and move them around (Priority: P2)

I want to place furniture in a room and move it, so I can work out whether an arrangement works.

**Why this priority**: this is the feature. US1 is the ground it stands on.

**Independent Test**: place an object in a room, move it, confirm the position persists, and confirm
the same move can be made without touching the screen.

**Acceptance Scenarios**

1. **Given** a room, **When** I add an object with its own dimensions, **Then** it appears in the
   room at a position I can see and change.
2. **Given** an object in a room, **When** I move it, **Then** its new position is kept.
3. **Given** an object in a room, **When** I try to put it outside the room's walls, **Then** I am
   prevented or told, rather than silently allowed to describe something impossible.
4. **Given** an object in a room, **When** I remove it, **Then** it goes, and the room is otherwise
   unchanged.
5. **Given** any of the above, **When** I do it without touching the screen, **Then** every one of
   them is possible — adding, positioning, moving and removing.

---

### User Story 3 - See it in three dimensions (Priority: P3)

I want to look at the room as a space rather than as a list, so I can judge whether it works.

**Why this priority**: it is what makes the feature worth having rather than a furniture inventory —
but the app is genuinely useful at US1 and US2, and this is the part that costs the most.

**Independent Test**: open the 3D view of a room described earlier, confirm what is shown matches
the description, and confirm someone who never opens it is unaffected.

**Acceptance Scenarios**

1. **Given** a room with objects in it, **When** I open the 3D view, **Then** I see the room and its
   contents at the sizes and positions described.
2. **Given** the 3D view, **When** I move around it, **Then** I can look at the room from more than
   one angle.
3. **Given** I change something in the 3D view, **When** I go back to the list, **Then** the change
   is there — the two are views of one thing, not two copies.
4. **Given** I never open a room at all, **When** I use the rest of the app, **Then** nothing about
   this feature is loaded and nothing is slower.

---

### Edge Cases

- **A room with nothing in it** shows as an empty room, not as an error or a blank screen.
- **An object bigger than the room** is refused with a reason, in the same way an impossible
  measurement is.
- **Two objects in the same place.** Refused, with a reason (FR-005a). Real furniture cannot
  overlap, and a plan that allows it cannot answer whether something fits.
- **A room deleted while its 3D view is open** — the same class of problem the maintenance schedule
  already solved for a job deleted in another window, and it resolves the same way.
- **A device that cannot show 3D at all.** Some phones and some settings refuse hardware rendering.
  The room description must remain fully usable without the 3D view, which follows from the view
  being a view rather than the feature.
- **Reduced-motion preferences.** A moving camera is motion; the app must respect a user who has
  asked for less of it.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to record a room with a name and its dimensions.
- **FR-002**: The system MUST refuse dimensions that cannot describe a real room, with a reason, and
  save nothing.
- **FR-003**: Users MUST be able to place objects in a room by choosing from a set of ready-made
  pieces the app provides. Each piece MUST arrive with sensible default dimensions, and MUST be
  placed at a position within the room.
- **FR-003a**: Users MUST be able to change any placed object's dimensions. A ready-made piece
  resized is how a user describes something the set does not cover, so there is no separate path
  for a custom object.
- **FR-004**: Users MUST be able to move and remove objects, and to change a room's dimensions.
- **FR-005**: The system MUST NOT allow an object to be positioned outside the room that contains
  it, and MUST say so rather than silently correcting or silently accepting it.
- **FR-004a**: Shrinking a room MUST be allowed even when objects in it no longer fit. The system
  MUST warn, naming what no longer fits, and MUST NOT silently move, resize or remove anything.

  **Why not refuse it, and why not fix it.** A shrink is almost always a correction — the room was
  measured as 4 metres and is really 3.6 — so refusing it forces the user to dismantle a layout to
  record a fact. And the objects must not scale with the room: a sofa is two metres long whichever
  number was typed, and shrinking it alongside the room would mean everything always fits, which
  destroys the one question this feature exists to answer.

  An object that no longer fits is therefore a **legitimate stored state**, and storage MUST accept
  it. Refusing to load a document because one sofa is stranded would take the user's rooms, their
  jobs and their whole history with it.
- **FR-005b**: An object MUST fit the room in **all three dimensions**, height included. An object
  taller than the room's ceiling MUST be refused with a reason, as one wider than its walls is.
  Height takes no part in whether two objects *collide* (plan.md § D4) — furniture sits on the
  floor and a shelf above a desk is not a collision — but it does decide whether an object fits in
  the room at all. Those are different questions and the spec previously answered only one.
- **FR-005a**: The system MUST NOT allow two objects to occupy the same space, and MUST say so.
  Real furniture cannot overlap, and a room plan that permits it cannot answer the question the
  feature exists for — whether the thing fits.
- **FR-006**: **Every operation in FR-003 and FR-004 MUST be possible without touching the screen.**
  Direct manipulation in the 3D view MAY exist as an additional way to do them; it MUST NOT be the
  only way to do any of them. *(Constitution: model-first rule.)*
- **FR-007**: The 3D view MUST render the same stored description that the lists show. A change made
  in either MUST be visible in the other.
- **FR-008**: The system MUST remain fully usable for describing rooms and their contents when 3D
  rendering is unavailable or has failed.
- **FR-009**: Nothing required only for the 3D view MUST be loaded for a user who has not opened
  one. *(Constitution: load-on-demand rule.)*
- **FR-010**: Users MUST be able to delete a room, after confirming, and the confirmation MUST say
  what is lost.
- **FR-011**: Room and object descriptions MUST persist across closing the app, restarting the
  device, and app updates.

### Key Entities

- **Room**: a space in the flat. Has a name, dimensions, and the objects placed in it. Owns them —
  deleting a room deletes its contents.
- **Object**: something in a room. Has a name, its own dimensions, and a position within its room.
  Not shared between rooms.

*(Both are descriptions, not geometry. Nothing about how they are drawn belongs here.)*

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can describe a room and place one object in it in under two minutes,
  without opening the 3D view.
- **SC-002**: Every operation on a room and its contents can be completed without touching the
  screen, checked with VoiceOver on a real iPhone.
- **SC-003**: Opening the app and reading the maintenance list is no slower than before this feature
  existed, for a user who never opens a room.
- **SC-004**: What the 3D view shows matches the stored description — no object appears in a place
  it is not recorded as being.
- **SC-005**: Every flow in this feature can be operated without touching the screen, checked with
  VoiceOver on a real iPhone, with a visible focus indicator on every control, touch targets of at
  least 44x44px, and WCAG 2.1 AA contrast throughout at a 375px viewport. *(Required by the project
  constitution.)*
- **SC-006**: Every flow works in the installed app on a real phone, with nothing obscured by the
  notch or home indicator and no dependence on browser chrome.
- **SC-007**: A described room, and everything in it, survives closing the app, restarting the
  phone, and reopening.

> **On SC-005 and SC-006**: neither is verifiable by an automated suite here. jsdom computes no
> layout and resolves no cascaded colour, and no headless environment installs a home-screen app.
> Both are discharged by the manual device checklist. SC-002 overlaps SC-005 deliberately: it is
> restated as its own criterion because it is the constraint that shapes the whole feature, and a
> criterion buried inside another gets checked as an afterthought.

---

## Assumptions

- **The point is designing, not viewing.** "Design and decorate" was the ask, so placing and moving
  things is the feature rather than displaying a room described elsewhere.
- **Rooms are described by measurement, not drawn.** Typing dimensions is possible without touch;
  drawing a floor plan by dragging is not, and the constitution forbids a touch-only path.
- **Objects are boxes.** A sofa is a rectangular volume with a name. Modelled furniture, imported
  models and textures are out of scope; whether that is enough to be useful is a real risk, recorded
  below.
- **One flat.** Rooms belong to the flat the app is about, matching 001's exclusion of multiple
  properties.
- **Deleting works as it does elsewhere** — a confirmation that states what is lost, reusing what
  US3 of the maintenance schedule already built.

---

## Dependencies

- **The app shell does not exist.** Constitution IV requires a top-level structure from which every
  feature is reachable, and nothing implements one. This feature is unreachable until it exists, and
  building it is not this feature's job.
- **`TODO(ROOM_3D_DURABILITY)` in the constitution is unresolved**, and it bears directly here. See
  Q3 below.

---

## Out of Scope

- Importing furniture models or textures from anywhere outside the app. The ready-made pieces are a
  small built-in set of boxes with sensible default sizes; they are not a catalogue, they are not
  downloaded, and nothing is fetched at runtime
- Photorealism, lighting design, or materials
- Measuring a room using the phone's camera
- Sharing a room, exporting an image of one, or collaborating on one
- Cost estimates, shopping lists, or anything commercial
- Multiple flats or properties *(as 001)*

---

## Decisions taken, 2026-08-22

The three questions this specification opened with are answered.

**Ready-made pieces, not typed measurements.** You pick a sofa; it already knows roughly what a
sofa measures. You change the measurements if yours differs. This reopens the catalogue exclusion
below, so that line now says what is and is not included.

**This is one feature, not two.** The decor suggestions recorded in the constitution stay
planned-but-unbuilt and are out of scope here. They need a model, a model needs a key, and either
the user pays per suggestion or the app needs a server the constitution forbids. Open-weight models
do not avoid this — they move the compute onto the phone, where a model small enough to run would
download hundreds of megabytes and suggest poorly, or onto a server, where someone still pays.
`TODO(LLM_KEY_CUSTODY)` stays open and this feature does not depend on it.

**Objects cannot overlap** (FR-005a). The app refuses a colliding position, exactly as it refuses
one outside the walls. A plan that allows a wardrobe to sit inside a radiator cannot answer whether
the wardrobe fits, which is the question the feature exists for.

**No export** (FR-011 unchanged). Rooms live on the device with no backup, on the same terms as
everything else in this app. This is worth stating plainly rather than leaving as an inherited
default: **a room you spent an hour arranging can be lost, with no way back, and the app cannot even
tell you it happened** — 001 established that detecting the loss is impossible. That closes
`TODO(ROOM_3D_DURABILITY)` in the constitution.
