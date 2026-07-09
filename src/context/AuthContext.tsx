import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

export interface AuthUser {
  username: string;
  email?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadCurrentUser(): Promise<AuthUser | null> {
  try {
    const current = await getCurrentUser();
    return { username: current.username, email: current.signInDetails?.loginId };
  } catch {
    // No signed-in user — Amplify's getCurrentUser rejects rather than returning null.
    return null;
  }
}

// Auth is opt-in in this app, not a login gate — this provider just reflects whatever
// session Amplify itself is already persisting (it manages the tokens), so the rest of
// the app can render exactly as before regardless of sign-in state. See
// AccountButton.tsx for the only UI that reads this.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadCurrentUser().then((result) => {
      if (!cancelled) {
        setUser(result);
        setLoading(false);
      }
    });

    // The Authenticator component (see AccountButton.tsx) completes sign-up/sign-in/
    // sign-out internally — this is how the rest of the app finds out it happened.
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signedOut') {
        void loadCurrentUser().then((result) => {
          if (!cancelled) setUser(result);
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function signOut() {
    await amplifySignOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isSignedIn: user !== null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
