import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import App from './App';
import { AppProviders } from './AppProviders';
import { watchSave } from './lib/saveFailures';
import { tools } from './tools/registry';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));
vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {},
    queries: { runAiTool: vi.fn() },
    mutations: { logEvent: vi.fn().mockResolvedValue({ data: 'ok' }) },
  }),
}));
vi.mock('@aws-amplify/ui-react', () => ({ Authenticator: () => 'Sign-in form' }));

const TABS = ['Everyday Helpers', 'Get Organized', 'Study Help'];

async function renderApp() {
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
  await screen.findByRole('button', { name: 'Sign in' });
}

function openTool(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const tab of TABS) {
    fireEvent.click(screen.getByRole('button', { name: tab }));
    const card = screen.queryByRole('button', { name: new RegExp(`^${escaped}`) });
    if (card) {
      fireEvent.click(card);
      return;
    }
  }
  throw new Error(`${name} isn't reachable from any Home tab`);
}

const goHome = () => fireEvent.click(screen.getByRole('button', { name: /all tools/i }));

describe('App', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it.each(tools.map((tool) => [tool.meta.name]))('opens %s and returns Home', async (name) => {
    await renderApp();

    openTool(name);
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();

    goHome();
    expect(screen.getByRole('button', { name: TABS[0] })).toBeInTheDocument();
  });

  it('keeps the account and energy buttons on Home and inside a tool', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: /energy level/i })).toBeInTheDocument();

    openTool('Task Breakdown');

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /energy level/i })).toBeInTheDocument();
  });

  it('shows the warning when a save fails anywhere in the app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderApp();

    await act(() => watchSave(Promise.resolve({ errors: [{ message: 'Denied' }] }), 'Failed'));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save/i);
  });

  it('keeps a sound playing while switching to another tool, until stopped', async () => {
    await renderApp();

    openTool('Distract Me');
    fireEvent.click(screen.getByRole('button', { name: /rain/i }));
    expect(play).toHaveBeenCalledTimes(1);

    goHome();
    openTool('Pomodoro Timer');

    expect(screen.getByText('Playing: Rain')).toBeInTheDocument();
    expect(pause).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Playing: Rain')).not.toBeInTheDocument();
  });
});

describe('tool registry', () => {
  it('gives every tool a unique ID', () => {
    const ids = tools.map((tool) => tool.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes every tool folder, so none can be built and left unreachable', () => {
    const folders = Object.keys(import.meta.glob('./tools/*/meta.ts'));
    expect(tools).toHaveLength(folders.length);
  });

  it('gives every tool a name, tagline, and icon', () => {
    for (const { meta } of tools) {
      expect(meta.name, meta.id).toBeTruthy();
      expect(meta.tagline, meta.id).toBeTruthy();
      expect(meta.icon, meta.id).toBeTruthy();
    }
  });
});
