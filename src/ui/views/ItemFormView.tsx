import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Interval, IntervalUnit } from '../../domain/types'
import type { NewItemInput } from '../useSchedule'

/**
 * Adding a job (T051), and correcting one (T068).
 *
 * Validation happens on submit rather than on every keystroke, so the form does
 * not shout at you while you are still typing. Errors are tied to their field
 * with `aria-describedby` and `aria-invalid`, which is what makes them
 * available to a screen reader rather than only visible.
 *
 * **One form for both jobs, not two.** They ask for the same two things under
 * the same rules; a second component would be the same validation and the same
 * markup with a different heading, and the first divergence between the copies
 * would be a bug in one of them. What differs is what `editing` changes below —
 * the heading, the submit label, the starting values, and whether the last-done
 * field is there at all.
 *
 * **Why editing has no "last done" field.** FR-009 covers the name and the
 * interval. A completion is immutable once saved (spec, Key Entities), so this
 * field cannot mean "correct the date" — it could only append another
 * completion, which is what the detail view's "Add a date you did it" already does,
 * or silently rewrite history, which nothing in the spec permits.
 *
 * **An open contradiction, not a decision taken here.** FR-007b says a wrong
 * last-done date on a *new* job "is corrected by editing it (FR-009)", and
 * FR-009 provides no way to edit a date. Removing the entry from the job's
 * history would do it, and that is T103 — unbuilt. Reported rather than
 * resolved: widening FR-009 is Sherrylene's call.
 */
/**
 * The four periods. Only `value` is data — the label is display, and it moves
 * with the count beside it (T115).
 *
 * **The count decides, never the unit**, which is `formatInterval`'s rule in
 * `../format.ts` and is why this reads `count === 1` rather than switching on
 * the unit. Keying off the unit reads correctly on the annual job that prompts
 * the change and turns a quarterly filter into a monthly one.
 *
 * `Number(count)` rather than the raw string because the count is form state
 * and is therefore text: "1" is singular, "01" is singular, "" and "3" and
 * anything unparseable are plural. Plural is the right answer for zero in
 * English and the safe answer for a half-typed number, and the count is
 * validated on submit anyway.
 *
 * Every unit here pluralises by adding an s, so this is a suffix and not a
 * lookup table — the same decision, for the same reason, as `formatInterval`.
 */
const UNITS: IntervalUnit[] = ['day', 'week', 'month', 'year']

function periodLabel(unit: IntervalUnit, count: string): string {
  return Number(count) === 1 ? unit : `${unit}s`
}

interface Errors {
  name?: string
  count?: string
  lastDone?: string
}

export function ItemFormView({
  today,
  editing,
  onSave,
  onCancel,
}: {
  today: string
  /** The job being corrected (FR-009). Absent when adding a new one. */
  editing?: { name: string; interval: Interval }
  onSave: (input: NewItemInput) => void
  onCancel: () => void
}) {
  const ids = useId()
  // Filled in from what is already stored. A blank edit form is a re-entry
  // form: it asks the user to retype what the app already knows, and a slip
  // loses the real value.
  const [name, setName] = useState(editing?.name ?? '')
  const [count, setCount] = useState(String(editing?.interval.count ?? 1))
  const [unit, setUnit] = useState<IntervalUnit>(editing?.interval.unit ?? 'year')
  const [lastDone, setLastDone] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function validate(): Errors {
    const found: Errors = {}

    if (name.trim() === '') found.name = 'Give the job a name, so you know what it refers to.'

    const parsed = Number(count)
    if (!Number.isInteger(parsed) || parsed < 1) {
      found.count = 'How often it comes round must be a whole number, at least 1.'
    }

    // You cannot have already done something you have not done yet.
    if (lastDone !== '' && lastDone > today) {
      found.lastDone = 'That date is in the future. Leave it blank if it has never been done.'
    }

    return found
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    onSave({
      name,
      interval: { count: Number(count), unit },
      lastDone: lastDone === '' ? undefined : lastDone,
    })
  }

  const field = (key: keyof Errors) => ({
    'aria-invalid': errors[key] ? ('true' as const) : undefined,
    'aria-describedby': errors[key] ? `${ids}-${key}-error` : undefined,
  })

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2 className="form__title">{editing ? 'Edit job' : 'Add a job'}</h2>

      <div className="form__field">
        <label htmlFor={`${ids}-name`}>Name</label>
        <input
          id={`${ids}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          {...field('name')}
        />
        {errors.name && (
          <p className="form__error" id={`${ids}-name-error`} role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* T115 — the question is asked once. The legend asks it; the field says
          "Every". It previously read "How often does it need doing?" and then,
          one line below, "How often — every".

          **Why the input borrows the legend back through `aria-labelledby`.** A
          `<legend>` names the fieldset's *group*, not the controls inside it —
          so with the label alone shortened, this input's accessible name
          computes to a bare "Every", which is thinner than the self-contained
          "How often — every" it replaced. Whether a screen reader reads the
          group's name before the field is the assistive technology's own
          decision, and on iOS it is not something this repo can establish; the
          explicit reference makes the name correct without depending on it.

          The cost, recorded because it is a real one: where the group name *is*
          announced, the question is heard twice — once for the group, once in
          the field's name. Which of the two reads better on a phone is a
          VoiceOver question, not a jsdom one. */}
      <fieldset className="form__field form__field--inline">
        <legend id={`${ids}-interval`}>How often does it need doing?</legend>
        <label id={`${ids}-count-label`} htmlFor={`${ids}-count`}>
          Every
        </label>
        <input
          id={`${ids}-count`}
          type="number"
          inputMode="numeric"
          min={1}
          value={count}
          aria-labelledby={`${ids}-interval ${ids}-count-label`}
          onChange={(e) => setCount(e.target.value)}
          {...field('count')}
        />
        {/* The label stays in the DOM but not on screen. The row already reads
            as a sentence — "Every 1 year" — so a visible "Period" adds nothing
            for a sighted user, and as a fourth item in a three-column grid it
            wrapped the dropdown onto its own row, stranding it from the label
            naming it. A screen reader still announces it, because a bare
            dropdown of day/week/month/year out of context does not say what it
            sets. */}
        <label className="visually-hidden" htmlFor={`${ids}-unit`}>
          Period
        </label>
        <select
          id={`${ids}-unit`}
          value={unit}
          onChange={(e) => setUnit(e.target.value as IntervalUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {periodLabel(u, count)}
            </option>
          ))}
        </select>
        {errors.count && (
          <p className="form__error" id={`${ids}-count-error`} role="alert">
            {errors.count}
          </p>
        )}
      </fieldset>

      {!editing && (
        <div className="form__field">
          <label htmlFor={`${ids}-lastDone`}>Last done (leave blank if you don’t know)</label>
          <input
            id={`${ids}-lastDone`}
            type="date"
            value={lastDone}
            max={today}
            onChange={(e) => setLastDone(e.target.value)}
            {...field('lastDone')}
          />
          {errors.lastDone && (
            <p className="form__error" id={`${ids}-lastDone-error`} role="alert">
              {errors.lastDone}
            </p>
          )}
        </div>
      )}

      <div className="form__actions">
        <button type="submit" className="button button--primary">
          {editing ? 'Save changes' : 'Save job'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
