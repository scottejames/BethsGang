import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../context/AuthContext';
import { AccountButton } from './AccountButton';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));
vi.mock('@aws-amplify/ui-react', () => ({ Authenticator: () => 'Sign-in form' }));

const SIGNED_IN = {
  username: 'user-1',
  userId: 'user-1',
  signInDetails: { loginId: 'person@example.com' },
};

function renderButton() {
  return render(
    <AuthProvider>
      <AccountButton />
    </AuthProvider>,
  );
}

const signInButton = () => screen.findByRole('button', { name: 'Sign in' });
const accountButton = () => screen.findByRole('button', { name: /signed in as person@example\.com/i });

describe('AccountButton', () => {
  beforeEach(() => {
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset().mockResolvedValue(undefined);
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(cleanup);

  it('shows nothing until the session check finishes, to avoid a flash of "Sign in"', () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockReturnValue(new Promise(() => {}));

    renderButton();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('signed out', () => {
    it('opens the sign-in form', async () => {
      renderButton();

      fireEvent.click(await signInButton());

      expect(screen.getByRole('dialog')).toHaveTextContent('Sign-in form');
    });

    it('closes the form with Escape', async () => {
      renderButton();
      fireEvent.click(await signInButton());

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes when clicking outside the form, but not inside it', async () => {
      const { container } = renderButton();
      fireEvent.click(await signInButton());

      fireEvent.click(screen.getByRole('dialog'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(container.querySelector('.modal-overlay') as HTMLElement);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the form as soon as sign-in completes', async () => {
      let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
      vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
        hubCallback = callback as typeof hubCallback;
        return vi.fn();
      });
      renderButton();
      fireEvent.click(await signInButton());

      vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue(SIGNED_IN);
      act(() => hubCallback?.({ payload: { event: 'signedIn' } }));

      await accountButton();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('signed in', () => {
    beforeEach(() => {
      vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue(SIGNED_IN);
    });

    it("shows the person's email", async () => {
      renderButton();

      expect(await accountButton()).toHaveTextContent('person@example.com');
    });

    it('shows account details instead of the sign-in form', async () => {
      renderButton();

      fireEvent.click(await accountButton());

      expect(screen.getByRole('dialog')).toHaveTextContent('Signed in as person@example.com');
      expect(screen.getByRole('dialog')).not.toHaveTextContent('Sign-in form');
    });

    it('signs out and closes the panel', async () => {
      renderButton();
      fireEvent.click(await accountButton());

      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

      await waitFor(() => expect(amplifyAuth.signOut).toHaveBeenCalledTimes(1));
      expect(await signInButton()).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });
});
