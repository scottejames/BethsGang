import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'beths-gang:energy-spoons';
const DEFAULT_SPOONS = 70;

interface EnergyContextValue {
  spoons: number;
  setSpoons: (value: number) => void;
}

const EnergyContext = createContext<EnergyContextValue | null>(null);

function readStoredSpoons(): number {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : DEFAULT_SPOONS;
}

// Global energy level, on purpose: every tool (AI-backed or not) can read it
// to adjust its own complexity. See useAiTool.ts for how AI tools pick it up
// automatically, and pomodoroTimer/index.tsx for a non-AI example.
export function EnergyProvider({ children }: { children: ReactNode }) {
  const [spoons, setSpoonsState] = useState<number>(readStoredSpoons);

  function setSpoons(value: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(value)));
    setSpoonsState(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  }

  return <EnergyContext.Provider value={{ spoons, setSpoons }}>{children}</EnergyContext.Provider>;
}

export function useEnergy(): EnergyContextValue {
  const context = useContext(EnergyContext);
  if (!context) {
    throw new Error('useEnergy must be used within an EnergyProvider');
  }
  return context;
}
