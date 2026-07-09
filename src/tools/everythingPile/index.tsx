import { useState } from 'react';
import { useTaskStore } from '../../context/TaskStoreContext';
import type { Project, Task, TaskCategory, TaskSize } from '../../context/TaskStoreContext';
import { useToolNavigation } from '../../context/ToolNavigationContext';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

const CATEGORY_ORDER: TaskCategory[] = ['now', 'later', 'not-your-problem'];

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  now: 'Now',
  later: 'Later',
  'not-your-problem': 'Not Your Problem',
};

const CATEGORY_PRIORITY: Record<TaskCategory, number> = {
  now: 0,
  later: 1,
  'not-your-problem': 2,
};

const SIZE_LABELS: Record<TaskSize, string> = {
  small: 'S',
  large: 'L',
};

// Not a real project id — the fixed bucket for tasks with no projectId, always
// rendered first so standalone (quick-capture) tasks are the easiest thing to get to
// in the tree. Also doubles as the "move to Everything Else" option's value in the
// task-edit project select.
const UNFILED_ID = 'unfiled';
const UNFILED_NAME = 'Everything Else';

function sortTasks(tasks: Task[]): Task[] {
  // Done tasks sink to the bottom (shown, not hidden, as a record of what got cleared
  // out of the pile). Otherwise ordered by category so a group stays scannable without
  // needing a second level of nesting per category.
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.category !== b.category) return CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

interface SizeToggleProps {
  value: TaskSize;
  onChange: (size: TaskSize) => void;
}

// Shared by the add-task row and the task-edit form — kept as one component so the two
// places a task's size can be set don't drift apart.
function SizeToggle({ value, onChange }: SizeToggleProps) {
  return (
    <div className="size-toggle" role="group" aria-label="Task size">
      <button type="button" aria-label="Small" className={value === 'small' ? 'size-toggle-active' : ''} onClick={() => onChange('small')}>
        S
      </button>
      <button type="button" aria-label="Large" className={value === 'large' ? 'size-toggle-active' : ''} onClick={() => onChange('large')}>
        L
      </button>
    </div>
  );
}

interface AddTaskRowProps {
  projectId: string | undefined;
}

function AddTaskRow({ projectId }: AddTaskRowProps) {
  const { addTask } = useTaskStore();
  const [title, setTitle] = useState('');
  const [size, setSize] = useState<TaskSize>('small');
  const [category, setCategory] = useState<TaskCategory>('later');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed, projectId, size, category });
    setTitle('');
  }

  return (
    <form onSubmit={handleSubmit} className="add-task-row">
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add anything"
        aria-label="New task title"
      />
      <SizeToggle value={size} onChange={setSize} />
      <select value={category} aria-label="Category" onChange={(event) => setCategory(event.target.value as TaskCategory)}>
        {CATEGORY_ORDER.map((value) => (
          <option key={value} value={value}>
            {CATEGORY_LABELS[value]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!title.trim()}>
        Add to pile
      </button>
    </form>
  );
}

interface TaskGroup {
  id: string;
  name: string;
  // undefined for the synthetic "Everything Else" bucket — doubles as "is this a real,
  // editable/deletable project" throughout the render below.
  project: Project | undefined;
  tasks: Task[];
}

interface TaskEditDraft {
  title: string;
  size: TaskSize;
  projectId: string | undefined;
}

function EverythingPile() {
  const { projects, tasks, addProject, updateProject, deleteProject, updateTask, deleteTask } = useTaskStore();
  const { requestTaskBreakdown, navigateToTool } = useToolNavigation();

  const [newProjectName, setNewProjectName] = useState('');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraftName, setProjectDraftName] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskEditDraft>({ title: '', size: 'small', projectId: undefined });

  function handleAddProject(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    addProject(trimmed);
    setNewProjectName('');
  }

  function toggleCollapsed(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function startEditingProject(project: Project) {
    setEditingProjectId(project.id);
    setProjectDraftName(project.name);
  }

  function saveProjectName(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = projectDraftName.trim();
    if (!trimmed || !editingProjectId) return;
    updateProject(editingProjectId, { name: trimmed });
    setEditingProjectId(null);
  }

  function startEditingTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskDraft({ title: task.title, size: task.size, projectId: task.projectId });
  }

  function saveTaskEdit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = taskDraft.title.trim();
    if (!trimmed || !editingTaskId) return;
    updateTask(editingTaskId, { title: trimmed, size: taskDraft.size, projectId: taskDraft.projectId });
    setEditingTaskId(null);
  }

  // Hands the project off to Task Breakdown — see ToolNavigationContext.tsx. Task
  // Breakdown remembers this project id, so sending the resulting steps back lands in
  // this same project rather than creating a new one.
  function handleBreakdown(project: Project) {
    requestTaskBreakdown({ projectId: project.id, projectName: project.name, prefillText: project.name });
    navigateToTool('task-breakdown');
  }

  const groups: TaskGroup[] = [
    {
      id: UNFILED_ID,
      name: UNFILED_NAME,
      project: undefined,
      tasks: sortTasks(tasks.filter((task) => !task.projectId)),
    },
    ...projects.map((project) => ({
      id: project.id,
      name: project.name,
      project,
      tasks: sortTasks(tasks.filter((task) => task.projectId === project.id)),
    })),
  ];

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Everything lives here — projects and the tasks inside them, all in one pile.
        Add a project, drop tasks into it (or leave them loose), size each one, and
        file it as Now / Later / Not Your Problem whenever that's useful. Nothing has
        to be sorted the moment it lands.
      </p>

      <form onSubmit={handleAddProject} className="new-project-form">
        <input
          type="text"
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder="+ New project"
          aria-label="New project name"
        />
        <button type="submit" disabled={!newProjectName.trim()}>
          Add project
        </button>
      </form>

      <div className="task-tree">
        {groups.map((group) => {
          const collapsed = collapsedGroupIds.has(group.id);
          const isRenamingThisGroup = group.project !== undefined && editingProjectId === group.project.id;

          return (
            <div key={group.id} className="task-group">
              <div className="task-group-header">
                {isRenamingThisGroup ? (
                  <form onSubmit={saveProjectName} className="task-group-rename-form">
                    <input
                      type="text"
                      value={projectDraftName}
                      onChange={(event) => setProjectDraftName(event.target.value)}
                      aria-label={`Rename ${group.name}`}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditingProjectId(null);
                      }}
                    />
                    <button type="submit" disabled={!projectDraftName.trim()}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingProjectId(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="task-group-toggle"
                      aria-expanded={!collapsed}
                      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
                      onClick={() => toggleCollapsed(group.id)}
                    >
                      <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                      <span className="task-group-name">{group.name}</span>
                      <span className="task-group-count">{group.tasks.length}</span>
                    </button>
                    {group.project && (
                      <>
                        <button
                          type="button"
                          className="task-group-edit"
                          aria-label={`Break down project ${group.name}`}
                          title="Break down with Task Breakdown"
                          onClick={() => handleBreakdown(group.project!)}
                        >
                          🧩
                        </button>
                        <button
                          type="button"
                          className="task-group-edit"
                          aria-label={`Rename project ${group.name}`}
                          onClick={() => startEditingProject(group.project!)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="task-group-delete"
                          aria-label={`Delete project ${group.name}`}
                          onClick={() => deleteProject(group.project!.id)}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {!collapsed && (
                <div className="task-group-body">
                  <AddTaskRow projectId={group.project?.id} />
                  {group.tasks.length === 0 ? (
                    <p className="task-empty">Nothing here.</p>
                  ) : (
                    <ul className="task-list">
                      {group.tasks.map((task) => (
                        <li key={task.id} className={`task-item${task.done ? ' task-item-done' : ''}`}>
                          {editingTaskId === task.id ? (
                            <form onSubmit={saveTaskEdit} className="task-edit-form">
                              <input
                                type="text"
                                value={taskDraft.title}
                                onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))}
                                aria-label="Edit task title"
                                autoFocus
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') setEditingTaskId(null);
                                }}
                              />
                              <SizeToggle
                                value={taskDraft.size}
                                onChange={(size) => setTaskDraft((draft) => ({ ...draft, size }))}
                              />
                              <select
                                value={taskDraft.projectId ?? UNFILED_ID}
                                aria-label="Project"
                                onChange={(event) =>
                                  setTaskDraft((draft) => ({
                                    ...draft,
                                    projectId: event.target.value === UNFILED_ID ? undefined : event.target.value,
                                  }))
                                }
                              >
                                <option value={UNFILED_ID}>{UNFILED_NAME}</option>
                                {projects.map((project) => (
                                  <option key={project.id} value={project.id}>
                                    {project.name}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" disabled={!taskDraft.title.trim()}>
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingTaskId(null)}>
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <input
                                type="checkbox"
                                checked={task.done}
                                aria-label={`Mark "${task.title}" done`}
                                onChange={(event) => updateTask(task.id, { done: event.target.checked })}
                              />
                              <p className="task-item-title">
                                <span className="size-badge" aria-label={`Size: ${task.size}`}>
                                  {SIZE_LABELS[task.size]}
                                </span>
                                {task.title}
                              </p>
                              <select
                                className={`category-tag category-tag-${task.category}`}
                                value={task.category}
                                aria-label={`Move "${task.title}" to a different category`}
                                onChange={(event) => updateTask(task.id, { category: event.target.value as TaskCategory })}
                              >
                                {CATEGORY_ORDER.map((value) => (
                                  <option key={value} value={value}>
                                    {CATEGORY_LABELS[value]}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="task-item-edit"
                                aria-label={`Edit "${task.title}"`}
                                onClick={() => startEditingTask(task)}
                              >
                                ✎
                              </button>
                              <button type="button" className="copy-button" onClick={() => deleteTask(task.id)}>
                                Delete
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const everythingPileTool: ToolDefinition = {
  meta,
  Component: EverythingPile,
};
