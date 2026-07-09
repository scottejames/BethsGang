import { useEffect, useRef, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';

export function AccountButton() {
  const { user, isSignedIn, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wasSignedIn = useRef(isSignedIn);

  // Close the modal the moment sign-in completes, rather than leaving a "Signed in as
  // X" panel sitting open with nothing to do but Sign out or click away — the account
  // button itself already updates to show the signed-in email, which is confirmation
  // enough on its own.
  useEffect(() => {
    if (!wasSignedIn.current && isSignedIn) {
      setOpen(false);
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  // Avoid a flash of "Sign in" before the initial session check (Amplify's own
  // persisted-token lookup) resolves.
  if (loading) return null;

  async function handleSignOut() {
    await signOut();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="account-button"
        onClick={() => setOpen(true)}
        aria-label={isSignedIn ? `Signed in as ${user?.email}. Click to manage your account.` : 'Sign in'}
      >
        <span aria-hidden="true">👤</span>
        <span className="account-button-label">{isSignedIn ? user?.email : 'Sign in'}</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          {isSignedIn ? (
            <div>
              <h2>Account</h2>
              <p className="tool-intro">Signed in as {user?.email}</p>
              <button type="button" className="energy-done" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </div>
          ) : (
            // See src/index.css's ".amplify-auth-theme" block for how this is themed
            // to match the app's own colors instead of Amplify UI's defaults.
            <div className="amplify-auth-theme">
              <Authenticator />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
