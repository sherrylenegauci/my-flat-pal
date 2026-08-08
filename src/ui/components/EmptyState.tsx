export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <h2 className="empty__title">Nothing recorded yet</h2>
      <p className="empty__body">
        Your flat needs certain jobs doing on a repeat — the boiler serviced, smoke alarms
        tested, filters changed. Write them down here with how often they come round, and this
        keeps track of what’s due so you don’t have to.
      </p>
      <button type="button" className="button button--primary" onClick={onAdd}>
        Add your first job
      </button>
    </div>
  )
}
