import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { client } from '../lib/dataClient';
import { subscribeToSaveFailures } from '../lib/saveFailures';
import { AuthProvider } from './AuthContext';
import { EnergyProvider, useEnergy } from './EnergyContext';
import { RemindersProvider, useReminders } from './RemindersContext';
import { TaskStoreProvider, useTaskStore } from './TaskStoreContext';
import { TimetableProvider, useTimetable } from './TimetableContext';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));

vi.mock('../lib/dataClient', () => {
  const model = () => ({
    observeQuery: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
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
type Operation = 'create' | 'update' | 'delete';
type MockModel = Record<Operation | 'observeQuery', ReturnType<typeof vi.fn>>;

const MODELS: ModelName[] = ['Project', 'Task', 'Reminder', 'TimetableEntry', 'UserPreferences'];
const mockModel = (name: ModelName) => client.models[name] as unknown as MockModel;

const LOCAL_KEYS = [
  'beths-gang:projects',
  'beths-gang:tasks',
  'beths-gang:reminders',
  'beths-gang:timetable',
  'beths-gang:energy-spoons',
  'beths-gang:reminders-migrated',
  'beths-gang:timetable-migrated',
  'beths-gang:tasks-migrated',
];

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

const SIGNED_IN_DATA: Record<ModelName, unknown[]> = {
  Project: [{ id: 'p1', name: 'Kitchen', createdAt: FUTURE }],
  Task: [
    {
      id: 't1',
      title: 'Buy tape',
      projectId: 'p1',
      size: 'small',
      category: 'now',
      done: false,
      createdAt: FUTURE,
    },
  ],
  Reminder: [
    {
      id: 'r1',
      message: 'Lunch',
      fireAt: FUTURE,
      warnBeforeMinutes: null,
      warnedForCurrentFireAt: false,
      repeat: JSON.stringify({ kind: 'none' }),
    },
  ],
  TimetableEntry: [{ id: 'e1', dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths' }],
  UserPreferences: [{ spoons: 50 }],
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <RemindersProvider>
          <TimetableProvider>
            <TaskStoreProvider>{children}</TaskStoreProvider>
          </TimetableProvider>
        </RemindersProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}

const useEverything = () => ({
  tasks: useTaskStore(),
  reminders: useReminders(),
  timetable: useTimetable(),
  energy: useEnergy(),
});
type Everything = ReturnType<typeof useEverything>;

const emitters = new Map<ModelName, (data: { items: unknown[] }) => void>();

async function renderSignedIn(data: Partial<Record<ModelName, unknown[]>> = SIGNED_IN_DATA) {
  const view = renderHook(useEverything, { wrapper: Providers });
  await waitFor(() => expect(emitters.size).toBe(MODELS.length));
  act(() => {
    MODELS.forEach((name) => emitters.get(name)?.({ items: data[name] ?? [] }));
  });
  return view;
}

const FAILURES: [string, () => Promise<unknown>][] = [
  // What Amplify really does for "Not Authorized" and similar: it resolves.
  ['a server error', () => Promise.resolve({ data: null, errors: [{ message: 'Not Authorized' }] })],
  ['a network failure', () => Promise.reject(new Error('Network error'))],
];

const LESSON = { dayOfWeek: 'monday', startTime: '10:00', label: 'Art' } as const;

const SAVES: [string, ModelName, Operation, (app: Everything) => void][] = [
  ['adding a project', 'Project', 'create', (app) => app.tasks.addProject('New')],
  ['renaming a project', 'Project', 'update', (app) => app.tasks.updateProject('p1', { name: 'B' })],
  ['deleting a project', 'Project', 'delete', (app) => app.tasks.deleteProject('p1')],
  ['detaching tasks from a deleted project', 'Task', 'update', (app) => app.tasks.deleteProject('p1')],
  ['adding a task', 'Task', 'create', (app) => app.tasks.addTask({ title: 'New', size: 'small', category: 'now' })],
  ['updating a task', 'Task', 'update', (app) => app.tasks.updateTask('t1', { done: true })],
  ['deleting a task', 'Task', 'delete', (app) => app.tasks.deleteTask('t1')],
  [
    'adding a reminder',
    'Reminder',
    'create',
    (app) =>
      app.reminders.addReminder({
        message: 'New',
        fireAt: new Date(FUTURE),
        repeat: { kind: 'none' },
      }),
  ],
  ['cancelling a reminder', 'Reminder', 'delete', (app) => app.reminders.cancelReminder('r1')],
  ['adding a lesson', 'TimetableEntry', 'create', (app) => app.timetable.addEntry(LESSON)],
  ['updating a lesson', 'TimetableEntry', 'update', (app) => app.timetable.updateEntry('e1', LESSON)],
  ['deleting a lesson', 'TimetableEntry', 'delete', (app) => app.timetable.deleteEntry('e1')],
  ['copying a day (new lessons)', 'TimetableEntry', 'create', (app) => app.timetable.copyDay('monday', ['tuesday'])],
  ['changing spoons (no row to fall back to)', 'UserPreferences', 'create', (app) => app.energy.setSpoons(20)],
];

describe('warning when a signed-in save fails', () => {
  const onFailure = vi.fn();
  let unsubscribe: () => void;

  beforeEach(() => {
    LOCAL_KEYS.forEach((key) => window.localStorage.removeItem(key));
    emitters.clear();
    onFailure.mockReset();
    unsubscribe = subscribeToSaveFailures(onFailure);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockResolvedValue({
      username: 'user-1',
      userId: 'user-1',
      signInDetails: { loginId: 'person@example.com' },
    });
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());

    MODELS.forEach((name) => {
      const model = mockModel(name);
      model.observeQuery.mockReset().mockImplementation(() => ({
        subscribe: (handlers: { next: (data: { items: unknown[] }) => void }) => {
          emitters.set(name, handlers.next);
          return { unsubscribe: vi.fn() };
        },
      }));
      (['create', 'update', 'delete'] as const).forEach((operation) => {
        model[operation].mockReset().mockResolvedValue({ data: null });
      });
    });
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
    LOCAL_KEYS.forEach((key) => window.localStorage.removeItem(key));
  });

  describe.each(FAILURES)('after %s', (_failure, fail) => {
    it.each(SAVES)('warns when %s fails', async (_save, modelName, operation, save) => {
      const model = mockModel(modelName);
      model[operation].mockImplementation(fail);
      if (modelName === 'UserPreferences') model.update.mockImplementation(fail);
      const { result } = await renderSignedIn();

      act(() => save(result.current));

      await waitFor(() => expect(onFailure).toHaveBeenCalled());
    });

    it('warns when a copied day cannot remove the old lessons', async () => {
      mockModel('TimetableEntry').delete.mockImplementation(fail);
      const { result } = await renderSignedIn({
        ...SIGNED_IN_DATA,
        TimetableEntry: [
          { id: 'e1', dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths' },
          { id: 'e2', dayOfWeek: 'tuesday', startTime: '09:00:00', label: 'Old' },
        ],
      });

      act(() => result.current.timetable.copyDay('monday', ['tuesday']));

      await waitFor(() => expect(onFailure).toHaveBeenCalled());
    });

    it('warns when first-time spoons cannot be stored', async () => {
      mockModel('UserPreferences').create.mockImplementation(fail);

      await renderSignedIn({ ...SIGNED_IN_DATA, UserPreferences: [] });

      await waitFor(() => expect(onFailure).toHaveBeenCalled());
    });

    it.each([
      ['projects', 'Project', 'beths-gang:projects', [{ id: 'p9', name: 'Local', createdAt: FUTURE }]],
      [
        'tasks',
        'Task',
        'beths-gang:tasks',
        [{ id: 't9', title: 'Local', size: 'small', category: 'now', done: false, createdAt: FUTURE }],
      ],
      [
        'reminders',
        'Reminder',
        'beths-gang:reminders',
        [{ id: 'r9', message: 'Local', fireAt: FUTURE, repeat: { kind: 'none' } }],
      ],
      [
        'lessons',
        'TimetableEntry',
        'beths-gang:timetable',
        [{ id: 'e9', dayOfWeek: 'friday', startTime: '09:00', label: 'Local' }],
      ],
    ] as [string, ModelName, string, unknown[]][])(
      'warns when local %s cannot be moved to the account',
      async (_label, modelName, key, stored) => {
        window.localStorage.setItem(key, JSON.stringify(stored));
        mockModel(modelName).create.mockImplementation(fail);

        await renderSignedIn();

        await waitFor(() => expect(onFailure).toHaveBeenCalled());
      },
    );
  });

  it.each([
    ['cleared', 'delete', { kind: 'none' }],
    ['rescheduled', 'update', { kind: 'daily' }],
  ] as [string, 'delete' | 'update', { kind: string }][])(
    'warns when a reminder that has fired cannot be %s',
    async (_outcome, operation, repeat) => {
      vi.useFakeTimers();
      try {
        mockModel('Reminder')[operation].mockResolvedValue({
          data: null,
          errors: [{ message: 'Denied' }],
        });
        renderHook(useEverything, { wrapper: Providers });
        await act(() => vi.advanceTimersByTimeAsync(10));
        act(() => {
          MODELS.forEach((name) =>
            emitters.get(name)?.({
              items:
                name === 'Reminder'
                  ? [
                      {
                        id: 'r1',
                        message: 'Due',
                        fireAt: new Date(Date.now() + 5_000).toISOString(),
                        warnedForCurrentFireAt: false,
                        repeat: JSON.stringify(repeat),
                      },
                    ]
                  : [],
            }),
          );
        });

        await act(() => vi.advanceTimersByTimeAsync(30_000));

        expect(onFailure).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('does not warn when saves succeed', async () => {
    const { result } = await renderSignedIn();

    act(() => {
      result.current.tasks.addProject('New');
      result.current.energy.setSpoons(20);
    });

    await waitFor(() => expect(mockModel('Project').create).toHaveBeenCalled());
    await act(async () => {});
    expect(onFailure).not.toHaveBeenCalled();
  });

  describe('spoons fallback', () => {
    // Regression: this used .catch(), but a missing row comes back as a resolved server
    // error, so the row was never created.
    it('creates the row when the update comes back with a server error', async () => {
      const model = mockModel('UserPreferences');
      model.update.mockResolvedValue({ data: null, errors: [{ message: 'No such row' }] });
      const { result } = await renderSignedIn();

      act(() => result.current.energy.setSpoons(65));

      await waitFor(() =>
        expect(model.create).toHaveBeenCalledWith({ id: 'user-1', spoons: 65 }),
      );
      await act(async () => {});
      expect(onFailure).not.toHaveBeenCalled();
    });

    it('does not create a row when the update worked', async () => {
      const model = mockModel('UserPreferences');
      const { result } = await renderSignedIn();

      act(() => result.current.energy.setSpoons(65));

      await waitFor(() => expect(model.update).toHaveBeenCalled());
      await act(async () => {});
      expect(model.create).not.toHaveBeenCalled();
    });
  });
});
