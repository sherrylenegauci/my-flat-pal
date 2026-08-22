# Specification Quality Checklist: App shell

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

All 16 pass. Four judgements worth recording.

**On "no implementation details".** The spec says "tabs along the bottom" in Assumptions rather than
in a requirement, which is the honest place for it: the requirements say a top-level structure must
exist, be reachable in one action, and indicate the current area. Tabs are how, and a plan could
reasonably propose otherwise. The one place it comes close is FR-009's safe areas, which names a
device concern — but it is written as an outcome (content is not obscured) rather than as a
technique.

**On "requirements are testable".** FR-004 and FR-008 are the two most likely to be tested
vacuously. FR-004 forbids colour alone, which `e2e/colour-independence.spec.ts` already knows how to
check by stripping colour and re-reading. FR-008 is a MUST NOT — the structure must not appear when
there is one area — and this project has shipped two negative requirements whose tests could not
fail, so it needs proving by sabotage rather than by a green run.

**On measurability, and the one that matters.** SC-002 is restated from 001 rather than inherited.
This feature is the most likely thing in the app's history to break it: the maintenance list fits
four jobs above the fold with about 46 pixels of headroom, and a bottom bar spends some of that.
A criterion inherited silently is a criterion nobody re-checks — and 001's own SC-001 and SC-002 sat
unverified for a fortnight for exactly that reason.

**One thing deliberately not specified.** Whether the rooms tab appears before rooms are built. The
spec says the structure is hidden while only one area exists (FR-008), which settles it by
implication: no rooms, no second tab, no bar. If a tab leading to "nothing here yet" is wanted
instead, that is a change to FR-008 and should be made as one rather than assumed.
