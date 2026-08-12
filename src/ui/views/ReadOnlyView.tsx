/**
 * What the app shows when the saved document came from a newer build (T099,
 * FR-010a).
 *
 * **Why there is a whole view for this.** `load()` deliberately refuses to parse
 * a document whose schema it does not know — half-parsing it and then saving
 * would overwrite the user's newer records with a downgraded copy, the worst
 * thing this design can do. It therefore hands back an *empty* document, and the
 * app used to render the ordinary empty state on top of that: a heading reading
 * "Nothing recorded yet" and a button offering to add the first job.
 *
 * Both were untrue. The button did nothing at all — `save` throws
 * `ReadOnlyError`, React does not catch throws from event handlers, so the tap
 * saved nothing and said nothing, which is precisely the control FR-010a says
 * must not be shown. And the heading claimed the user's schedule was empty when
 * the truth is that this build declined to read it. In an app with no export and
 * no backup, being told your records are gone is not a small thing to get wrong.
 *
 * So this screen carries no controls at all. There is genuinely nothing the user
 * can do here except update the app, and offering them something to press would
 * be the same lie in a different shape.
 */
export function ReadOnlyView() {
  return (
    <div className="empty">
      <h2 className="empty__title">Your jobs aren’t shown here</h2>
      <p className="empty__body">
        They were saved by a newer version of this app, and this one can’t read them
        safely — so rather than guess at them, it shows nothing and changes nothing.
        Everything you recorded is still on this device, exactly as you left it, and
        updating the app should bring it back.
      </p>
    </div>
  )
}
