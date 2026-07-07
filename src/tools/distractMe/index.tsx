import { SOUNDS, useDistractMe } from '../../context/DistractMeContext';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function DistractMe() {
  const { activeSoundId, volume, play, stop, setVolume } = useDistractMe();

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Pick a sound to play in the background. It keeps playing while you use other
        tools — come back here to change it, or use the player at the bottom of the
        screen.
      </p>

      <div className="tool-form-row">
        {SOUNDS.map((sound) => (
          <button
            key={sound.id}
            type="button"
            className={`preset-button${activeSoundId === sound.id ? ' preset-button-active' : ''}`}
            onClick={() => play(sound.id)}
          >
            <span aria-hidden="true">{sound.icon}</span> {sound.label}
          </button>
        ))}
      </div>

      {activeSoundId && (
        <div className="distract-me-controls">
          <label htmlFor="distract-me-volume">
            Volume
            <input
              id="distract-me-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={stop}>
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

export const distractMeTool: ToolDefinition = {
  meta,
  Component: DistractMe,
};
