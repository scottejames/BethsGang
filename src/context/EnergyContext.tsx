import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';

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
  const { isSignedIn, user } = useAuth();
  const username = user?.username ?? null;
  const [spoons, setSpoonsState] = useState<number>(readStoredSpoons);
  const spoonsRef = useRef(spoons);
  spoonsRef.current = spoons;
  const wasSignedIn = useRef(isSignedIn);

  function persistLocally(value: number) {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }

  // On sign-out, revert to this device's own local value rather than leaving whatever
  // the account had synced on screen — account data shouldn't linger after sign-out
  // (same reasoning as RemindersContext's equivalent effect).
  useEffect(() => {
    if (wasSignedIn.current && !isSignedIn) {
      setSpoonsState(readStoredSpoons());
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  // Signed in: `UserPreferences` holds one row per user, keyed by their Cognito
  // username, as a singleton preferences record (see amplify/data/resource.ts). On the
  // first emission: no row yet means a brand-new account, so seed the backend from
  // whatever's currently set on this device; a row already existing means a returning
  // user, whose cross-device value wins over this device's local one. After that,
  // observeQuery's live updates are the source of truth (e.g. changed on another
  // device).
  useEffect(() => {
    if (!isSignedIn || !username) return;
    let hasReconciled = false;
    const subscription = client.models.UserPreferences.observeQuery().subscribe({
      next: ({ items }) => {
        if (!hasReconciled) {
          hasReconciled = true;
          if (items.length === 0) {
            client.models.UserPreferences.create({ id: username, spoons: spoonsRef.current }).catch(
              (error: unknown) => {
                console.error('Failed to create user preferences', error);
              },
            );
            return; // wait for the create() to echo back via the next emission
          }
        }
        const backendSpoons = items[0]?.spoons;
        if (typeof backendSpoons === 'number') {
          // Not persisted locally on purpose — this is account data, and shouldn't
          // still be visible if the user signs out on this device (see the sign-out
          // effect above).
          setSpoonsState(backendSpoons);
        }
      },
      error: (error: unknown) => {
        console.error('UserPreferences subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn, username]);

  function setSpoons(value: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(value)));
    setSpoonsState(clamped);
    // Only mirrored locally while signed out — signed-in changes are account data and
    // shouldn't linger in localStorage after a sign-out (see the sign-out effect above).
    if (!isSignedIn) {
      persistLocally(clamped);
    }
    if (isSignedIn && username) {
      client.models.UserPreferences.update({ id: username, spoons: clamped }).catch(() => {
        // No row yet (e.g. slider moved before the sign-in reconciliation above
        // finished creating one) — create it instead.
        client.models.UserPreferences.create({ id: username, spoons: clamped }).catch((error: unknown) => {
          console.error('Failed to persist spoons', error);
        });
      });
    }
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
