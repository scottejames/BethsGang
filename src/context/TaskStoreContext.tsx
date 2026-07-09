import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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

export interface AddTaskInput {
  title: string;
  projectId?: string;
  size: TaskSize;
  category: TaskCategory;
}

interface TaskStoreContextValue {
  projects: Project[];
  tasks: Task[];
  addProject: (name: string) => void;
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
// without needing Park My Sidequest itself to be open. localStorage-only for now; a
// per-user backend model (matching Reminder/UserPreferences) is a natural later phase,
// deliberately not part of this pass.
export function TaskStoreProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => readStored<Project>(PROJECTS_STORAGE_KEY));
  const [tasks, setTasks] = useState<Task[]>(() => readStored<Task>(TASKS_STORAGE_KEY));

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  function addProject(name: string) {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    setProjects((current) => [...current, project]);
  }

  function updateProject(id: string, patch: Partial<Pick<Project, 'name'>>) {
    setProjects((current) => current.map((project) => (project.id === id ? { ...project, ...patch } : project)));
  }

  function deleteProject(id: string) {
    setProjects((current) => current.filter((project) => project.id !== id));
    setTasks((current) =>
      current.map((task) => (task.projectId === id ? { ...task, projectId: undefined } : task)),
    );
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
  }

  function updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'projectId' | 'size' | 'category' | 'done'>>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function deleteTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
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
