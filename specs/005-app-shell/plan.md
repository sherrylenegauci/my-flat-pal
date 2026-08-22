# Implementation Plan: App shell

**Feature**: `specs/005-app-shell` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)
**Required by**: [Constitution IV](../../.specify/memory/constitution.md), which the app currently
violates.

---

## What this document is

`spec.md` says what this does. This says how it gets built. Research, data model and the checking
guide are folded in here as in 001, 002 and 003.

The short version:

- **No router.** The decision that expired in 001 has been re-taken with the numbers, and it comes
  out the same way for a different reason. See [D1](#d1--still-no-router-and-this-time-with-the-count).
- **A stack per area, not one stack.** That is the whole implementation, and it is about twenty
  lines on top of what exists.
- **The tab bar is the only new component.** Everything else is a change to `navigation.ts`.
- **The real risk is vertical space**, not complexity.

---

## Technical Context

**Language / stack**: unchanged — TypeScript 5.x, React 19, Vite 6.

**Dependencies**: **none added.** See [D1](#d1--still-no-router-and-this-time-with-the-count).

**Storage**: none. The set of areas is what the app is, not what a user has, and the current area is
not persisted — the spec says a relaunch opens at the first screen anyway (Edge Cases).

**Testing**: the three tiers. Stack behaviour is testable in jsdom; the bar's size, contrast and
safe-area clearance go to the browser tier; whether it is operable without touch goes to the device.

**Target**: unchanged — installed PWA, Safari on iOS at 375px.

---

## Constitution Check

| # | Gate | Principle | Status |
|---|------|-----------|--------|
| 1 | Dependencies justified; violations recorded | I. Simplicity | **PASS** — nothing added. D1 records the router decision with the count rather than the intuition. |
| 2 | 375px first; 44x44; operable without touch; visible focus; AA contrast | II. Accessibility | **PLANNED** — the bar is a row of controls at the thumb edge, and 44x44 is a floor a tab bar can easily miss. Discharged on the device. |
| 2b | Works installed; safe areas; verified on a real device | II + PWA | **PLANNED — and this feature is the one that most needs it.** A bar pinned to the bottom sits exactly where the home indicator lives. |
| 3 | Tests precede implementation | III. Test-First | **PLANNED** — every implementation task preceded by a failing-test task. |
| 4 | Static-deployable SPA | Technology Constraints | **PASS**. |
| 5 | No secrets | Technology Constraints | **PASS**. |
| IV | A single top-level structure; features declare their place | IV. One App | **This feature is the compliance.** The app violates IV today; this closes it. |
| V | One palette in tokens.css | V. Visual Identity | **PLANNED** — the current-area indicator takes existing tokens and adds none. |

### Recorded violations

**None.**

---

## Decisions

### D1 — Still no router, and this time with the count

001 rejected a routing library because three screens do not need one, and Constitution IV recorded
that reasoning as **conditional and expired** the moment a second feature was contemplated. So it
has been re-taken rather than inherited.

**The count.** `src/ui/navigation.ts` is 67 lines and holds four views. Rooms adds four more — a
room list, a room, a room form, an object form — and this feature adds a second stack. Call it nine
views and two stacks.

**What a router would buy**: URLs, deep links, browser back/forward, nested layouts, lazy route
loading. **What this app can use**: the last one, and only for the 3D view, which 003 already plans
to load on demand by dynamic import without a router's help.

The rest is dead weight *here specifically*, and not for the reason 001 gave. 001 said "three
screens". The real reason is that **an installed standalone PWA has no address bar**: nobody types a
URL, nobody shares one, nobody bookmarks a screen, and the spec explicitly puts deep links out of
scope. A router's central value is addressability, and this app has no addresses.

**What would change it**: nesting. If a room needs its own sub-navigation *inside* the rooms tab —
more than one level below a tab — hand-rolled starts to hurt, and the count is the trigger to look
again rather than a number to defend. Recorded here so the next person is not left guessing whether
this was thought about.

**Alternatives**: React Router (~25 kB, the familiar answer), Wouter (~2 kB, would do), TanStack
Router (type-safe, larger still). All rejected on the same ground: they solve addressability.

### D2 — A stack per area, not one stack with tabs in it

`useNavigation` keeps one `View[]`. It becomes one stack **per area**, plus which area is current.
Switching sets the current area and leaves that area's stack untouched — but FR-003 says an area
always opens at its first screen, so the stack is *reset* on switch rather than preserved.

That makes the per-area stack look redundant, and it nearly is. It is still the right shape because
the alternative — one stack containing entries from different areas — makes "back" ambiguous the
moment a user goes maintenance → job → rooms → back. FR-007 says back moves *up within an area*.
A single stack cannot express that without inspecting each entry's area, which is the per-area stack
written badly.

**Consequence to design for, not discover**: the Android system back gesture is live in an installed
app, and `navigation.ts` already integrates with the History API because of it (T011). With two
stacks, a history entry must record which area it belongs to, or the system back will land the user
in the wrong one.

### D3 — The bar hides itself when there is one area

FR-008. A tab bar with one tab is a strip of screen spent on a choice that does not exist, and this
app has 46 pixels of headroom on its main promise.

It also means **this feature can merge before rooms exist without changing anything a user sees** —
which is the difference between shipping it now and holding it hostage to 003.

### D4 — Bottom, and clear of the home indicator

The thumb edge, for an app used one-handed standing up (001's Principle II rationale). The header
already carries the mark, the app name and the back control; a second top bar would compete with it.

The cost is that the bottom edge on a notched phone is exactly where the home indicator lives.
`env(safe-area-inset-bottom)` is already used by the shell (001, T041), so the mechanism exists — but
whether it *looks* right, and whether a thumb can reach a 44px target that sits above an inset,
is a device question and is on the checklist rather than assumed.

---

## Data model

**Nothing is stored.** Areas are a constant in code. The current area is React state, and is not
persisted: the spec's Edge Cases say a relaunch opens at the first screen of the area it was in, and
"the area it was in" after a cold start is simply the first area.

The only shape change is inside `navigation.ts`:

```
Area          = 'maintenance' | 'rooms'
View          = existing four, each tagged with its area
Navigation    = { view, area, canGoBack, go, back, switchTo }
```

`canGoBack` keeps its meaning — is there anywhere to go *up* to within this area — which is what the
in-app back control reads (FR-007).

---

## What changes, by layer

**Domain**: nothing. This feature has no logic about jobs or rooms.

**Storage**: nothing.

**Interface**:
- `src/ui/navigation.ts` — a stack per area, an area tag on history entries, `switchTo`.
- `src/ui/components/TabBar.tsx` — new, and the only new component.
- `src/ui/App.tsx` — renders the bar, and routes on area as well as view name.
- `src/ui/app.css` — the bar's layout and its safe-area padding.

---

## Testing, and where it will and will not tell you the truth

**jsdom carries the stack logic**: switching resets, back stays within an area, `canGoBack` is false
at an area's first screen. That is genuine behaviour and it is testable there.

**The browser tier carries the geometry**: 44x44 targets, contrast on the current-area indicator,
no horizontal overflow at 375px, and — the one that matters most — that **the bar does not cover
content**. `e2e/layout.spec.ts` already measures real boxes on both engines.

**FR-008 is a MUST NOT** — no bar when there is one area — and this project has twice shipped
negative requirements whose tests could not fail. Prove it by sabotage: force the bar to render
unconditionally and confirm the test that forbids it goes red.

**SC-002 is the one to watch.** The maintenance list currently fits four jobs above the fold at
375×812 with about 46 pixels spare. A bar spends some of that, and nothing currently guards it —
`tasks.md` for 001 already records that "without scrolling" is unguarded. This feature should add
that guard rather than inherit the risk.

**What no tier can answer**: whether a thumb can comfortably reach the bar above the home indicator,
whether VoiceOver announces the current tab as current, and whether switching areas moves focus
somewhere a non-sighted user can make sense of (FR-006). All device work.

---

## Risks

**Vertical space is the real cost**, and it is spent against the app's most-checked promise. If the
guard added for SC-002 goes red, the answer is the bar's height or the list's density — not deleting
the guard.

**The Android history integration is the subtle part.** Two stacks and one history means a system
back gesture can land in the wrong area if entries do not record where they belong. It is a
handful of lines, and it is the handful most likely to be wrong.

**And this feature makes the app look finished when it is not.** A tab bar with Maintenance and
Rooms implies rooms exist. D3's hiding rule is what stops that being a lie before 003 lands.
