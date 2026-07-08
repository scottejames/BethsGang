import { useReminders } from '../context/RemindersContext';

// Rendered unconditionally in App.tsx (like EnergyButton/NowPlayingBar) so a reminder
// fires no matter which tool is currently open — this component doesn't belong to the
// Remind Me tool's own component tree, it just reads the same global store.
export function ReminderBanner() {
  const { firedEvents, dismissEvent } = useReminders();

  if (firedEvents.length === 0) return null;

  return (
    <div className="reminder-banner-stack">
      {firedEvents.map((event) => (
        <div
          key={event.id}
          className={`reminder-banner-item reminder-banner-${event.kind}`}
          role="status"
        >
          <span aria-hidden="true">{event.kind === 'warning' ? '⏳' : '⏰'}</span>
          <span className="reminder-banner-text">
            {event.kind === 'warning' ? 'Coming up: ' : 'Reminder: '}
            {event.message}
          </span>
          <button type="button" onClick={() => dismissEvent(event.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
