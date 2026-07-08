import { useState } from 'react';
import { useReminders } from '../../context/RemindersContext';
import type { RepeatRule } from '../../context/RemindersContext';
import { parseReminderText } from '../../lib/reminderParser';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function warnAtDate(fireAt: Date, warnBeforeMinutes: number | undefined): Date | undefined {
  return warnBeforeMinutes === undefined ? undefined : new Date(fireAt.getTime() - warnBeforeMinutes * 60_000);
}

function repeatLabel(repeat: RepeatRule): string | undefined {
  switch (repeat.kind) {
    case 'daily':
      return 'Repeats daily';
    case 'weekdays':
      return 'Repeats on weekdays';
    case 'interval':
      return `Repeats every ${repeat.amount} ${repeat.unit}`;
    case 'none':
    default:
      return undefined;
  }
}

function RemindMe() {
  const { reminders, addReminder, cancelReminder } = useReminders();
  const [nlText, setNlText] = useState('');

  const trimmedNlText = nlText.trim();
  const nlPreview = trimmedNlText ? parseReminderText(trimmedNlText) : null;
  const nlPreviewWarnAt = nlPreview?.ok ? warnAtDate(nlPreview.fireAt, nlPreview.warnBeforeMinutes) : undefined;

  function handleNlSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nlPreview?.ok) return;

    addReminder({
      message: nlPreview.message,
      fireAt: nlPreview.fireAt,
      warnBeforeMinutes: nlPreview.warnBeforeMinutes,
      repeat: nlPreview.repeat,
    });
    setNlText('');
  }

  const sortedReminders = [...reminders].sort(
    (a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime(),
  );

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Say it in plain English — start with "remind me", say when, optionally what to
        do, and optionally a warning. A few things that work:
      </p>
      <ul className="reminder-examples">
        <li>"remind me in 20 mins to have lunch"</li>
        <li>"remind me in an hour and a half to eat food"</li>
        <li>"remind me at 5:30 to go home, warn me 20 mins before"</li>
        <li>"remind me half past five to go home"</li>
        <li>"remind me every day at 9am to take meds"</li>
        <li>"remind me every weekday at 9 to stand up"</li>
      </ul>

      <form onSubmit={handleNlSubmit} className="tool-form">
        <textarea
          value={nlText}
          onChange={(event) => setNlText(event.target.value)}
          placeholder="Remind me in 20 mins to have lunch…"
          rows={2}
        />
        {nlPreview && (
          <p className={`reminder-preview${nlPreview.ok ? '' : ' reminder-preview-error'}`}>
            {nlPreview.ok
              ? `I'll remind you to "${nlPreview.message}" at ${formatDateTime(nlPreview.fireAt)}${
                  nlPreviewWarnAt ? ` — with a warning at ${formatDateTime(nlPreviewWarnAt)}` : ''
                }${repeatLabel(nlPreview.repeat) ? ` — ${repeatLabel(nlPreview.repeat)}` : ''}.`
              : nlPreview.reason}
          </p>
        )}
        <button type="submit" disabled={!nlPreview?.ok}>
          Set reminder
        </button>
      </form>

      <hr className="reminder-divider" />

      <h2 className="reminder-list-heading">Active reminders</h2>
      {sortedReminders.length === 0 ? (
        <p className="reminder-empty">No reminders set yet.</p>
      ) : (
        <ul className="reminder-list">
          {sortedReminders.map((reminder) => {
            const fireAt = new Date(reminder.fireAt);
            const warnAt = warnAtDate(fireAt, reminder.warnBeforeMinutes);
            const repeatText = repeatLabel(reminder.repeat);

            return (
              <li key={reminder.id} className="reminder-item">
                <div className="reminder-item-details">
                  <p className="reminder-item-message">{reminder.message}</p>
                  <p className="reminder-item-meta">Reminder: {formatDateTime(fireAt)}</p>
                  {warnAt && (
                    <p className="reminder-item-meta reminder-item-meta-warn">
                      Warning: {formatDateTime(warnAt)}
                    </p>
                  )}
                  {repeatText && <p className="reminder-item-meta">{repeatText}</p>}
                </div>
                <button type="button" className="copy-button" onClick={() => cancelReminder(reminder.id)}>
                  Cancel
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const remindMeTool: ToolDefinition = {
  meta,
  Component: RemindMe,
};
