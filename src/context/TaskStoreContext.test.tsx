import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { TaskStoreProvider, useTaskStore } from './TaskStoreContext';
import { AuthProvider } from './AuthContext';
import { client } from '../lib/dataClient';

const PROJECTS_KEY = 'beths-gang:projects';
const TASKS_KEY = 'beths-gang:tasks';
const MIGRATION_FLAG_KEY = 'beths-gang:tasks-migrated';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

vi.mock('../lib/dataClient', () => ({
  client: {
    models: {
      Project: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      Task: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TaskStoreProvider>{children}</TaskStoreProvider>
    </AuthProvider>
  );
}

describe('TaskStoreContext (signed out)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(client.models.Project.create).mockClear();
    vi.mocked(client.models.Project.update).mockClear();
    vi.mocked(client.models.Project.delete).mockClear();
    vi.mocked(client.models.Task.create).mockClear();
    vi.mocked(client.models.Task.update).mockClear();
    vi.mocked(client.models.Task.delete).mockClear();
  });

  afterEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('starts empty with nothing stored', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    expect(result.current.projects).toEqual([]);
    expect(result.current.tasks).toEqual([]);
  });

  it('addProject adds a project, persists it, and returns the created Project', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    let created: ReturnType<typeof result.current.addProject> | undefined;
    act(() => {
      created = result.current.addProject('Kitchen reno');
    });

    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].name).toBe('Kitchen reno');
    expect(created).toEqual(result.current.projects[0]);
    const stored = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Kitchen reno');
  });

  it('addTask adds a standalone task (no project) and one tied to a project', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => result.current.addProject('Kitchen reno'));
    const projectId = result.current.projects[0].id;

    act(() => {
      result.current.addTask({ title: 'buy tape', size: 'small', category: 'now' });
      result.current.addTask({ title: 'grout tiles', size: 'large', category: 'later', projectId });
    });

    expect(result.current.tasks).toHaveLength(2);
    const standalone = result.current.tasks.find((task) => task.title === 'buy tape');
    const projectTask = result.current.tasks.find((task) => task.title === 'grout tiles');
    expect(standalone?.projectId).toBeUndefined();
    expect(standalone?.done).toBe(false);
    expect(projectTask?.projectId).toBe(projectId);
  });

  it('updateTask changes category, size, and done independently', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => result.current.addTask({ title: 'water the plants', size: 'small', category: 'now' }));
    const id = result.current.tasks[0].id;

    act(() => result.current.updateTask(id, { category: 'not-your-problem' }));
    expect(result.current.tasks[0].category).toBe('not-your-problem');
    expect(result.current.tasks[0].size).toBe('small'); // untouched

    act(() => result.current.updateTask(id, { done: true }));
    expect(result.current.tasks[0].done).toBe(true);
    expect(result.current.tasks[0].category).toBe('not-your-problem'); // untouched
  });

  it('updateTask can also change title and move a task between projects (or to/from standalone)', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => {
      result.current.addProject('Kitchen reno');
      result.current.addProject('Side hustle');
    });
    const [kitchenId, sideHustleId] = result.current.projects.map((project) => project.id);
    act(() => result.current.addTask({ title: 'buy tape', size: 'small', category: 'now', projectId: kitchenId }));
    const id = result.current.tasks[0].id;

    act(() => result.current.updateTask(id, { title: 'buy the right tape' }));
    expect(result.current.tasks[0].title).toBe('buy the right tape');
    expect(result.current.tasks[0].projectId).toBe(kitchenId); // untouched

    act(() => result.current.updateTask(id, { projectId: sideHustleId }));
    expect(result.current.tasks[0].projectId).toBe(sideHustleId);

    act(() => result.current.updateTask(id, { projectId: undefined }));
    expect(result.current.tasks[0].projectId).toBeUndefined();
  });

  it('updateProject renames a project without touching its tasks', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => result.current.addProject('Kitchen reno'));
    const projectId = result.current.projects[0].id;
    act(() => result.current.addTask({ title: 'grout tiles', size: 'large', category: 'later', projectId }));

    act(() => result.current.updateProject(projectId, { name: 'Kitchen renovation' }));

    expect(result.current.projects[0].name).toBe('Kitchen renovation');
    expect(result.current.tasks[0].projectId).toBe(projectId); // untouched
  });

  it('deleteTask removes it', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => result.current.addTask({ title: 'return library book', size: 'small', category: 'now' }));
    const id = result.current.tasks[0].id;

    act(() => result.current.deleteTask(id));
    expect(result.current.tasks).toHaveLength(0);
  });

  it('deleteProject removes the project but detaches (not deletes) its tasks', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });

    act(() => result.current.addProject('Kitchen reno'));
    const projectId = result.current.projects[0].id;
    act(() =>
      result.current.addTask({ title: 'grout tiles', size: 'large', category: 'later', projectId }),
    );

    act(() => result.current.deleteProject(projectId));

    expect(result.current.projects).toHaveLength(0);
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].projectId).toBeUndefined();
  });

  it('reads previously stored projects and tasks on mount', () => {
    window.localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify([{ id: 'p1', name: 'Existing project', createdAt: new Date().toISOString() }]),
    );
    window.localStorage.setItem(
      TASKS_KEY,
      JSON.stringify([
        {
          id: 't1',
          title: 'existing task',
          projectId: 'p1',
          size: 'small',
          category: 'now',
          done: false,
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    const { result } = renderHook(() => useTaskStore(), { wrapper });

    expect(result.current.projects).toHaveLength(1);
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('existing task');
  });

  it('never touches the backend while signed out', () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    act(() => {
      const project = result.current.addProject('Kitchen reno');
      result.current.addTask({ title: 'grout tiles', size: 'small', category: 'now', projectId: project.id });
    });
    const [projectId] = result.current.projects.map((project) => project.id);
    act(() => result.current.updateProject(projectId, { name: 'renamed' }));
    act(() => result.current.deleteProject(projectId));

    expect(client.models.Project.create).not.toHaveBeenCalled();
    expect(client.models.Project.update).not.toHaveBeenCalled();
    expect(client.models.Project.delete).not.toHaveBeenCalled();
    expect(client.models.Task.create).not.toHaveBeenCalled();
    expect(client.models.Task.update).not.toHaveBeenCalled();
    expect(client.models.Task.delete).not.toHaveBeenCalled();
  });
});

describe('TaskStoreContext (signed in)', () => {
  let projectObserveNext: ((data: { items: unknown[] }) => void) | undefined;
  let taskObserveNext: ((data: { items: unknown[] }) => void) | undefined;

  beforeEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    projectObserveNext = undefined;
    taskObserveNext = undefined;

    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockResolvedValue({
      username: 'user-1',
      userId: 'user-1',
      signInDetails: { loginId: 'person@example.com' },
    });
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());

    vi.mocked(client.models.Project.observeQuery)
      .mockReset()
      .mockImplementation(
        (() => ({
          subscribe: (handlers: { next: (data: { items: unknown[] }) => void }) => {
            projectObserveNext = handlers.next;
            return { unsubscribe: vi.fn() };
          },
        })) as unknown as typeof client.models.Project.observeQuery,
      );
    vi.mocked(client.models.Task.observeQuery)
      .mockReset()
      .mockImplementation(
        (() => ({
          subscribe: (handlers: { next: (data: { items: unknown[] }) => void }) => {
            taskObserveNext = handlers.next;
            return { unsubscribe: vi.fn() };
          },
        })) as unknown as typeof client.models.Task.observeQuery,
      );
    vi.mocked(client.models.Project.create).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Project.update).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Project.delete).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Task.create).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Task.update).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Task.delete).mockReset().mockResolvedValue({ data: null });
  });

  afterEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('addProject creates a backend row, and the observeQuery echo drives displayed state', async () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Project.observeQuery).toHaveBeenCalled());
    act(() => projectObserveNext?.({ items: [] }));
    act(() => taskObserveNext?.({ items: [] }));

    act(() => {
      result.current.addProject('Kitchen reno');
    });

    expect(client.models.Project.create).toHaveBeenCalledTimes(1);
    const createdInput = vi.mocked(client.models.Project.create).mock.calls[0][0];
    expect(createdInput).toMatchObject({ name: 'Kitchen reno' });

    // Optimistic state already reflects it, before any echo.
    expect(result.current.projects).toHaveLength(1);

    act(() => projectObserveNext?.({ items: [createdInput] }));
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].name).toBe('Kitchen reno');
  });

  it('addTask creates a backend row with projectId translated to null when standalone', async () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Task.observeQuery).toHaveBeenCalled());
    act(() => projectObserveNext?.({ items: [] }));
    act(() => taskObserveNext?.({ items: [] }));

    act(() => {
      result.current.addTask({ title: 'water the plants', size: 'small', category: 'now' });
    });

    expect(client.models.Task.create).toHaveBeenCalledTimes(1);
    const createdInput = vi.mocked(client.models.Task.create).mock.calls[0][0];
    expect(createdInput).toMatchObject({ title: 'water the plants', projectId: null, done: false });
  });

  it('updateTask sends an explicit null to clear projectId, but omits it when untouched', async () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Task.observeQuery).toHaveBeenCalled());
    act(() => projectObserveNext?.({ items: [] }));
    act(() =>
      taskObserveNext?.({
        items: [
          {
            id: 'task-1',
            title: 'grout tiles',
            projectId: 'project-1',
            size: 'small',
            category: 'later',
            done: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    act(() => result.current.updateTask('task-1', { done: true }));
    expect(client.models.Task.update).toHaveBeenLastCalledWith({ id: 'task-1', done: true });

    act(() => result.current.updateTask('task-1', { projectId: undefined }));
    expect(client.models.Task.update).toHaveBeenLastCalledWith({ id: 'task-1', projectId: null });
  });

  it('deleteProject deletes the backend row and detaches its tasks there too', async () => {
    const { result } = renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Project.observeQuery).toHaveBeenCalled());
    act(() =>
      projectObserveNext?.({
        items: [{ id: 'project-1', name: 'Kitchen reno', createdAt: new Date().toISOString() }],
      }),
    );
    act(() =>
      taskObserveNext?.({
        items: [
          {
            id: 'task-1',
            title: 'grout tiles',
            projectId: 'project-1',
            size: 'small',
            category: 'later',
            done: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    act(() => result.current.deleteProject('project-1'));

    expect(client.models.Project.delete).toHaveBeenCalledWith({ id: 'project-1' });
    expect(client.models.Task.update).toHaveBeenCalledWith({ id: 'task-1', projectId: null });
  });

  it('migrates local-only projects and tasks to the backend once, silently, on first sign-in', async () => {
    window.localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify([{ id: 'local-project-1', name: 'Pre-existing project', createdAt: new Date().toISOString() }]),
    );
    window.localStorage.setItem(
      TASKS_KEY,
      JSON.stringify([
        {
          id: 'local-task-1',
          title: 'pre-existing task',
          projectId: 'local-project-1',
          size: 'small',
          category: 'now',
          done: false,
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    renderHook(() => useTaskStore(), { wrapper });

    await waitFor(() => expect(client.models.Project.create).toHaveBeenCalledTimes(1));
    expect(client.models.Project.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-project-1', name: 'Pre-existing project' }),
    );
    await waitFor(() => expect(client.models.Task.create).toHaveBeenCalledTimes(1));
    expect(client.models.Task.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-task-1', title: 'pre-existing task' }),
    );
    await waitFor(() => expect(window.localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('true'));
  });

  it('does not re-migrate on a subsequent sign-in once the migration flag is set', async () => {
    window.localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify([{ id: 'local-project-1', name: 'Already migrated', createdAt: new Date().toISOString() }]),
    );
    window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

    renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Project.observeQuery).toHaveBeenCalled());

    expect(client.models.Project.create).not.toHaveBeenCalled();
  });

  it('a project created while signed in is not visible after signing out (account data, not device data)', async () => {
    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useTaskStore(), { wrapper });
    await waitFor(() => expect(client.models.Project.observeQuery).toHaveBeenCalled());
    act(() => projectObserveNext?.({ items: [] }));
    act(() => taskObserveNext?.({ items: [] }));

    act(() => {
      result.current.addProject('account-only project');
    });
    expect(result.current.projects).toHaveLength(1);
    // The account's project is never written to localStorage while signed in — only
    // whatever was there from before sign-in (nothing, in this test).
    expect(JSON.parse(window.localStorage.getItem(PROJECTS_KEY) ?? '[]')).toEqual([]);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));
    act(() => {
      hubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() => expect(result.current.projects).toHaveLength(0));
  });
});
