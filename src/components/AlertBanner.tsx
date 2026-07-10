import { useReminders } from '../context/RemindersContext';
import { useTimetable } from '../context/TimetableContext';

// Rendered unconditionally in App.tsx (like EnergyButton/NowPlayingBar) so an alert
// fires no matter which tool is currently open — this component doesn't belong to
// either Remind Me's or Timetable's own component tree, it just reads both global
// stores. Originally just "ReminderBanner"; renamed and merged when Timetable needed
// the exact same "fires independent of what's on screen, top-center stack" behavior —
// every screen corner/edge is already claimed (see designs/architecture-overview.md's
// corner-claim table), so a second independent fixed-position stack would either
// overlap this one or need to steal a slot from something else. Two real, distinct
// event sources sharing one rendered stack is also squarely the Rule-of-Three case
// CODING_GUIDELINES.md talks about, not a premature abstraction — Reminders and
// Timetable keep their own contexts and their own state for unrelated reasons; only
// the display layer merges them.
export function AlertBanner() {
  const { firedEvents, dismissEvent } = useReminders();
  const { alerts, dismissAlert } = useTimetable();

  if (firedEvents.length === 0 && alerts.length === 0) return null;

  return (
    <div className="alert-banner-stack">
      {firedEvents.map((event) => (
        <div
          key={event.id}
          className={`alert-banner-item alert-banner-${event.kind}`}
          role="status"
        >
          <span aria-hidden="true">{event.kind === 'warning' ? '⏳' : '⏰'}</span>
          <span className="alert-banner-text">
            {event.kind === 'warning' ? 'Coming up: ' : 'Reminder: '}
            {event.message}
          </span>
          <button type="button" onClick={() => dismissEvent(event.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
      {alerts.map((alert) => (
        <div key={alert.id} className="alert-banner-item alert-banner-lesson" role="status">
          <span aria-hidden="true">🔔</span>
          <span className="alert-banner-text">{alert.text}</span>
          <button type="button" onClick={() => dismissAlert(alert.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
