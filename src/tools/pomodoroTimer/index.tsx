import { useEffect, useRef, useState } from 'react';
import tomatoUrl from '../../assets/tomato.svg';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

const PRESET_MINUTES = [5, 10, 15] as const;
type PresetMinutes = (typeof PRESET_MINUTES)[number];

type Status = 'idle' | 'running' | 'paused' | 'done';

// The tomato never shrinks all the way to nothing while ticking down — it
// holds at this minimum scale until the final "pop", so the shrink stays
// visible for the whole countdown instead of vanishing early.
const MIN_VISUAL_SCALE = 0.25;

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
  const [visualize, setVisualize] = useState(false);

  // Read inside the interval without needing to restart it when toggled mid-countdown.
  const visualizeRef = useRef(visualize);
  useEffect(() => {
    visualizeRef.current = visualize;
  }, [visualize]);

  // startKey forces a fresh interval even when `status` was already 'running'
  // (e.g. picking a new preset mid-countdown). `remainingSeconds` is captured
  // once into a plain local variable when the effect (re)starts — i.e. exactly
  // when a countdown starts or resumes — and counted down entirely inside the
  // interval closure. This intentionally avoids syncing a ref from
  // `remainingSeconds` via a separate effect: that sync only commits between
  // renders, so under rapid/back-to-back ticks (verified with fake timers in
  // index.test.tsx) the ref could lag and the zero-check would never fire.
  useEffect(() => {
    if (status !== 'running') return;

    let ticksRemaining = remainingSeconds;

    const id = window.setInterval(() => {
      ticksRemaining -= 1;
      if (ticksRemaining <= 0) {
        setRemainingSeconds(0);
        setStatus('done');
        if (visualizeRef.current) {
          void new Audio('/audio/pop.mp3').play();
        }
        return;
      }
      setRemainingSeconds(ticksRemaining);
    }, 1000);

    return () => window.clearInterval(id);
    // remainingSeconds is intentionally read only at effect-setup time (see
    // comment above) — adding it here would restart the interval every tick.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
  const popped = status === 'done' && visualize;
  const totalSeconds = durationMinutes * 60;
  const visualScale =
    MIN_VISUAL_SCALE + (1 - MIN_VISUAL_SCALE) * Math.min(1, remainingSeconds / totalSeconds);

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

      <label className="toggle-field">
        <input
          type="checkbox"
          checked={visualize}
          onChange={(event) => setVisualize(event.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
        Visualise remaining time
      </label>

      <div className="pomodoro-display">
        <img
          src={tomatoUrl}
          alt=""
          aria-hidden="true"
          className={`pomodoro-tomato${status === 'running' && !visualize ? ' pomodoro-tomato-active' : ''}${popped ? ' pomodoro-tomato-pop' : ''}`}
          style={visualize && !popped ? { transform: `scale(${visualScale})` } : undefined}
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
