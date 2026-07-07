import { useState } from 'react';
import { useEnergy } from '../context/EnergyContext';
import { Modal } from './Modal';

function caption(spoons: number): string {
  if (spoons <= 10) return 'Running on fumes 🫠';
  if (spoons <= 30) return 'Running low';
  if (spoons <= 60) return 'Getting there';
  if (spoons <= 85) return 'Feeling good';
  return 'Fully loaded!';
}

export function EnergyButton() {
  const { spoons, setSpoons } = useEnergy();
  const [open, setOpen] = useState(false);
  const filledSpoons = Math.round(spoons / 10);

  return (
    <>
      <button
        type="button"
        className="energy-button"
        onClick={() => setOpen(true)}
        aria-label={`Energy level: ${spoons} out of 100 spoons. Click to change.`}
      >
        <span aria-hidden="true">🥄</span> {spoons}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2>How many spoons today?</h2>
          <p className="tool-intro">
            A rough, no-pressure read on your energy. Tools keep things simple and
            low-effort when you're running low, and can go a bit more thorough when
            you've got plenty to spare.
          </p>

          <div className="energy-spoon-row" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <span key={index} className={index < filledSpoons ? 'spoon-filled' : 'spoon-empty'}>
                🥄
              </span>
            ))}
          </div>

          <p className="energy-caption">
            {caption(spoons)} <span className="energy-caption-count">— {spoons}/100</span>
          </p>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={spoons}
            onChange={(event) => setSpoons(Number(event.target.value))}
            aria-label="Energy level, 0 to 100 spoons"
          />

          <button type="button" className="primary energy-done" onClick={() => setOpen(false)}>
            Done
          </button>
        </Modal>
      )}
    </>
  );
}
