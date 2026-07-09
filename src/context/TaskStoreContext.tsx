import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export type TaskSize = 'small' | 'large';
export type TaskCategory = 'now' | 'later' | 'not-your-problem';

export interface Task {
  id: string;
  title: string;
  // Optional on purpose — a task can stand alone (quick-capture, no project chosen),
  // matching the Side Quest Log spirit this tool grew out of, and keeping the model
  // usable by any future tool that just wants to drop in a bare task.
  projectId?: string;
  size: TaskSize;
  category: TaskCategory;
  done: boolean;
  createdAt: string;
}

const PROJECTS_STORAGE_KEY = 'beths-gang:projects';
const TASKS_STORAGE_KEY = 'beths-gang:tasks';
const MIGRATION_FLAG_KEY = 'beths-gang:tasks-migrated';

function readStored<T>(key: string): T[] {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toBackendProjectInput(project: Project) {
  return { id: project.id, name: project.name, createdAt: project.createdAt };
}

function fromBackendProjectItem(item: { id: string; name: string; createdAt: string }): Project {
  return { id: item.id, name: item.name, createdAt: item.createdAt };
}

function toBackendTaskInput(task: Task) {
  return {
    id: task.id,
    title: task.title,
    // The backend field is nullable (a real project relation could clear it), but the
    // client-side Task type uses `undefined` for "no project" — `null` only ever needs
    // to be sent, never read back as anything other than absent (see fromBackendTaskItem).
    projectId: task.projectId ?? null,
    size: task.size,
    category: task.category,
    done: task.done,
    createdAt: task.createdAt,
  };
}

function fromBackendTaskItem(item: {
  id: string;
  title: string;
  projectId?: string | null;
  size: string;
  category: string;
  done: boolean;
  createdAt: string;
}): Task {
  return {
    id: item.id,
    title: item.title,
    projectId: item.projectId ?? undefined,
    size: item.size as TaskSize,
    category: item.category as TaskCategory,
    done: item.done,
    createdAt: item.createdAt,
  };
}

export interface AddTaskInput {
  title: string;
  projectId?: string;
  size: TaskSize;
  category: TaskCategory;
}

interface TaskStoreContextValue {
  projects: Project[];
  tasks: Task[];
  // Returns the created Project so a caller (e.g. Task Breakdown creating a new
  // project to send steps into) has its id immediately, without waiting on a
  // re-render — the object already exists before setProjects is called below.
  addProject: (name: string) => Project;
  updateProject: (id: string, patch: Partial<Pick<Project, 'name'>>) => void;
  // Detaches (not deletes) that project's tasks — they become project-less rather
  // than being silently destroyed along with the project.
  deleteProject: (id: string) => void;
  addTask: (input: AddTaskInput) => void;
  // `projectId: undefined` moves a task to standalone/Unfiled — same mechanism used to
  // move it between projects, since both are just changing which project (if any) owns it.
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'projectId' | 'size' | 'category' | 'done'>>) => void;
  deleteTask: (id: string) => void;
}

const TaskStoreContext = createContext<TaskStoreContextValue | null>(null);

// Persistent provider, same pattern as EnergyContext/RemindersContext — mounted once
// at the app root (see main.tsx) so any future tool can read/write the same store
// without needing Everything Pile itself to be open. Follows Reminder's exact
// signed-in/signed-out shape (see RemindersContext.tsx and
// designs/user-personalization.md's "Phase 3"): `localStorage` remains the full
// default experience for anyone not signed in, and a signed-in user's Projects/Tasks
// live in DynamoDB (owner-scoped, see amplify/data/resource.ts) instead.
export function TaskStoreProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [projects, setProjects] = useState<Project[]>(() => readStored<Project>(PROJECTS_STORAGE_KEY));
  const [tasks, setTasks] = useState<Task[]>(() => readStored<Task>(TASKS_STORAGE_KEY));
  const wasSignedIn = useRef(isSignedIn);

  // Only mirrors to localStorage while signed out — while signed in, `projects`/`tasks`
  // are driven by the observeQuery subscriptions below, and that's account data. It
  // must NOT leak into localStorage, or it would still be visible after signing out
  // (see RemindersContext's identical reasoning, found via the same real bug there).
  //
  // The sign-out transition itself is handled in this same effect as the write,
  // deliberately not as two separate effects — see RemindersContext.tsx's comment on
  // its equivalent effect for the exact race this avoids.
  useEffect(() => {
    const justSignedOut = wasSignedIn.current && !isSignedIn;
    wasSignedIn.current = isSignedIn;
    if (justSignedOut) {
      setProjects(readStored<Project>(PROJECTS_STORAGE_KEY));
      setTasks(readStored<Task>(TASKS_STORAGE_KEY));
      return; // this render's projects/tasks are stale account data — don't write them
    }
    if (!isSignedIn) {
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [projects, tasks, isSignedIn]);

  // Signed in: Projects/Tasks live in the backend. observeQuery emits the current set
  // immediately, then live updates — same "added on phone, appears on laptop" effect
  // Reminders already gets.
  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.Project.observeQuery().subscribe({
      next: ({ items }) => {
        setProjects(items.map(fromBackendProjectItem));
      },
      error: (error: unknown) => {
        console.error('Project subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.Task.observeQuery().subscribe({
      next: ({ items }) => {
        setTasks(items.map(fromBackendTaskItem));
      },
      error: (error: unknown) => {
        console.error('Task subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  // First sign-in on this device only: upload whatever's in localStorage so it isn't
  // stranded there. Silent, no prompt — same no-login-wall philosophy as Reminders.
  // Uses each project/task's existing id, so a second run (Strict Mode, or signing in
  // again later) just fails the duplicate create() harmlessly instead of double-
  // uploading. Projects and tasks are migrated together, in one batch — there's no
  // real foreign-key constraint on the backend (`Task.projectId` is a plain string,
  // not a relation) so upload order between the two doesn't matter.
  useEffect(() => {
    if (!isSignedIn) return;
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const localProjects = readStored<Project>(PROJECTS_STORAGE_KEY);
    const localTasks = readStored<Task>(TASKS_STORAGE_KEY);
    Promise.all([
      ...localProjects.map((project) =>
        client.models.Project.create(toBackendProjectInput(project)).catch((error: unknown) => {
          console.error('Failed to migrate local project', error);
        }),
      ),
      ...localTasks.map((task) =>
        client.models.Task.create(toBackendTaskInput(task)).catch((error: unknown) => {
          console.error('Failed to migrate local task', error);
        }),
      ),
    ]).then(() => {
      window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    });
  }, [isSignedIn]);

  function addProject(name: string): Project {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    // Optimistic — state updates immediately either way, same feel as before this
    // context talked to a backend. When signed in, the next observeQuery emission
    // reconciles this against whatever the backend actually stored.
    setProjects((current) => [...current, project]);
    if (isSignedIn) {
      client.models.Project.create(toBackendProjectInput(project)).catch((error: unknown) => {
        console.error('Failed to create project', error);
      });
    }
    return project;
  }

  function updateProject(id: string, patch: Partial<Pick<Project, 'name'>>) {
    setProjects((current) => current.map((project) => (project.id === id ? { ...project, ...patch } : project)));
    if (isSignedIn) {
      client.models.Project.update({ id, ...patch }).catch((error: unknown) => {
        console.error('Failed to update project', error);
      });
    }
  }

  function deleteProject(id: string) {
    const affectedTaskIds = tasks.filter((task) => task.projectId === id).map((task) => task.id);
    setProjects((current) => current.filter((project) => project.id !== id));
    setTasks((current) =>
      current.map((task) => (task.projectId === id ? { ...task, projectId: undefined } : task)),
    );
    if (isSignedIn) {
      client.models.Project.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete project', error);
      });
      affectedTaskIds.forEach((taskId) => {
        client.models.Task.update({ id: taskId, projectId: null }).catch((error: unknown) => {
          console.error('Failed to detach task from deleted project', error);
        });
      });
    }
  }

  function addTask(input: AddTaskInput) {
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title,
      projectId: input.projectId,
      size: input.size,
      category: input.category,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setTasks((current) => [...current, task]);
    if (isSignedIn) {
      client.models.Task.create(toBackendTaskInput(task)).catch((error: unknown) => {
        console.error('Failed to create task', error);
      });
    }
  }

  function updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'projectId' | 'size' | 'category' | 'done'>>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
    if (isSignedIn) {
      const { projectId, ...rest } = patch;
      client.models.Task
        // `projectId` needs an explicit `null` to clear it on the backend — omitting
        // the key entirely (what `patch.projectId` being `undefined` would send) just
        // leaves the existing value untouched instead.
        .update({ id, ...rest, ...('projectId' in patch ? { projectId: projectId ?? null } : {}) })
        .catch((error: unknown) => {
          console.error('Failed to update task', error);
        });
    }
  }

  function deleteTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
    if (isSignedIn) {
      client.models.Task.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete task', error);
      });
    }
  }

  return (
    <TaskStoreContext.Provider
      value={{ projects, tasks, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask }}
    >
      {children}
    </TaskStoreContext.Provider>
  );
}

export function useTaskStore(): TaskStoreContextValue {
  const context = useContext(TaskStoreContext);
  if (!context) {
    throw new Error('useTaskStore must be used within a TaskStoreProvider');
  }
  return context;
}
