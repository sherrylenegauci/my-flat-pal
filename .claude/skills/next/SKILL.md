---
name: next
description: Work out where the feature stands and do the next thing — orienting from tasks.md, running the right Spec Kit step, and delegating tests and verification to the standing agents. Use when the user says "next", "carry on", "keep going", or asks what to do next, instead of them invoking each speckit skill by hand.
---

# Next

Orient, then do the next piece of work. The user should not have to remember which Spec Kit
step comes next, or which agent to invoke.

**This is not autonomy.** You stop and ask at real decision points. The most valuable
moments in this project have been the ones where work paused and asked — cutting the export
feature, deferring notifications, choosing the due-date anchoring rule. A version of this
that guesses at those is worse than no skill at all.

## 1. Orient before doing anything

```bash
cd "$(git rev-parse --show-toplevel)"
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; nvm use 24 >/dev/null 2>&1
T=specs/001-maintenance-schedule/tasks.md
grep -c '^- \[X\] T' $T; grep -c '^- \[ \] T' $T
grep -n '^- \[ \] T' $T | head -12          # what is next
git branch --show-current; git status --short
npx vitest run 2>&1 | tail -3               # is the suite green before you start
```

Report where things stand in two or three lines before proceeding. If the suite is red or
the tree is dirty, deal with that first — never start new work on a broken base.

## 2. Choose the next action from the state

| State | Do this |
|---|---|
| Tasks remain in the current phase | Work through them in order, test-first |
| A user story's tasks are all done | Run `behaviour-verification` on it before moving on |
| A phase just completed | Commit, then report the checkpoint and stop for a decision |
| Only Phase 6 remains | These are mostly verification, and several need a real device — see below |
| Everything is done | Say so, and name what still blocks release |

## 3. How to do the work

**Test-first, always.** Principle III is NON-NEGOTIABLE. Write the test, run it, confirm it
fails *for the right reason* — a module-not-found error proves nothing, so stub first if
needed — then implement.

**Delegate test writing to the `test-automation` agent** when a task adds a substantial set
of tests. It knows the three-tier strategy, the StrictMode requirement, and what this
environment genuinely cannot check. For a single small test, just write it.

**Delegate verification to the `behaviour-verification` agent** whenever a user story is
claimed complete. Do not grade your own work; that is what it is for. Relay its findings
honestly, including the ones that make the work look unfinished.

**Mark tasks `[X]` as you finish them** and keep `tasks.md` truthful. If a task turns out to
be wrong or unnecessary, say so rather than ticking it.

## 4. Stop and ask when

- Two documents disagree, or a requirement contradicts itself
- A decision would narrow, widen, or change the shape of the feature
- Something needs a real device or a real browser — you cannot do those
- A platform assumption is load-bearing and unverified — check it first, do not build on it
- The work would touch the constitution
- A test fails and the honest fix is to change the test rather than the code

That last one especially. "Test failed, changed test" deserves the user's eyes on it.

## 5. Never do these without being asked

- Merge, push, or open a pull request
- Close a GitHub issue for work that is not actually done
- Mark a constitution gate PASS when its predicate is a verification nobody performed
- Write a test that cannot check the thing it claims to check — contrast in jsdom is the
  standing example. Record the gap instead

## 6. Finish by reporting

- What you did, and what it now does that it did not before
- What the suite says — run it, do not assume
- Anything you found that was wrong, including in your own earlier work
- What is next, and what needs the user rather than you

Keep it short. The user has been reading these all session.
