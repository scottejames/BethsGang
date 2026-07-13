import { useDistractMe } from '../context/DistractMeContext';

export function NowPlayingBar() {
  const { activeSound: sound, volume, stop, setVolume } = useDistractMe();

  if (!sound) return null;

  return (
    <div className="now-playing-bar">
      <span className="now-playing-icon" aria-hidden="true">
        {sound.icon}
      </span>
      <span className="now-playing-label">Playing: {sound.label}</span>
      <span className="now-playing-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volume"
      />
      <button type="button" onClick={stop}>
        Stop
      </button>
    </div>
  );
}
