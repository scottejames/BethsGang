import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { EnergyButton } from '../components/EnergyButton';
import { Home } from '../components/Home';
import { everythingPileTool } from '../tools/everythingPile';
import { remindMeTool } from '../tools/remindMe';
import { timetableTool } from '../tools/timetable';
import { client } from '../lib/dataClient';
import { subscribeToSyncFailures } from '../lib/saveFailures';
import { LOAD_TIMEOUT_MS } from '../hooks/useAccountLoadStatus';
import { AppProviders } from '../AppProviders';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));
vi.mock('../hooks/useUsageLog', () => ({ useUsageLog: () => vi.fn() }));
vi.mock('../lib/dataClient', () => {
  const model = () => ({ observeQuery: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  return {
    client: {
      models: {
        Project: model(),
        Task: model(),
        Reminder: model(),
        TimetableEntry: model(),
        UserPreferences: model(),
      },
    },
  };
});

type ModelName = keyof typeof client.models;
const MODELS = Object.keys(client.models) as ModelName[];
const mockModel = (name: ModelName) => vi.mocked(client.models[name] as unknown as Record<string, ReturnType<typeof vi.fn>>);
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const SIGNED_IN = { username: 'user-1', userId: 'user-1', signInDetails: { loginId: 'person@example.com' } };
const FLAGS = ['beths-gang:reminders-migrated', 'beths-gang:timetable-migrated', 'beths-gang:tasks-migrated'];

interface Handlers {
  next: (data: { items: unknown[] }) => void;
  error: (error: unknown) => void;
}
const handlers = new Map<ModelName, Handlers>();
let hub: ((event: { payload: { event: string } }) => void) | undefined;

const arrive = (name: ModelName, items: unknown[] = []) => act(() => handlers.get(name)?.next({ items }));
const fail = (name: ModelName) => act(() => handlers.get(name)?.error(new Error('connection failed')));
// What Amplify really does when the first fetch fails: an empty list, then the error.
const failFirstFetch = (name: ModelName) =>
  act(() => {
    handlers.get(name)?.next({ items: [] });
    handlers.get(name)?.error(new Error('Not Authorized'));
  });

async function renderSignedIn(Component: ComponentType, ...subscribed: ModelName[]) {
  const view = render(
    <AppProviders>
      <Component />
    </AppProviders>,
  );
  await waitFor(() => subscribed.forEach((name) => expect(handlers.has(name)).toBe(true)));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  window.localStorage.clear();
  FLAGS.forEach((flag) => window.localStorage.setItem(flag, 'true'));
  handlers.clear();
  hub = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockResolvedValue(SIGNED_IN);
  vi.mocked(Hub.listen).mockReset().mockImplementation((_channel, callback) => {
    hub = callback as typeof hub;
    return vi.fn();
  });
  MODELS.forEach((name) => {
    const model = mockModel(name);
    model.observeQuery.mockReset().mockImplementation(() => ({
      subscribe: (subscriber: Handlers) => {
        handlers.set(name, subscriber);
        return { unsubscribe: vi.fn() };
      },
    }));
    model.create.mockReset().mockResolvedValue({ data: null });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const SCREENS = [
  {
    screen: 'Remind Me',
    Component: remindMeTool.Component,
    models: ['Reminder'] as ModelName[],
    emptyText: 'No reminders set yet.',
    failedText: "Couldn't load your reminders.",
    item: { id: 'r1', message: 'Lunch', fireAt: FUTURE, warnedForCurrentFireAt: false, repeat: '{"kind":"none"}' },
    itemText: 'Lunch',
  },
  {
    screen: 'Everything Pile',
    Component: everythingPileTool.Component,
    models: ['Project', 'Task'] as ModelName[],
    emptyText: 'Everything Else',
    failedText: "Couldn't load your tasks.",
    item: { id: 'p1', name: 'Kitchen', createdAt: FUTURE },
    itemText: 'Kitchen',
  },
  {
    screen: 'Timetable',
    Component: timetableTool.Component,
    models: ['TimetableEntry'] as ModelName[],
    emptyText: 'No lessons yet',
    failedText: "Couldn't load your lessons.",
    item: { id: 'e1', dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths' },
    itemText: 'Maths',
  },
];

describe.each(SCREENS)('$screen', ({ Component, models, emptyText, failedText, item, itemText }) => {
  const arriveAll = () => models.forEach((name) => arrive(name));
  const [firstModel] = models;

  it('says it is loading, and not that it is empty, until the data arrives', async () => {
    await renderSignedIn(Component, ...models);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryAllByText(emptyText)).toHaveLength(0);
  });

  it('shows the real empty message once it knows there is nothing', async () => {
    await renderSignedIn(Component, ...models);

    arriveAll();

    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getAllByText(emptyText).length).toBeGreaterThan(0);
  });

  it('shows the data when it arrives', async () => {
    await renderSignedIn(Component, ...models);

    arriveAll();
    arrive(firstModel, [item]);

    expect(screen.getByText(itemText)).toBeInTheDocument();
  });

  it('says it could not load when the first fetch fails, rather than claiming to be empty', async () => {
    await renderSignedIn(Component, ...models);

    failFirstFetch(firstModel);

    expect(screen.getByText(failedText)).toBeInTheDocument();
    expect(screen.queryAllByText(emptyText)).toHaveLength(0);
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('keeps loaded data on screen if the connection fails later', async () => {
    await renderSignedIn(Component, ...models);
    models.forEach((name) => arrive(name, name === firstModel ? [item] : []));

    fail(firstModel);

    expect(screen.getByText(itemText)).toBeInTheDocument();
    expect(screen.queryByText(failedText)).not.toBeInTheDocument();
  });

  it('shows loading again after signing out and back in', async () => {
    await renderSignedIn(Component, ...models);
    arriveAll();

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('signed out'));
    await act(async () => hub?.({ payload: { event: 'signedOut' } }));
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue(SIGNED_IN);
    await act(async () => hub?.({ payload: { event: 'signedIn' } }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('goes straight to the empty message when signed out', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('signed out'));

    render(
      <AppProviders>
        <Component />
      </AppProviders>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(async () => {});

    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getAllByText(emptyText).length).toBeGreaterThan(0);
  });
});

describe('when the first fetch never answers', () => {
  const [{ Component, models, failedText, item, itemText }] = SCREENS;
  const onSync = vi.fn();
  let stop: () => void;

  beforeEach(async () => {
    onSync.mockReset();
    stop = subscribeToSyncFailures(onSync);
    // Before rendering, so the limit's own timer is a fake one.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderSignedIn(Component, ...models);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('keeps waiting up to the limit', () => {
    act(() => vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 2_000));

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(onSync).not.toHaveBeenCalled();
  });

  it('gives up at the limit and warns', () => {
    act(() => vi.advanceTimersByTime(LOAD_TIMEOUT_MS));

    expect(screen.getByText(failedText)).toBeInTheDocument();
    expect(onSync).toHaveBeenCalled();
  });

  it('still shows the data if it turns up late', () => {
    act(() => vi.advanceTimersByTime(LOAD_TIMEOUT_MS));

    arrive(models[0], [item]);

    expect(screen.getByText(itemText)).toBeInTheDocument();
    expect(screen.queryByText(failedText)).not.toBeInTheDocument();
  });

  it('does not time out once the data has arrived', () => {
    MODELS.forEach((name) => arrive(name));

    act(() => vi.advanceTimersByTime(LOAD_TIMEOUT_MS * 2));

    expect(screen.queryByText(failedText)).not.toBeInTheDocument();
    expect(onSync).toHaveBeenCalledTimes(0);
  });
});

describe('Everything Pile needs both projects and tasks', () => {
  const { Component } = SCREENS[1];

  it('keeps loading until both have arrived', async () => {
    await renderSignedIn(Component, 'Project', 'Task');

    arrive('Project');
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    arrive('Task');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('recovers if the slower one turns up after the limit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderSignedIn(Component, 'Project', 'Task');
      arrive('Project', [SCREENS[1].item]);
      act(() => vi.advanceTimersByTime(LOAD_TIMEOUT_MS));
      expect(screen.getByText("Couldn't load your tasks.")).toBeInTheDocument();

      arrive('Task');

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts as failed if only one of them fails', async () => {
    await renderSignedIn(Component, 'Project', 'Task');
    arrive('Project');

    failFirstFetch('Task');

    expect(screen.getByText("Couldn't load your tasks.")).toBeInTheDocument();
  });
});

describe('Remind Me', () => {
  it('hides reminders saved on the device while the account loads', async () => {
    window.localStorage.setItem(
      'beths-gang:reminders',
      JSON.stringify([{ id: 'd1', message: 'Device one', fireAt: FUTURE, repeat: { kind: 'none' } }]),
    );

    await renderSignedIn(remindMeTool.Component, 'Reminder');

    expect(screen.queryByText('Device one')).not.toBeInTheDocument();
  });
});

describe('Home reminder count', () => {
  const HomeScreen = () => <Home onSelectTool={vi.fn()} />;
  const reminder = SCREENS[0].item;

  it('shows no number until the reminders arrive', async () => {
    window.localStorage.setItem(
      'beths-gang:reminders',
      JSON.stringify([{ id: 'd1', message: 'Device', fireAt: FUTURE, repeat: { kind: 'none' } }]),
    );

    const { container } = await renderSignedIn(HomeScreen, 'Reminder');
    expect(container.querySelector('.tool-card-badge')).toBeNull();

    arrive('Reminder', [reminder, { ...reminder, id: 'r2' }]);

    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('Spoons button', () => {
  const button = () => screen.getByRole('button', { name: /energy level/i });

  it('shows a placeholder and cannot be opened until the value arrives', async () => {
    await renderSignedIn(EnergyButton, 'UserPreferences');

    expect(button()).toHaveTextContent('…');
    expect(button()).not.toHaveTextContent('70');
    expect(button()).toBeDisabled();
    expect(button()).toHaveAccessibleName('Energy level loading');
  });

  it("shows the account's value when it arrives", async () => {
    await renderSignedIn(EnergyButton, 'UserPreferences');

    arrive('UserPreferences', [{ id: 'user-1', spoons: 35 }]);

    expect(button()).toHaveTextContent('35');
    expect(button()).toBeEnabled();
  });

  it('settles on this device value for a brand-new account', async () => {
    await renderSignedIn(EnergyButton, 'UserPreferences');

    arrive('UserPreferences');

    expect(button()).toHaveTextContent('70');
    expect(button()).toBeEnabled();
  });

  it('stops waiting as soon as the connection fails, even with no data at all', async () => {
    await renderSignedIn(EnergyButton, 'UserPreferences');

    fail('UserPreferences');

    expect(button()).toHaveTextContent('70');
    expect(button()).toBeEnabled();
  });

  it('falls back to this device value if loading fails', async () => {
    await renderSignedIn(EnergyButton, 'UserPreferences');

    failFirstFetch('UserPreferences');

    expect(button()).toHaveTextContent('70');
    expect(button()).toBeEnabled();
  });
});
