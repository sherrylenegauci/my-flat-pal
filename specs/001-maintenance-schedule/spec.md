# Feature Specification: Maintenance Schedule

**Feature Branch**: `feat/001-maintenance-schedule`

**Created**: 2026-08-07 · **Rewritten in plain English**: 2026-08-08

**Status**: Draft

**Input**: "Maintenance schedule: let me keep track of the recurring upkeep my flat needs — things like boiler servicing, smoke alarm tests, filter changes, gutter clearing — so nothing is silently overdue. Each item recurs on its own interval, shows me what is due or overdue, and lets me mark it done so the next occurrence is scheduled. This is the first feature of the app and it stores user data."

---

## In one paragraph

Your flat needs jobs doing on a repeat: the boiler serviced every year, smoke alarms tested every
few months, filters changed, gutters cleared. Right now you keep that in your head, so things slip.
This feature lets you write each job down with how often it needs doing, see at a glance what's
overdue, and tick it off when it's done — at which point the app works out when it's next due.

That's the whole feature. It doesn't book anyone, doesn't track what things cost, and doesn't
remind you. It's a list that knows about dates.

**One thing to know up front:** your data lives only on this phone. There's no backup and no way to
export it. If you get a new phone, you start again. We chose that deliberately — see
[Decisions we made](#decisions-we-made).

---

## Clarifications

### Session 2026-08-11

- Q: FR-007 promised undo survives closing and reopening the app, but undo is now a short window — which changes? → A: Undo is a short window (~10s) for the completion just recorded; older corrections happen in the job's history in the detail view. FR-007's second sentence is replaced.
- Q: Adding a job with a last-done date records a completion — should that raise an undo offer? → A: No. Undo covers marking done and backdating only. A wrong date on a new job is fixed by editing the job.
- Q: When the app finds data from a newer version and refuses to save, what should the write controls do? → A: Hide or disable them, so the screen matches the message. The app becomes a viewer of your data.
- Q: Recording a job you did in the past is built but unspecified — keep it, and how much of it? → A: Keep it and specify it fully: past dates accepted, future dates refused, and an entry older than the newest one says the schedule has not moved.
- Q: SC-005 promises keyboard-only operation, but that is a desktop idea and is only evidenced on Chromium — what should it promise instead? → A: Operating the app without touch on a phone, checked with VoiceOver on a real iPhone. This is mobile-first, and it replaces Tab-order traversal as the thing the criterion points at. *(Conflict closed by constitution v1.4.0.)*
- Q: A ten-second window alone still lets a reload resurrect the offer (T102). Fix by storing which completion is undoable, or by scoping the offer to the session that recorded it? → A: Scope it to the session. Undo is offered only for a completion this session recorded, and never on a freshly opened app.

  **Note, because this looks like a reversal and is not one.** Session-scoping was removed from the original design precisely because it made a mis-tap permanent once the phone backgrounded, and at that time nothing else could recover it. The detail view now shows full history, so an older mistake has a home. Session-scoping is safe *because* that view exists, and would not have been before it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what my flat needs (Priority: P1)

I open the app and can tell straight away whether anything needs doing. I can add the jobs my flat
needs — boiler service, smoke alarm test, filter change — saying how often each one comes round and
when it was last done. Anything overdue is impossible to miss.

**Why this comes first**: writing the jobs down and seeing their status is the whole point. Neither
half works alone. An empty list does nothing for you, and a list you can't see back does nothing
either. Together they're the smallest useful thing.

**How to test it on its own**: add two jobs — one due next month, one that was due last year. The
overdue one should be at the top and should look different from the other.

**Acceptance Scenarios**:

1. **Given** I haven't added anything yet, **When** I open the app, **Then** it tells me what the
   app is for and offers me a way to add my first job.
2. **Given** I'm adding a job, **When** I type a name, say how often it recurs, and say when it was
   last done, **Then** it's saved and I'm shown when it's next due.
3. **Given** I have jobs saved, **When** I open the app, **Then** anything overdue is listed first
   and looks clearly different from things that aren't due yet.
4. **Given** a job isn't due for a while, **When** I look at the list, **Then** I can see when it's
   next due without tapping into it.
5. **Given** I close the app completely and come back days later, **When** it opens, **Then**
   everything I saved is still there.

---

### User Story 2 - Tick something off (Priority: P2)

I've just had the boiler serviced. I tick it off, and the app remembers it happened and works out
when the next one is due, so I don't have to count months myself.

**Why this comes second**: without it, the list goes stale after the first round and turns into a
pile of things that are permanently overdue. It needs User Story 1 to exist first, but it's a
separate piece of work: story 1 is writing things down, story 2 is keeping them true over time.

**How to test it on its own**: tick off something that's due. It should drop out of the overdue
group, remember the date, and show a sensible next due date — and still be there after a restart.

**Acceptance Scenarios**:

1. **Given** a job is due or overdue, **When** I tick it off, **Then** it stops showing as due and
   gets a new due date based on how often it recurs.
2. **Given** I've ticked something off, **When** I look at it, **Then** I can see when it was last
   done.
3. **Given** I have just ticked something off by mistake, **When** I undo it straight away, **Then**
   everything goes back exactly as it was, including the old due date.
3a. **Given** I ticked something off a while ago, **When** I open the app, **Then** I am not offered
   an undo for it — correcting that is done from the job's history, so nothing I did weeks ago can
   be deleted by a stray tap.
4. **Given** a job has been done several times, **When** I open it, **Then** I can see the full
   history, most recent first.

---

### User Story 3 - Fix the list when it's wrong (Priority: P3)

Things change. I decide the filter needs doing every six months instead of three, or I don't need
the gutter job any more. I can edit or delete jobs so the list keeps matching reality.

**Why this comes third**: a list you can't correct stops being trusted. But you get real value
before this exists — you can live with a slightly wrong schedule longer than you can live with no
schedule at all.

**How to test it on its own**: change how often something recurs and watch the due date move. Delete
something and watch it disappear.

**Acceptance Scenarios**:

1. **Given** a job I've saved, **When** I change its name or how often it recurs, **Then** it saves
   and the due date updates straight away.
2. **Given** a job I've saved, **When** I delete it, **Then** it's asked me to confirm first,
   because deleting also throws away its history.

---

### Edge Cases

The awkward situations, and what should happen:

- **You tick something off months late.** A job due in March, ticked off in June, is next due one
  interval after **June**. Its original timing drifts later. We accepted that — see
  [Decisions we made](#decisions-we-made).
- **You tick something off early.** Done today, wasn't due till next month? The next one counts
  from today. It shouldn't still be sitting there due next month.
- **Something's been overdue for years.** An annual job untouched for three years is *one* overdue
  job, not three separate ones piled up.
- **You don't know when it was last done.** Very common when you move in. The job gets no due date
  and sits with the overdue ones as needing attention. The app will not invent a date.
- **Midnight passes while the app is open.** Something due today has to become overdue when the day
  changes, even if the app has been sitting in your pocket.
- **Awkward dates.** Something due on the 31st, recurring monthly, in a month with 30 days.
- **Two jobs with the same name.** "Filter change" for two different filters is fine and allowed.
- **The phone wipes the app's storage, or you get a new phone.** There's no backup, so the history
  is gone. If the app can tell this has happened it should say so, rather than quietly acting like
  you're a new user. (In practice it usually can't tell — see the note in
  [Decisions we made](#decisions-we-made).)

---

## Requirements *(mandatory)*

These are written in strict language on purpose. Each one is something a test checks, so they need
to be precise rather than friendly. Everything above is the readable version.

### Functional Requirements

- **FR-001**: Users MUST be able to record a maintenance item with a name and a recurrence interval.
- **FR-002**: Users MUST be able to record when an item was last done, including at the point of
  first adding it.
- **FR-003**: The system MUST derive and display each item's next due date from its interval and
  its last completion.
- **FR-004**: The system MUST classify each item as never done, overdue, due, or not yet due, and
  MUST present items needing attention ahead of the rest.
- **FR-004a**: An item recorded without a last-completion date MUST be held as never done. The
  system MUST NOT infer or fabricate a completion date for it, and MUST NOT show it a due date
  until it has been completed at least once.
- **FR-005**: The system MUST re-evaluate due status when the date changes, without the user
  reloading or reinstalling the app.
- **FR-006**: Users MUST be able to mark an item done, which MUST record the completion and schedule
  the next occurrence.
- **FR-006a**: Users MUST be able to record a job they did in the past but did not log at the time.
  A date in the future MUST be refused and nothing saved. If the date entered is older than the most
  recent completion already recorded, the entry MUST be added to the history and the schedule MUST
  NOT move — and the system MUST say so, because a tap that appears to do nothing reads as a fault.
- **FR-007**: Users MUST be able to undo a completion immediately after recording it. The offer
  MUST be limited to a completion recorded **in the current session**, and MUST expire a short time
  after that — around ten seconds. It MUST NOT be offered on a freshly opened app, whatever the
  clock says, and MUST NOT be offered for any completion this session did not record.
- **FR-007a**: Undo MUST affect only the completion the user has just recorded. It MUST NOT
  remove any earlier completion, and repeated use MUST NOT walk backwards through history.
  Correcting an older mistake is done from the item's history, not from the undo offer — and the
  system MUST provide that correction: a user MUST be able to remove any single completion from an
  item's history, after confirming. Removing one MUST NOT affect any other completion or any other
  item. Because an item's next due date is derived from its last completion, removing one can move
  the schedule, and the confirmation MUST say what it does to that item's schedule rather than
  asking a generic "are you sure" — including saying so when the schedule does not move, for the
  reason FR-006a already gives.

  *This last part described the app for some time before it was true of it. The history was a
  read-only list of dates, so between undo's ten-second window and deleting the whole item there
  was no way to correct a mistaken completion at all. Made true by T103.*
- **FR-007b**: Undo applies to marking an item done and to recording a past completion. It MUST
  NOT be offered for the completion created by adding a new item with a last-done date — the user
  added an item rather than completing one, and undo would strip the date while leaving the item.
  A wrong date on a new item is corrected from the item's history under FR-007a — remove that entry
  and record the right one — not by editing the item. FR-009's edit covers the name and the
  interval; a Completion is immutable once saved (see Key Entities), so there is no last-done field
  on the edit form to correct.

  *This sentence used to say the correction was "done by editing it (FR-009)", which was never
  something FR-009 provided. Reworded once FR-007a's route existed to point at (T111).*
- **FR-008**: The system MUST retain the completion history of each item and present it in date
  order.
- **FR-009**: Users MUST be able to edit an item's name and interval, and MUST be able to delete an
  item after confirming.
- **FR-010**: The system MUST persist all items and history across app closure, device restart, and
  app updates.
- **FR-010a**: If the stored data was written by a newer version of the app, the system MUST refuse
  to save rather than risk damaging it, and MUST make that visible: every control that would change
  something MUST be hidden or disabled, so what is on screen matches what the app says. A control
  that appears usable but silently does nothing MUST NOT be shown.
- **FR-011**: The system MUST show an empty state that explains the app's purpose when no items
  exist.
- **FR-012**: The system MUST NOT present a long-overdue recurring item as multiple outstanding
  occurrences.
- **FR-013**: The system MUST calculate an item's next due date from the date it was actually
  completed, not from the due date it was meant to meet.
- **FR-013a**: Completing an item **as of today** MUST NOT leave it due or overdue again
  immediately. A completion recorded with a **past** date MAY leave the item due or overdue, and
  when it does the system MUST show that plainly. If the boiler was last serviced two years ago and
  the interval is annual, overdue is the truth and the app should say so.
- **FR-014**: The system MUST convey due and overdue status whenever the user opens the app, and
  MUST NOT rely on device notifications to do so.

### Key Entities

- **Maintenance Item**: a job the flat needs doing repeatedly. Has a name, how often it recurs, a
  status, and — once it's been done at least once — a next due date. Owns its own history.
- **Completion**: a record that a job was done on a particular date. Can't be edited once saved —
  it is undone within the undo window, or removed from the item's history after confirming
  (FR-007a). Correcting one means removing it and recording the right one.
- **Recurrence Interval**: how often a job comes round, in days, weeks, months, or years.

---

## Success Criteria *(mandatory)*

How we know it worked:

- **SC-001**: Someone can record their first job within 60 seconds of opening the app for the first
  time, without being told how.
- **SC-002**: On opening the app, you can tell whether anything is overdue within 5 seconds, without
  scrolling or tapping.
- **SC-003**: Every job whose due date has passed shows as overdue, with nothing needed from you to
  refresh it.
- **SC-004**: Ticking something off takes no more than two taps from the main screen.
- **SC-005**: Every part of this can be operated on a phone without touching the screen, checked
  with VoiceOver on a real iPhone — swiping between elements and double-tapping, which is how
  someone who cannot use touch actually drives a phone. WCAG 2.1 AA contrast throughout, and touch
  targets of at least 44x44px. *(Required by the project constitution.)*

  Tab-order traversal in a desktop browser is no longer what this criterion points at. It was a
  poor proxy for a phone app, and it was only ever evidence from Chromium: Safari does not Tab to
  buttons unless the user turns that on, so the browser tier honestly skips the sweep there rather
  than reporting a pass for a traversal that never happened.

  Keyboard operability is still required — it is WCAG 2.1.1 at Level A, and the constitution's
  semantic-HTML rule delivers it by construction. It is simply no longer what we point at when we
  claim this app is accessible. *(Conflict closed by constitution v1.4.0, 2026-08-11.)*
- **SC-006**: Every part of this works in the installed app on a real phone, with nothing hidden
  behind the notch or home indicator, and without depending on browser buttons. *(Also required by
  the constitution.)*
- **SC-007**: After closing the app, restarting the phone, and reopening, everything is still there.

---

## Decisions we made

Four things we decided along the way, with what each one costs. Recorded so nobody later mistakes
them for oversights.

### We're not doing reminders *(2026-08-07)*

**The app won't notify you.** It shows you what's overdue when you open it, and that's all.
Notifications are a separate feature for later.

**What this costs you**: something overdue goes unnoticed until you open the app. That's the exact
"silently overdue" problem that prompted this feature, so this is a partial answer, not a complete
one. We chose it because notifications on installed web apps work quite differently on iPhone and
Android, and that needs proper research rather than a guess.

### Due dates count from when you actually did it *(2026-08-07)*

Tick something off three months late, and the next one is due one interval from **today**, not from
the date you missed.

**What this costs you**: timing drifts. A job you meant to do every spring can wander across the
year. We chose it because the alternative can mark something overdue the instant you finish it, and
an app that nags about work you just did stops being believed.

### Jobs you've never done have no due date *(2026-08-07)*

If you don't know when the boiler was last serviced, say so. The job sits with the overdue ones as
needing attention until you do it once.

**Why**: the app inventing a service date would corrupt the very record you're keeping it for.

### No backup, no export *(2026-08-07)*

We specified an export feature and then cut it.

**What this costs you**: a new phone means starting from scratch, and if the phone clears the app's
storage the history is gone with no way back. We weighed two arguments — storage being wiped (real
but hard to predict) and getting a new phone (certain, on a two-or-three-year clock) — and decided
neither justified building it now. Worth revisiting if the app becomes something you're keeping
years of history in.

---

## Assumptions

Sensible defaults we picked without asking. Any of them can be changed.

- **One person, one flat.** No accounts, no logging in, no sharing with a flatmate or landlord.
- **Everything stays on the device.** No server, nothing synced anywhere.
- **We keep the full history, not just the last date.** "When was the boiler last serviced?" is
  worth answering years later, and for some jobs worth being able to prove.
- **Dates use the phone's own timezone**, and a job is due for the whole of its due date rather than
  at a particular time.
- **Recurrence is simple**: every N days, weeks, months, or years. Not "first Monday of the month",
  and nothing weather-dependent.
- **The app doesn't come with a starter list.** You add what your flat needs. A set of common jobs
  could be added later.

---

## Out of Scope

Named clearly so the edges are testable:

- Reminders and notifications *(a separate feature — see Decisions)*
- Export, import, and backup *(specified, then cut — see Decisions)*
- Contractors, bookings, costs, invoices
- Photos or documents, like service certificates
- Multiple properties or rooms
- Sharing, syncing, or using it on more than one device
- The room decor suggestions feature — that's its own thing, with its own unresolved questions
