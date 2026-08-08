# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates derived from the project constitution (`.specify/memory/constitution.md`, v1.2.2).
Mark each PASS, FAIL, or PLANNED. Any FAIL must be justified in Complexity Tracking below.

**Use PLANNED, not PASS, for any gate whose test is a completed verification.** A plan cannot
truthfully claim something was "verified on a real device" before code exists. Name the task that
will discharge it. A gate marked PASS is a statement that it already holds.

**Record violations as violations.** Principle I offers no category for a SHOULD you overrode and
would rather not call a violation — a justified override is still a violation, and it belongs in
Complexity Tracking. Listing one there while the section says "no violations" is how a gate reads
PASS when it has not earned it.

| # | Gate | Constitution | Status |
|---|------|--------------|--------|
| 1 | Every new dependency is named and justified; **a dependency used at fewer than three non-trivial call sites SHOULD be local code instead**; no abstraction introduced before a second concrete use case; **every violation of any of these recorded in Complexity Tracking below** | I. Simplicity & Minimal Dependencies | [PASS/FAIL] |
| 2 | UI designed at 375px first; 44x44px touch targets; semantic HTML; full keyboard operation with a visible focus indicator; **text alternatives on meaningful images and icons**; WCAG 2.1 AA contrast; **verified per view before the feature is complete, not deferred to polish** | II. Accessibility & Mobile-First | [PASS/FAIL/PLANNED] |
| 2b | Works installed: standalone-window navigation (no reliance on browser back/URL bar), safe-area insets respected, verified on a real device | II + Technology Constraints — PWA | [PASS/FAIL/PLANNED] |
| 3 | Tests precede implementation for every behaviour; each user story has a test covering its acceptance scenarios | III. Test-First (NON-NEGOTIABLE) | [PASS/FAIL] |
| 4 | Remains a static-deployable React/Vite SPA; any external or AI-backed service sits behind one interface and is not required for maintenance tracking to work | Technology Constraints | [PASS/FAIL] |
| 5 | No secrets committed or embedded in the client bundle | Technology Constraints | [PASS/FAIL] |
| 6 | *(only if this feature touches decor suggestions)* Key custody decided and this section of the constitution amended to record it; structured outputs with an explicit schema; tests stub the LLM interface rather than calling the live API; suggestions presented as advisory with a defined failure path | Technology Constraints — LLM suggestions | [PASS/FAIL/N-A] |

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
