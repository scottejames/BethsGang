import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { DAYS, useTimetable } from '../../context/TimetableContext';
import type { DayOfWeek, TimetableEntry, TimetableEntryInput } from '../../context/TimetableContext';
import { Modal } from '../../components/Modal';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

// Cycles the app's real 6-color rainbow palette, hashed from the lesson's own label —
// the same subject reads as the same color everywhere it appears across the week, a
// real pattern-recognition aid rather than decoration (see the CSS comment on
// .timetable-lesson-card).
const RB_KEYS = ['rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6'];
function colorForLabel(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index++) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }
  return RB_KEYS[hash % RB_KEYS.length];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatClock(time: string): string {
  const totalMinutes = timeToMinutes(time);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'pm' : 'am';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${minutes < 10 ? '0' + minutes : minutes}${period}`;
}

function formatTimeRange(start: string, end?: string): string {
  return end ? `${formatClock(start)} – ${formatClock(end)}` : formatClock(start);
}

function todayKey(): DayOfWeek {
  return DAYS[(new Date().getDay() + 6) % 7];
}

interface EditingState {
  day: DayOfWeek;
  entry: TimetableEntry | null;
}

function Timetable() {
  const { entries, addEntry, updateEntry, deleteEntry, copyDay } = useTimetable();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [copyingDay, setCopyingDay] = useState<DayOfWeek | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<DayOfWeek>>(new Set());

  const [fDay, setFDay] = useState<DayOfWeek>('monday');
  const [fStart, setFStart] = useState('09:00');
  const [fEnd, setFEnd] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [fAlert, setFAlert] = useState('');

  const entriesByDay: Record<DayOfWeek, TimetableEntry[]> = {
    monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
  };
  entries.forEach((entry) => entriesByDay[entry.dayOfWeek].push(entry));
  DAYS.forEach((day) => entriesByDay[day].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));

  function openAdd(day: DayOfWeek) {
    setEditing({ day, entry: null });
    setFDay(day);
    setFStart('09:00');
    setFEnd('');
    setFLabel('');
    setFLocation('');
    setFAlert('');
  }

  function openEdit(day: DayOfWeek, entry: TimetableEntry) {
    setEditing({ day, entry });
    setFDay(entry.dayOfWeek);
    setFStart(entry.startTime);
    setFEnd(entry.endTime ?? '');
    setFLabel(entry.label);
    setFLocation(entry.location ?? '');
    setFAlert(entry.alertMinutesBefore ? String(entry.alertMinutesBefore) : '');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fLabel.trim() || !fStart) return;

    const input: TimetableEntryInput = {
      dayOfWeek: fDay,
      startTime: fStart,
      endTime: fEnd || undefined,
      label: fLabel.trim(),
      location: fLocation.trim() || undefined,
      alertMinutesBefore: fAlert ? Number(fAlert) : undefined,
    };

    if (editing?.entry) {
      updateEntry(editing.entry.id, input);
    } else {
      addEntry(input);
    }
    setEditing(null);
  }

  function handleDelete() {
    if (editing?.entry) {
      deleteEntry(editing.entry.id);
    }
    setEditing(null);
  }

  function openCopy(day: DayOfWeek) {
    setCopyingDay(day);
    setCopyTargets(new Set());
  }

  function toggleCopyTarget(day: DayOfWeek) {
    setCopyTargets((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function confirmCopy() {
    if (copyingDay && copyTargets.size > 0) {
      copyDay(copyingDay, Array.from(copyTargets));
    }
    setCopyingDay(null);
  }

  const today = todayKey();

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Lay out your week once — it repeats every week from here. You'll get a heads-up
        before each lesson starts, no matter which tool you're in.
      </p>

      <div className="timetable-week-wrap">
        <div className="timetable-week-grid">
          {DAYS.map((day) => (
            <div
              key={day}
              className={`timetable-day-col${day === today ? ' timetable-day-col-today' : ''}`}
            >
              <div className="timetable-day-head">
                <h2>{DAY_LABELS[day]}</h2>
                <span className="timetable-day-count">
                  {entriesByDay[day].length} {entriesByDay[day].length === 1 ? 'lesson' : 'lessons'}
                </span>
              </div>

              <ul className="timetable-lesson-list">
                {entriesByDay[day].length === 0 ? (
                  <li className="timetable-empty-day">No lessons yet</li>
                ) : (
                  entriesByDay[day].map((entry) => {
                    const colorKey = colorForLabel(entry.label);
                    const style = { '--lc': `var(--${colorKey})`, '--lc-bg': `var(--${colorKey}-bg)` } as CSSProperties;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="timetable-lesson-card"
                          style={style}
                          onClick={() => openEdit(day, entry)}
                        >
                          <span className="timetable-lesson-time">{formatTimeRange(entry.startTime, entry.endTime)}</span>
                          <span className="timetable-lesson-label">{entry.label}</span>
                          {entry.location && <span className="timetable-lesson-location">{entry.location}</span>}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="timetable-day-foot">
                <button type="button" className="timetable-add-btn" onClick={() => openAdd(day)}>
                  + Add lesson
                </button>
                {entriesByDay[day].length > 0 && (
                  <button
                    type="button"
                    className="timetable-copy-btn"
                    onClick={() => openCopy(day)}
                    aria-label={`Copy ${DAY_LABELS[day]} to other days`}
                    title="Copy to…"
                  >
                    ⧉
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2>{editing.entry ? 'Edit lesson' : 'Add a lesson'}</h2>
          <form onSubmit={handleSubmit} className="tool-form">
            <label className="tool-field">
              <span>Day</span>
              <select value={fDay} onChange={(event) => setFDay(event.target.value as DayOfWeek)}>
                {DAYS.map((day) => (
                  <option key={day} value={day}>{DAY_LABELS[day]}</option>
                ))}
              </select>
            </label>

            <div className="tool-form-row">
              <label className="tool-field">
                <span>Starts</span>
                <input type="time" value={fStart} onChange={(event) => setFStart(event.target.value)} required />
              </label>
              <label className="tool-field">
                <span>Ends (optional)</span>
                <input type="time" value={fEnd} onChange={(event) => setFEnd(event.target.value)} />
              </label>
            </div>

            <label className="tool-field">
              <span>Lesson</span>
              <input
                type="text"
                value={fLabel}
                onChange={(event) => setFLabel(event.target.value)}
                placeholder="e.g. Maths"
                maxLength={60}
                required
              />
            </label>

            <label className="tool-field">
              <span>Room (optional)</span>
              <input
                type="text"
                value={fLocation}
                onChange={(event) => setFLocation(event.target.value)}
                placeholder="e.g. Room 4B"
                maxLength={40}
              />
            </label>

            <label className="tool-field">
              <span>Alert before it starts</span>
              <select value={fAlert} onChange={(event) => setFAlert(event.target.value)}>
                <option value="">Default — 15 minutes</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="20">20 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </label>

            <div className="tool-form-row">
              {editing.entry && (
                <button type="button" className="secondary-button" onClick={handleDelete}>
                  Delete lesson
                </button>
              )}
              <button type="submit">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {copyingDay && (
        <Modal onClose={() => setCopyingDay(null)}>
          <h2>Copy {DAY_LABELS[copyingDay]}’s lessons to…</h2>
          <div className="timetable-copy-days">
            {DAYS.filter((day) => day !== copyingDay).map((day) => (
              <button
                key={day}
                type="button"
                className={`preset-button${copyTargets.has(day) ? ' preset-button-active' : ''}`}
                aria-pressed={copyTargets.has(day)}
                onClick={() => toggleCopyTarget(day)}
              >
                {DAY_SHORT[day]}
              </button>
            ))}
          </div>
          <div className="tool-result-actions">
            <button type="button" onClick={confirmCopy} disabled={copyTargets.size === 0}>
              {copyTargets.size > 0
                ? `Copy to ${copyTargets.size} ${copyTargets.size === 1 ? 'day' : 'days'}`
                : 'Copy'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export const timetableTool: ToolDefinition = {
  meta,
  Component: Timetable,
};
