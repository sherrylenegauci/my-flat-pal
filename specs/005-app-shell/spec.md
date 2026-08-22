---
description: "Feature specification for the app shell"
---

# Feature Specification: App shell

**Feature directory**: `specs/005-app-shell` | **Date**: 2026-08-22
**Required by**: [Constitution IV](../../.specify/memory/constitution.md), which says the app must
present a single top-level structure every feature is reachable from — and which the app currently
violates, because it has none.

---

## In one paragraph

The app opens straight onto the maintenance list, because that is the only thing in it. Room design
is specified and planned, and there is nowhere to put it. This adds the frame the whole app sits
inside: a row of tabs along the bottom, one per area, so maintenance and rooms sit side by side and
neither is buried inside the other. Tapping a tab takes you to the top of that area. Nothing about
what each area *does* changes.

**One thing to know up front:** a tab bar takes a permanent strip off a small screen. The
maintenance list currently fits four jobs above the fold with about 46 pixels to spare, and this
spends some of that. It is the cost of the app being more than one thing.

---

## Where this lives *(mandatory per Constitution IV)*

This *is* where things live. It is the structure every other feature declares a place in, and the
first one that does not belong to any single feature.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move between the parts of the app (Priority: P1)

I want to get from one area of the app to another without going back through anything.

**Why this priority**: it is the whole feature, and no second feature is reachable until it exists.

**Independent Test**: from anywhere in one area, reach another area in one tap, and get back the
same way.

**Acceptance Scenarios**

1. **Given** I am anywhere in the app, **When** I look at the screen, **Then** I can see the areas
   available and which one I am in.
2. **Given** I am in one area, **When** I tap another, **Then** I am taken to it in one tap.
3. **Given** I have gone several screens deep into an area, **When** I switch away and come back,
   **Then** I am at that area's first screen, not where I left off.
4. **Given** I am on an area's first screen, **When** I tap that same area's tab, **Then** nothing
   jarring happens — no reload, no flicker, no error.
5. **Given** I am several screens deep, **When** I use the in-app back control, **Then** I move up
   one screen within the area rather than to another area.

---

### User Story 2 - Know where I am (Priority: P2)

I want to be able to tell at a glance which area I am in, without reading.

**Why this priority**: a tab bar that does not say where you are is decoration. But the app is
navigable without it, which is why it is second.

**Independent Test**: open each area in turn and confirm the current one is distinguishable — with
colour ignored, and by someone who cannot see the screen.

**Acceptance Scenarios**

1. **Given** I am in an area, **When** I look at the tabs, **Then** the one I am in is marked as
   current by more than colour alone.
2. **Given** I am using the app without looking at it, **When** I reach the tabs, **Then** each is
   announced by name, and the current one is announced as current.
3. **Given** I switch areas, **When** the new area opens, **Then** what I am now looking at is
   announced or focused, so I am not left where the old screen was.

---

### Edge Cases

- **Only one area exists.** Until rooms are built, there is one tab. Showing a bar of one is worse
  than showing none, so it appears when there is more than one thing to switch between.
- **A deep screen is open when the app is closed and reopened.** The app opens at the first screen
  of the area it was in, matching the rule that switching resets.
- **The back control on an area's first screen.** There is nothing above it, so it is not shown —
  tabs are the way sideways, back is the way up.
- **A very small screen, or very large text.** The bar must not crowd out the content it sits
  beneath, and its labels must not be truncated into ambiguity.
- **The safe area at the bottom of a notched phone.** A bar pinned to the bottom sits exactly where
  the home indicator lives, and must clear it.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a single top-level structure from which every area of the app
  is reachable, visible from every screen.
- **FR-002**: Users MUST be able to move from any screen in one area to another area in a single
  action.
- **FR-003**: Switching to an area MUST show that area's first screen, regardless of where the user
  was in it previously.
- **FR-004**: The current area MUST be indicated, and that indication MUST NOT rely on colour alone.
- **FR-005**: Each area MUST be identifiable without sight, by name, and the current one MUST be
  announced as current.
- **FR-006**: On switching areas, the system MUST place the user at the start of the new area rather
  than leaving them where the previous screen was.
- **FR-007**: The in-app back control MUST continue to move up within an area, and MUST NOT move
  between areas.
- **FR-008**: The structure MUST NOT be shown when only one area exists.
- **FR-009**: The structure MUST NOT obscure content, and MUST clear the device's safe areas.
- **FR-010**: Each area MUST keep its own data and behaviour unchanged. This feature adds a frame
  and changes nothing inside it.

### Key Entities

- **Area**: a top-level part of the app — maintenance, and later rooms. Has a name and a first
  screen. Not stored: the set of areas is what the app *is*, not what a user has.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any area of the app is reachable from any screen in one action.
- **SC-002**: On opening the app, whether anything is overdue is still visible within 5 seconds
  without scrolling — the promise 001 made, and which this feature spends screen space against.
- **SC-003**: A user who cannot see the screen can name every area, tell which one they are in, and
  move between them.
- **SC-004**: Every flow in this feature can be operated without touching the screen, checked with
  VoiceOver on a real iPhone, with a visible focus indicator on every control, touch targets of at
  least 44x44px, and WCAG 2.1 AA contrast throughout at a 375px viewport. *(Required by the project
  constitution.)*
- **SC-005**: Every flow works in the installed app on a real phone, with nothing obscured by the
  notch or home indicator and no dependence on browser chrome.

> **On SC-004 and SC-005**: neither is verifiable by an automated suite here. jsdom computes no
> layout and resolves no cascaded colour, and no headless environment installs a home-screen app.
> Both are discharged by the manual device checklist. SC-002 is restated from 001 deliberately —
> this feature is the most likely thing to break it, and a criterion inherited silently is a
> criterion nobody re-checks.

---

## Assumptions

- **Tabs along the bottom.** The reachable-with-a-thumb edge on a phone held one-handed, which is
  how 001 says this app is used. A top bar would compete with the header that already carries the
  app's name and its back control.
- **Two areas to begin with**: maintenance, and rooms once they exist. The structure should not
  strain at four, but nothing here designs for a number that does not exist.
- **Switching resets to the first screen**, as decided. Simpler than remembering a position per
  area, and it means a user cannot return to a screen whose underlying data has since been deleted.
- **The header stays.** The app's name, its mark, and the in-app back control are unchanged. Tabs go
  sideways; back goes up.
- **No URLs.** The app runs installed with no address bar. Nothing here promises a shareable or
  bookmarkable address for an area.

---

## Dependencies

- **Nothing blocks this**, which is unusual here and is the point: every other planned feature is
  waiting on it. 003's specification and plan both record themselves as unreachable until this
  exists.

---

## Out of Scope

- Any change to what maintenance does
- Building the rooms area — this makes room for it, it does not fill it
- Gestures for switching, such as swiping between areas
- Reordering, hiding or customising the areas
- Badges, counts or notification dots on a tab
- Remembering where you were in each area *(decided against)*
- Deep links, shareable URLs, or restoring a specific screen from outside the app
