<!--
SYNC IMPACT REPORT
==================
Version change: 1.2.1 → 1.2.2
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
- Every interactive flow MUST be completable by keyboard alone, with a visible focus
  indicator at all times.
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
- Every user story in a specification MUST have at least one test that demonstrates its
  acceptance scenarios end to end.
- Bug fixes MUST begin with a failing test that reproduces the bug.

**Rationale**: Test-first is what makes the other two principles enforceable. It is the
only mechanism that keeps a refactor toward simplicity safe, and it is the gate at which
accessibility assertions can be made to hold automatically rather than by memory.

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

## Development Workflow & Quality Gates

**Specification flow**: Features follow the Spec Kit flow — constitution → specify →
plan → tasks → implement. A feature MUST NOT be implemented before its specification and
plan exist.

**Gates that MUST pass before a feature is complete**:

1. **Constitution Check** — the plan's Constitution Check section is filled in and
   passing, with any violation justified in Complexity Tracking.
2. **Tests** — the full test suite passes, and each new behaviour traces to a test that
   failed before its implementation existed.
3. **Accessibility** — keyboard traversal, focus visibility, and AA contrast verified for
   every new or changed view.
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

**Version**: 1.2.2 | **Ratified**: 2026-08-07 | **Last Amended**: 2026-08-08
