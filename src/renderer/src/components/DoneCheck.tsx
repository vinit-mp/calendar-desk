import type { CalendarEvent } from '../../../shared/types'

interface Props {
  event: CalendarEvent
  onToggle: (event: CalendarEvent) => void
}

/** Round tick that marks an event done. Stops the click so the event itself doesn't open. */
export default function DoneCheck({ event, onToggle }: Props): React.JSX.Element {
  return (
    <button
      type="button"
      className={`check${event.done ? ' is-done' : ''}`}
      aria-pressed={event.done}
      aria-label={event.done ? `Mark “${event.summary}” not done` : `Mark “${event.summary}” done`}
      title={event.done ? 'Mark not done' : 'Mark done'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(event)
      }}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="m2.5 6.2 2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
