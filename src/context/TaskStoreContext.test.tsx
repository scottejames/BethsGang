import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { TaskStoreProvider, useTaskStore } from './TaskStoreContext';

const PROJECTS_KEY = 'beths-gang:projects';
const TASKS_KEY = 'beths-gang:tasks';

function wrapper({ children }: { children: ReactNode }) {
  return <TaskStoreProvider>{children}</TaskStoreProvider>;
}

describe('TaskStoreContext', () => {
  beforeEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(PROJECTS_KEY);
    window.localStorage.removeItem(TASKS_KEY);
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
});
