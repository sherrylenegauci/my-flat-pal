<!--
SYNC IMPACT REPORT
==================
Version change: 1.5.0 → 1.6.0
Bump rationale: MINOR — Technology Constraints materially expanded with a planned
major feature and the constraints binding on it. No principle removed or redefined.

Version bump reasoning, since it is arguable. The case for MAJOR is that this
changes what the product is, and that a 3D engine cannot satisfy Principle I's
three-call-site rule. But Principle I already provides for that: a violation with
a justification is permitted, recorded in Complexity Tracking. So no principle is
redefined and nothing is removed — guidance is expanded. MINOR.

Added:
- Technology Constraints — "Room design in 3D is planned, and it changes what this
  app is." Three binding constraints: the room is a data model first with 3D as a
  view of it; the 3D layer is never loaded by anyone who has not asked for it; and
  the engine dependency is recorded as a Principle I violation rather than argued
  into compliance.

Why the model-first rule is written as binding rather than as advice: Principle II
requires every interactive flow to be operable without touch, verified with
VoiceOver. Direct manipulation of a canvas cannot satisfy that alone. Without the
rule, the feature contradicts a MUST that predates it, and a constitution cannot
promise a feature that violates its own principles. Overturning it means amending
Principle II.

Deferred:
- TODO(ROOM_3D_SCOPE) — whether the point is designing a room or seeing one;
  whether this is the same feature as the LLM decor suggestions; and whether the
  app is now a home app whose first feature was maintenance rather than a
  maintenance app with a designer attached.
- TODO(ROOM_3D_DURABILITY) — localStorage is device-bound with no export, and this
  document has already recorded that detecting loss is impossible. Whether that is
  acceptable for a room someone spent an hour arranging, or whether this forces the
  export question 001 deliberately closed.

Templates requiring updates:
- ✅ none — this adds no mandatory section and no new gate. The constraints bind the
  specification that eventually describes the feature, and Principle I's existing
  Complexity Tracking requirement already carries the dependency case.

Prior: 1.4.0 → 1.5.0
Bump rationale: MINOR — two principles added, none removed or redefined.

Added principles:
- IV. One App, Several Features — the app must present a single top-level structure
  from which every feature is reachable; every feature spec must say where it lives;
  the shell is cross-cutting and not owned by whichever feature was built first.
- V. One Visual Identity — one palette in one file, contrast computed never estimated,
  meaning never carried by colour alone, and an identity that is quiet and durable
  rather than distinctive.

Why now: both were written from a cost already paid. Feature 001's plan rejected a
router because three screens do not need one — correct then, silently wrong the moment
a second feature was contemplated, and nothing recorded that the reasoning had an expiry
date. And a design pass on 001 had no recorded identity to work against, so it was
guessed, built, reviewed and rejected; the next attempt would have been another guess.

Deferred:
- TODO(VISUAL_IDENTITY_PALETTE) — the concrete palette is deliberately not recorded yet.
  The direction is "clean and crisp"; an implementation is in review. Enshrining values
  before they have been looked at would repeat the mistake with more ceremony.

Templates requiring updates:
- ⚠ .specify/templates/spec-template.md — should require a feature to state where it
  lives in the app's structure (Principle IV)
- ⚠ .specify/templates/plan-template.md — Constitution Check needs gates for IV and V
- ✅ .specify/templates/tasks-template.md — no change; neither principle adds a task type
- ⚠ specs/001-maintenance-schedule/plan.md — its "Rejected: a router" line is now
  superseded and should record the condition under which it held

Prior: 1.3.0 → 1.4.0
Bump rationale: MINOR — Principle II's accessibility clause materially expanded.
Nothing was removed: keyboard operability remains a MUST, because it is WCAG 2.1.1
at Level A and dropping it while requiring AA contrast would be incoherent. What
changed is what the clause is verified against, and what the release gate accepts
as evidence.

Modified principles:
- II. Accessibility & Mobile-First — the keyboard clause now leads with "operable
  without touching the screen", names VoiceOver on a real iPhone as the check that
  counts, and demotes desktop Tab-order traversal to supporting automated evidence.
  Rationale recorded inline: the Tab sweep only ever ran on Chromium, because Safari
  does not Tab to buttons by default, so it was never evidence about the target
  platform.

Modified sections:
- Development Workflow, release gate 3 (Accessibility) — now requires touch-free
  operation checked on a real device, and states explicitly that automated keyboard
  traversal does not on its own discharge the gate.

Prompted by: feature 001 clarification session 2026-08-11, which rewrote SC-005 to
promise phone operation via VoiceOver and left an open conflict with this document.
That conflict is now closed.

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — gate 2 now says "operable without touch",
  names VoiceOver as the check that counts, demotes keyboard traversal to supporting
- ✅ .specify/templates/spec-template.md — SC-005 guidance rewritten around the device,
  with the reason a desktop Tab sweep cannot be the criterion for a phone app
- ✅ .specify/templates/tasks-template.md — the accessibility verification task now
  requires a real device and says automated traversal does not discharge it alone
- ✅ specs/001-maintenance-schedule/tasks.md — T078 extended to cover driving every
  flow with VoiceOver
- ✅ specs/001-maintenance-schedule/spec.md — SC-005 already rewritten in the
  2026-08-11 clarification session; the "Open conflict" note it carried is now stale
  and is removed by this amendment

Prior: 1.2.2 → 1.3.0
Bump rationale: MINOR — Principle III materially expanded with a Testing
Strategy section (three tiers, what each covers, and what the environment
genuinely cannot check) and an Agents section defining two standing agents.
Also corrects Principle III's "end to end" wording, which read as a promise
of browser-level tests that do not exist.

Prior: 1.2.1 → 1.2.2
Bump rationale: PATCH — records two TODOs discharged by feature 001's plan:
INSTALLED_DATA_DURABILITY (localStorage; loss detection ruled out as impossible,
mitigation substituted) and BUILD_TOOL_CONFIRMATION (Vite confirmed over Next.js).
Decision records only; no principle or constraint changed.

Prior: 1.2.0 → 1.2.1 — PATCH, recorded the resolution of half of
TODO(INSTALLED_DATA_DURABILITY) (no export/backup; data is device-bound) following
a scope decision in feature 001. No principle or constraint changed.

Prior: 1.1.0 → 1.2.0
Bump rationale: MINOR — the app is now specified as an installable PWA. Adds a
"The app is an installable PWA" subsection to Technology Constraints and expands
Principle II with touch-target sizing, standalone-window navigation, and safe-area
requirements. Guidance expanded; no principle removed or redefined.

Prior: 1.0.0 → 1.1.0 — MINOR, Technology Constraints materially expanded with a
"Room decor suggestions are LLM-generated" subsection (model, structured outputs,
test isolation, advisory framing, failure paths). No principle changed or removed.

Prior: (template, unversioned) → 1.0.0 — MAJOR, first ratified constitution. The
file was a pristine placeholder template; that was initial adoption, not an amendment.

Modified principles:
  [PRINCIPLE_1_NAME] → I. Simplicity & Minimal Dependencies
  [PRINCIPLE_2_NAME] → II. Accessibility & Mobile-First
  [PRINCIPLE_3_NAME] → III. Test-First (NON-NEGOTIABLE)

Added sections:
  Technology Constraints (was [SECTION_2_NAME])
  Development Workflow & Quality Gates (was [SECTION_3_NAME])

Removed sections:
  [PRINCIPLE_4_NAME] / [PRINCIPLE_4_DESCRIPTION] — unused template slot
  [PRINCIPLE_5_NAME] / [PRINCIPLE_5_DESCRIPTION] — unused template slot
  Rationale: three principles were selected; empty slots are not retained.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gates filled in
  ✅ .specify/templates/tasks-template.md — "Tests are OPTIONAL" contradicted
     Principle III; tests are now mandatory and test-first ordering enforced
  ✅ .specify/templates/spec-template.md — accessibility added to mandatory
     Success Criteria guidance
  ✅ .claude/skills/speckit-*/SKILL.md — audited, no stale agent-specific
     references requiring generic guidance
  ✅ README.md — none present; nothing to reconcile

Deferred TODOs:
  RESOLVED in 1.1.0 — TODO(DECOR_SUGGESTION_SOURCE): suggestions are LLM-generated
  via the Anthropic API. See Technology Constraints.
  TODO(LLM_KEY_CUSTODY): where the Anthropic API key lives — a server-side proxy
  function (requires amending the static-deployment constraint) or a user-supplied
  on-device key (preserves it) — is deliberately deferred to the first plan that
  touches suggestions. Blocks implementation of suggestions, not the maintenance
  feature.
  RESOLVED 2026-08-08 — TODO(INSTALLED_DATA_DURABILITY). Three parts, all settled:
  (1) No export/backup — feature 001 specced one and deliberately cut it, so user
  data is device-bound with no recovery path. (2) Persistence mechanism: localStorage
  holding a single versioned JSON document (001 research.md § R2). (3) Detecting data
  loss: NOT POSSIBLE. Any marker proving data once existed lives in the same storage
  eviction clears, so after eviction the app is indistinguishable from a fresh
  install. The app must not claim otherwise. Mitigation instead of detection —
  request persistent storage on first use and tell the user plainly if it is refused.
  Recorded so no later plan treats loss detection as merely unimplemented.
  RESOLVED 2026-08-08 — TODO(BUILD_TOOL_CONFIRMATION): Vite confirmed over Next.js
  in feature 001's plan (research.md § R1). Next.js's principal advantages — SSR,
  server components, API routes — are not merely unused here but forbidden by the
  static-deployment constraint. The recorded stack stands; no amendment needed.
-->

# my-flat-pal Constitution

## Core Principles

### I. Simplicity & Minimal Dependencies

Start simple and stay simple. YAGNI is the default posture: build what the current
specification requires, not what a future one might.

- Every third-party dependency MUST be justified in the plan that introduces it,
  naming the problem it solves and why the platform or existing dependencies cannot.
- A dependency that would be used for fewer than three non-trivial call sites SHOULD
  be replaced by local code.
- Abstractions (wrappers, factories, generic layers) MUST NOT be introduced before a
  second concrete use case exists.
- Any violation of this principle MUST be recorded in the plan's Complexity Tracking
  table with the simpler alternative that was rejected and why.

**Rationale**: This is a small application maintained by a very small team. Toolchain
and dependency sprawl, not missing features, is the realistic failure mode — it is what
makes an app like this stop being maintainable long before it stops being useful.

### II. Accessibility & Mobile-First

The application is designed for a phone screen first and MUST be usable by everyone.

- Markup MUST be semantic HTML; interactive controls MUST be real buttons, links, and
  form elements, never click-handled `div`s.
- Every interactive flow MUST be operable without touching the screen, and MUST be
  completable by keyboard alone, with a visible focus indicator at all times.

  **What this is verified against.** This is a phone app, so the check that counts is
  **VoiceOver on a real iPhone** — swiping between elements and double-tapping, which is
  how someone who cannot use touch actually drives a phone. Tab-order traversal in a
  desktop browser is a supporting automated check, not the evidence for this clause. It
  was a poor proxy: it only ever ran on Chromium, because Safari does not Tab to buttons
  unless the user turns that on, so the browser tier honestly skips the sweep there
  rather than report a pass for a traversal that never happened.

  **Keyboard operability is not dropped, and MUST NOT be.** It is WCAG 2.1.1, a Level A
  criterion — more fundamental than the AA contrast this same principle requires, so
  removing it while keeping AA would be incoherent. It also costs nothing here: the
  semantic-HTML rule above already mandates real buttons and form elements, which are
  keyboard-operable by construction. What changed is which check we point at when we
  claim the app is accessible, not the standard the app is held to.
- Text and meaningful UI MUST meet WCAG 2.1 AA contrast (4.5:1 body text, 3:1 large
  text and interface components).
- Images and icons that convey meaning MUST carry text alternatives; decorative ones
  MUST be hidden from assistive technology.
- Layouts MUST be designed at a 375px-wide viewport first and scale up; no horizontal
  page scrolling at that width.
- Touch targets MUST be at least 44x44 CSS pixels, with visible spacing between adjacent
  targets. The app is used one-handed, standing up.
- The app runs installed, in a standalone window with no browser chrome (see Technology
  Constraints). Navigation MUST NOT depend on the browser's back button or URL bar, and
  layouts MUST respect the device's safe-area insets so content is never hidden behind a
  notch or home indicator.
- Accessibility MUST be verified before a feature is considered complete — not deferred
  to a later polish pass.

**Rationale**: Retrofitting accessibility is dramatically more expensive than building
it in, and a maintenance app is most often used standing in the room with the problem,
on a phone, one-handed.

### III. Test-First (NON-NEGOTIABLE)

Tests are written before the implementation they describe, and they MUST fail first.

- The Red-Green-Refactor cycle is mandatory: write the test → observe it fail for the
  right reason → write the minimum code to pass → refactor.
- A pull request that adds or changes behaviour without an accompanying test that would
  have failed before the change MUST NOT be merged.
- Tests MUST assert observable behaviour through the interface a user or caller actually
  uses. Tests that assert internal implementation detail are a defect.
- Every user story in a specification MUST have at least one test that exercises its
  acceptance scenarios through the interface a user actually uses. *(This previously
  said "end to end", which was ambiguous: it reads as a promise of browser-level
  tests that do not exist. See Testing Strategy below for what is actually required.)*
- Bug fixes MUST begin with a failing test that reproduces the bug.

### Testing Strategy

Three tiers, each covering what the tier below cannot. A change is not done until every
tier that applies to it is satisfied.

| Tier | Covers | Environment | Status |
|---|---|---|---|
| **Domain** | Scheduling rules, calendar arithmetic, pure logic | No DOM | MANDATORY |
| **Behaviour** | What a user can do and see — through roles, labels, and visible text | jsdom + Testing Library | MANDATORY |
| **Real browser** | Contrast, focus visibility, installed behaviour, safe areas, platform gestures | A real browser and a real phone | MANDATORY, currently **manual** |

- The domain tier MUST NOT touch React, storage, or the clock. Passing dates in as
  parameters is what makes date-dependent rules testable without fake timers.
- The behaviour tier MUST assert through what a user perceives. Reaching into component
  internals is a defect (see above).
- **The real-browser tier is currently a documented manual checklist, not automation.**
  This is a deliberate, recorded limitation rather than an oversight: jsdom computes no
  layout and resolves no cascaded colour, so contrast and focus visibility cannot be
  checked there, and no headless environment can verify a home-screen install.
- **Automated browser tests are permitted and encouraged, not mandated.** Introducing
  one is a normal dependency decision under Principle I: justify it in the plan that
  adds it. The trigger to expect is the manual checklist becoming long enough to be
  skipped — a checklist nobody runs is worse than a test suite nobody wrote.
- **An automated check that cannot actually check the thing MUST NOT be written.** A
  contrast assertion in jsdom passes regardless of the real colours; that is worse than
  no check, because it reads as coverage. Where a tier cannot cover something, say so
  where the gap is, rather than papering it with a test that always passes.

### Agents

Two standing agents support this principle. Both live in `.claude/agents/` and are
version-controlled with the code, so their instructions are reviewable and amendable
like anything else.

- **`test-automation`** — writes and maintains tests to these rules. Invoked when tests
  are being added or reworked.
- **`behaviour-verification`** — checks implemented behaviour against the spec's
  acceptance scenarios and success criteria, independently of whoever wrote it.

Neither replaces the author's own responsibility. Their value is that they read the spec
and the constitution fresh, which the author of a change cannot do.

**Rationale**: Test-first is what makes the other two principles enforceable. It is the
only mechanism that keeps a refactor toward simplicity safe, and it is the gate at which
accessibility assertions can be made to hold automatically rather than by memory.

### IV. One App, Several Features

my-flat-pal is not a maintenance app. It is an app about a flat, and maintenance is its
first feature. Room decor suggestions are already recorded in Technology Constraints, and
more will follow.

- The application MUST present a **single top-level structure** from which every feature is
  reachable. A feature MUST NOT be a separate app, a separate entry point, or reachable only
  by knowing a URL.
- Every feature specification MUST say **where the feature lives** in that structure, and
  what a user who is not looking for it sees. A feature that cannot answer this is not ready
  to plan.
- The shell — the top-level structure, its navigation, and the state it holds — is
  **cross-cutting**. It MUST NOT be owned by whichever feature happened to be built first,
  and changing it is an amendment-level decision rather than a feature-level one.
- Navigation between features MUST meet Principle II in full: reachable without touch,
  visible focus, 44x44 targets, and no dependence on browser chrome.

**Rationale**: this is written down because its absence has already cost something. Feature
001's plan rejected a routing library on the grounds that three screens do not need one.
That was correct when there was one feature and three screens, and it silently stopped being
correct the moment a second feature was contemplated — but nothing recorded that the
reasoning had an expiry date, so it reads as settled. Decisions that are right only under
conditions that will change MUST record the condition. This principle is that record.

**What this does not mandate**: tabs specifically, a routing library specifically, or any
particular interaction. It mandates that there *is* a structure, that features declare their
place in it, and that nobody owns it privately.

### V. One Visual Identity

The app looks like one app. A feature MUST NOT introduce its own look.

- **One palette, in one file.** Colour, type scale and spacing live in `src/ui/tokens.css`.
  A feature MUST NOT define a colour, a font size or a spacing value locally. If it needs one
  that does not exist, it adds it to the tokens with a justification, in that file.
- **Every contrast ratio MUST be computed, never estimated**, and recorded with the value.
  A ratio written from judgement is a guess wearing the costume of a measurement.
- **Status and meaning MUST NOT be carried by colour alone**, in any feature. This is
  Principle II restated where designers will actually meet it.
- The identity is **quiet and durable** rather than distinctive. This app is opened for
  years, for a few seconds at a time, usually to find out whether something is overdue.
  Design that draws attention to itself is a cost paid on every one of those visits.

**Rationale**: also written from a real cost. A design pass on feature 001 had no recorded
identity to work against, so it was guessed, built, reviewed and rejected — and the next
attempt would have been another guess. Separately, `tokens.css` once carried twelve contrast
ratios described as measured that were all estimates, and `focus.css` claimed 3.6:1 for a
ring that measured 2.69:1: below the AA floor, shipped, and invisible to every test then
existing.

TODO(VISUAL_IDENTITY_PALETTE): the concrete palette is **not yet recorded here**, deliberately.
The stated direction is *clean and crisp* — cool neutrals, crisp contrast, one confident
accent — and an implementation of it is in review. Writing specific values into governance
before they have been looked at would enshrine a guess with more ceremony than the last one.
The values are added to this section once a palette has been approved, and until then
`src/ui/tokens.css` is the working record.

## Technology Constraints

**Stack**: React single-page application built with Vite. TypeScript is the
implementation language. This is the recorded stack; changing it requires an amendment.

**Constraints**:

- The application MUST remain a client-rendered SPA deployable as static assets. No
  server runtime may be introduced without an amendment to this section.
- Application state and persistence choices MUST be specified in the feature plan before
  implementation; no ad-hoc global mutable state.
- Any external or AI-backed service MUST sit behind a single module-level interface, and
  core maintenance tracking MUST remain fully functional when that service is unavailable,
  misconfigured, or returns nothing. Suggestions are an enhancement and MUST NOT become a
  hard dependency of the app.
- Secrets and API keys MUST NOT be committed to the repository, and MUST NOT be embedded
  in client bundles. If a feature requires a secret, that requirement MUST be raised in
  the plan before implementation begins.

**The app is an installable PWA.** It MUST be installable to the home screen on iOS and
Android and MUST launch in a standalone window. This is a product requirement, not an
enhancement; a change to it requires an amendment.

- The build MUST ship a web app manifest (name, icons, `start_url`, standalone display)
  and the icon set and meta tags iOS requires to install and render correctly.
- A service worker MUST cache the app shell, so launching from the home screen without a
  network connection shows the app rather than a browser error page. **This is a floor,
  not offline-first**: individual features may legitimately require a network and say so.
  Full offline capability was considered and deliberately not adopted as a principle.
- The service worker MUST have a defined update path. A stale worker MUST NOT pin an
  installed user to an old bundle indefinitely, and the update MUST NOT discard work the
  user has in progress.
- Installed behaviour MUST be verified on a real device before a release is considered
  done. A PWA that passes in a desktop browser can still fail when installed.

**Room decor suggestions are LLM-generated.** Suggestions are produced by a Claude model
via the Anthropic API — not a curated in-repo ruleset. The recorded default model is
`claude-opus-5`; changing it is a PATCH amendment.

- The LLM MUST be reached through one module-level interface (the rule above), so the
  provider, model, and transport can change without touching feature code.
- Requests MUST use structured outputs with an explicit JSON schema. Feature code MUST NOT
  parse prose out of a free-text response.
- Automated tests MUST NOT call the live API. Tests MUST exercise the interface with a
  stubbed implementation — an LLM is non-deterministic and billed per call, and neither
  belongs in a test suite that Principle III requires to gate every change.
- Suggestions are advisory. They MUST be presented as generated, MUST NOT be applied to a
  room automatically, and MUST NOT be presented as fact about the user's flat.
- Every LLM call MUST have a defined failure path: a request that errors, times out, or
  returns nothing MUST leave the rest of the app usable and MUST surface a plain message
  rather than an empty view.
- **UNRESOLVED — MUST be settled in the first plan that touches suggestions**: where the
  API key lives. A browser-only SPA has nowhere to hold one that is neither the bundle nor
  the user's device, so this decision interacts directly with the static-deployment
  constraint above. The two candidates are a minimal server-side proxy function (which
  requires amending the static-only constraint) or a user-supplied key held on-device
  (which preserves it). No implementation of suggestions may begin until this is decided
  and this section amended to record it.

**Room design in 3D is planned, and it changes what this app is.** The app will let someone lay
out a room in three dimensions and decorate it. This is a major feature — larger than everything
built so far combined — and recording it here is what stops it arriving as a surprise that breaks
principles nobody re-read.

Three constraints follow, and they are binding on whatever specification eventually describes it.

- **The room MUST be a data model first, and 3D MUST be a view of that model.** Walls, dimensions
  and placed objects MUST be editable through ordinary lists and forms. The 3D canvas renders that
  model and MAY offer direct manipulation as an *alternative* way to do the same things. It MUST
  NOT be the only way to do any of them.

  This is not an architectural preference. Principle II requires every interactive flow to be
  operable without touching the screen, verified with VoiceOver on a real iPhone. Dragging an
  object around a canvas cannot satisfy that on its own. Without the model-first rule the feature
  contradicts a MUST that predates it, and a constitution cannot promise a feature that violates
  its own principles. Overturning this rule therefore means amending Principle II, not this
  paragraph.

  It also pays for itself elsewhere: the model is testable in the domain tier where this project's
  date logic already lives, and no 3D scene is required to test that a sofa cannot occupy a wall.

- **The 3D layer MUST NOT be loaded by anyone who has not asked for it.** The app is 220 kB of
  JavaScript today, 69 kB gzipped, and a 3D engine is several times that before any model or
  texture. SC-002-style promises — the overdue list legible within seconds of opening — apply to
  someone who opened the app to check the boiler and will never touch a room. The engine is loaded
  on demand or not at all.

- **The dependency MUST be recorded as a violation of Principle I, not argued into compliance.**
  A 3D engine cannot meet the three-call-site rule and is exactly the kind of thing that principle
  exists to make expensive. Principle I already provides for this: a violation with a justification
  is permitted, a violation dressed as compliance is not. The plan that introduces it records it in
  Complexity Tracking with what was rejected and why.

TODO(ROOM_3D_SCOPE): three questions are open and each changes the feature materially. Whether the
point is *designing* a room — placing and moving objects — or *seeing* one described elsewhere.
Whether this is the same feature as the LLM decor suggestions above, which would make a room the
place a suggestion is shown rather than two separate things. And whether the app is now a home app
whose first feature was maintenance, rather than a maintenance app with a designer attached; that
one decides what "simplicity" means for everything built after it.

TODO(ROOM_3D_DURABILITY): storage is `localStorage`, device-bound, with no export and no backup,
and this document has already recorded that detecting data loss is impossible. Losing a job list is
an annoyance. Losing a room someone spent an hour arranging is a different order of loss, and the
data is larger. Whether that is acceptable, or whether room design forces the export question this
project deliberately closed, MUST be settled before the feature is planned.

## Development Workflow & Quality Gates

**Specification flow**: Features follow the Spec Kit flow — constitution → specify →
plan → tasks → implement. A feature MUST NOT be implemented before its specification and
plan exist.

**Gates that MUST pass before a feature is complete**:

1. **Constitution Check** — the plan's Constitution Check section is filled in and
   passing, with any violation justified in Complexity Tracking.
2. **Tests** — the full test suite passes, and each new behaviour traces to a test that
   failed before its implementation existed.
3. **Accessibility** — focus visibility and AA contrast verified for every new or changed
   view, and every new or changed flow operable without touch, checked with VoiceOver on a
   real device. Automated keyboard traversal is supporting evidence and does not on its own
   discharge this gate.
4. **Dependencies** — no new dependency has been added without its justification.

**Review**: Every change is reviewed against these four gates explicitly. "Looks fine" is
not a review. A reviewer who cannot identify which test would have failed before the
change MUST request one.

## Governance

This constitution supersedes all other development practices for this project. Where a
habit, a tool default, or a generated template conflicts with it, this document wins and
the conflicting artifact MUST be corrected.

**Amendment procedure**: Amendments MUST be made by editing this file, MUST state the
version bump and its rationale in the Sync Impact Report at the top, and MUST propagate
to dependent templates (`.specify/templates/`) in the same change. An amendment that
leaves a template contradicting a principle is incomplete.

**Versioning policy** — semantic versioning:

- **MAJOR**: a principle is removed or redefined in a backward-incompatible way.
- **MINOR**: a principle or section is added, or its guidance materially expanded.
- **PATCH**: clarification, wording, or typo fixes that do not change what is required.

**Compliance review**: Compliance is verified at every review against the four quality
gates above. Complexity MUST be justified, never assumed. Agent-specific runtime guidance
lives in agent context files at the repository root and MUST NOT restate or contradict
this constitution — it points here instead.

**Version**: 1.6.0 | **Ratified**: 2026-08-07 | **Last Amended**: 2026-08-19
