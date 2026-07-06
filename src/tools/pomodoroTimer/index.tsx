import { useEffect, useState } from 'react';
import tomatoUrl from '../../assets/tomato.svg';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

const PRESET_MINUTES = [5, 10, 15] as const;
type PresetMinutes = (typeof PRESET_MINUTES)[number];

type Status = 'idle' | 'running' | 'paused' | 'done';

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function PomodoroTimer() {
  const [durationMinutes, setDurationMinutes] = useState<PresetMinutes>(5);
  const [remainingSeconds, setRemainingSeconds] = useState(durationMinutes * 60);
  const [status, setStatus] = useState<Status>('idle');
  const [startKey, setStartKey] = useState(0);

  // startKey forces a fresh interval even when `status` was already 'running'
  // (e.g. picking a new preset mid-countdown).
  useEffect(() => {
    if (status !== 'running') return;

    const id = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          setStatus('done');
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [status, startKey]);

  function startWith(minutes: PresetMinutes) {
    setDurationMinutes(minutes);
    setRemainingSeconds(minutes * 60);
    setStatus('running');
    setStartKey((key) => key + 1);
  }

  function handleStopResume() {
    setStatus((current) => (current === 'running' ? 'paused' : 'running'));
  }

  function handleReset() {
    setRemainingSeconds(durationMinutes * 60);
    setStatus('idle');
  }

  const isActive = status !== 'idle';

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Pick a length and go. The tomato keeps you company while you work — no pressure,
        just a gentle nudge to stay put until it's done.
      </p>

      <div className="tool-form-row">
        {PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`preset-button${minutes === durationMinutes ? ' preset-button-active' : ''}`}
            onClick={() => startWith(minutes)}
          >
            {minutes} min
          </button>
        ))}
      </div>

      <div className="pomodoro-display">
        <img
          src={tomatoUrl}
          alt=""
          aria-hidden="true"
          className={`pomodoro-tomato${status === 'running' ? ' pomodoro-tomato-active' : ''}`}
        />
        <p className="pomodoro-time">{formatTime(remainingSeconds)}</p>
        {status === 'done' && <p className="pomodoro-done">Time's up! Nice work. 🎉</p>}
      </div>

      {isActive && (
        <div className="pomodoro-controls">
          {status !== 'done' && (
            <button type="button" className="primary" onClick={handleStopResume}>
              {status === 'running' ? 'Stop' : 'Resume'}
            </button>
          )}
          <button type="button" onClick={handleReset}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

export const pomodoroTimerTool: ToolDefinition = {
  meta,
  Component: PomodoroTimer,
};
