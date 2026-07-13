import { useState } from 'react';
import { useTaskStore } from '../../context/TaskStoreContext';
import type { Project, Task, TaskCategory, TaskSize } from '../../context/TaskStoreContext';
import { useToolNavigation } from '../../context/ToolNavigationContext';
import { useUndoableDelete } from '../../hooks/useUndoableDelete';
import { UndoToastStack } from '../../components/UndoToastStack';
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

// Pure — no hooks inside, just a computation over the current projects/tasks. Kept as
// a plain function rather than a component or a "useX" hook since it holds no state of
// its own.
function buildTaskGroups(projects: Project[], visibleTasks: Task[]): TaskGroup[] {
  return [
    {
      id: UNFILED_ID,
      name: UNFILED_NAME,
      project: undefined,
      tasks: sortTasks(visibleTasks.filter((task) => !task.projectId)),
    },
    ...projects.map((project) => ({
      id: project.id,
      name: project.name,
      project,
      tasks: sortTasks(visibleTasks.filter((task) => task.projectId === project.id)),
    })),
  ];
}

interface TaskGroupHeaderProps {
  group: TaskGroup;
  collapsed: boolean;
  onToggleExpanded: () => void;
  isRenaming: boolean;
  draftName: string;
  onDraftNameChange: (value: string) => void;
  onSaveRename: (event: React.FormEvent) => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onBreakdown: () => void;
  onProjectToTask: () => void;
  onDelete: () => void;
}

// The task-group row: either the rename form, or the expand/collapse toggle plus (for
// a real project, not the synthetic Everything Else bucket) the break-down/convert-to-
// task/rename/delete buttons.
function TaskGroupHeader({
  group,
  collapsed,
  onToggleExpanded,
  isRenaming,
  draftName,
  onDraftNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onBreakdown,
  onProjectToTask,
  onDelete,
}: TaskGroupHeaderProps) {
  if (isRenaming) {
    return (
      <form onSubmit={onSaveRename} className="task-group-rename-form">
        <input
          type="text"
          value={draftName}
          onChange={(event) => onDraftNameChange(event.target.value)}
          aria-label={`Rename ${group.name}`}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancelRename();
          }}
        />
        <button type="submit" disabled={!draftName.trim()}>
          Save
        </button>
        <button type="button" onClick={onCancelRename}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        className="task-group-toggle"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
        onClick={onToggleExpanded}
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
            onClick={onBreakdown}
          >
            🧩
          </button>
          {group.tasks.length === 0 && (
            <button
              type="button"
              className="task-group-edit"
              aria-label={`Turn project "${group.name}" into a task`}
              title="Turn into a task in Everything Else"
              onClick={onProjectToTask}
            >
              📤
            </button>
          )}
          <button
            type="button"
            className="task-group-edit"
            aria-label={`Rename project ${group.name}`}
            onClick={onStartRename}
          >
            ✎
          </button>
          <button
            type="button"
            className="task-group-delete"
            aria-label={`Delete project ${group.name}`}
            onClick={onDelete}
          >
            ×
          </button>
        </>
      )}
    </>
  );
}

interface TaskEditDraft {
  title: string;
  size: TaskSize;
  projectId: string | undefined;
}

interface TaskListItemProps {
  task: Task;
  projects: Project[];
  isEditing: boolean;
  draft: TaskEditDraft;
  onDraftChange: (patch: Partial<TaskEditDraft>) => void;
  onStartEdit: () => void;
  onSaveEdit: (event: React.FormEvent) => void;
  onCancelEdit: () => void;
  onToggleDone: (done: boolean) => void;
  onCategoryChange: (category: TaskCategory) => void;
  onTaskToProject: () => void;
  onDelete: () => void;
}

// One row in a task-group's list: either its inline edit form, or its display row
// (checkbox, title, category, and the edit/turn-into-project/delete actions).
function TaskListItem({
  task,
  projects,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleDone,
  onCategoryChange,
  onTaskToProject,
  onDelete,
}: TaskListItemProps) {
  return (
    <li className={`task-item${task.done ? ' task-item-done' : ''}`}>
      {isEditing ? (
        <form onSubmit={onSaveEdit} className="task-edit-form">
          <input
            type="text"
            value={draft.title}
            onChange={(event) => onDraftChange({ title: event.target.value })}
            aria-label="Edit task title"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCancelEdit();
            }}
          />
          <SizeToggle value={draft.size} onChange={(size) => onDraftChange({ size })} />
          <select
            value={draft.projectId ?? UNFILED_ID}
            aria-label="Project"
            onChange={(event) =>
              onDraftChange({ projectId: event.target.value === UNFILED_ID ? undefined : event.target.value })
            }
          >
            <option value={UNFILED_ID}>{UNFILED_NAME}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!draft.title.trim()}>
            Save
          </button>
          <button type="button" onClick={onCancelEdit}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <input
            type="checkbox"
            checked={task.done}
            aria-label={`Mark "${task.title}" done`}
            onChange={(event) => onToggleDone(event.target.checked)}
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
            onChange={(event) => onCategoryChange(event.target.value as TaskCategory)}
          >
            {CATEGORY_ORDER.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          <button type="button" className="task-item-edit" aria-label={`Edit "${task.title}"`} onClick={onStartEdit}>
            ✎
          </button>
          <button
            type="button"
            className="task-item-edit"
            aria-label={`Turn "${task.title}" into a project`}
            title="Turn into its own project"
            onClick={onTaskToProject}
          >
            📁
          </button>
          <button type="button" className="copy-button" onClick={onDelete}>
            Delete
          </button>
        </>
      )}
    </li>
  );
}

function EverythingPile() {
  const { projects, tasks, addProject, addTask, updateProject, deleteProject, updateTask, deleteTask } = useTaskStore();
  const { requestTaskBreakdown, navigateToTool } = useToolNavigation();

  const [newProjectName, setNewProjectName] = useState('');
  // Tracks which groups are *open* (inverse of a "collapsed" set) — everything starts
  // closed for a neater default view, opened only as needed. A freshly created project
  // is added here immediately (see handleAddProject) so you're not stuck reopening the
  // thing you just made before you can add its first task.
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraftName, setProjectDraftName] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskEditDraft>({ title: '', size: 'small', projectId: undefined });

  // Task delete is genuinely destructive with no existing safety net (unlike
  // project delete, which detaches rather than destroys its tasks) — soft-delete
  // with a brief undo window instead of an instant, unrecoverable removal.
  const { pending: pendingDeletes, requestDelete, undo, isPending } = useUndoableDelete<Task>(
    (task) => deleteTask(task.id),
  );

  function handleDeleteTask(task: Task) {
    requestDelete(task.id, task, task.title);
  }

  function handleAddProject(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    const project = addProject(trimmed);
    setExpandedGroupIds((current) => new Set(current).add(project.id));
    setNewProjectName('');
  }

  function toggleExpanded(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  // Deleting a project detaches its tasks into Everything Else (see useTaskStore's
  // deleteProject) — opening that group automatically means the moved tasks are
  // actually visible instead of silently landing somewhere already closed.
  function handleDeleteProject(project: Project) {
    const hadTasks = tasks.some((task) => task.projectId === project.id);
    deleteProject(project.id);
    if (hadTasks) {
      setExpandedGroupIds((current) => new Set(current).add(UNFILED_ID));
    }
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
    // Moving a task to a different project (or back to Everything Else) should open
    // wherever it just landed — same reasoning as handleDeleteProject below.
    setExpandedGroupIds((current) => new Set(current).add(taskDraft.projectId ?? UNFILED_ID));
    setEditingTaskId(null);
  }

  // Hands the project off to Task Breakdown — see ToolNavigationContext.tsx. Task
  // Breakdown remembers this project id, so sending the resulting steps back lands in
  // this same project rather than creating a new one.
  function handleBreakdown(project: Project) {
    requestTaskBreakdown({ projectId: project.id, projectName: project.name, prefillText: project.name });
    navigateToTool('task-breakdown');
  }

  // Only offered when the project is empty (see the render below) — converting one
  // that still has tasks would either lose them or need a decision per task, out of
  // scope for a one-click action. Deletes the project and creates a single task named
  // after it, landing in Everything Else — small and "later" by default, same as
  // Side Quest Log's "Make it a task" promotion.
  function handleProjectToTask(project: Project) {
    addTask({ title: project.name, projectId: undefined, size: 'small', category: 'later' });
    deleteProject(project.id);
    setExpandedGroupIds((current) => new Set(current).add(UNFILED_ID));
  }

  // The reverse direction — any task, anywhere in the tree, can become its own
  // project. Nothing about the task (size, category, done) carries over, since a bare
  // project doesn't have those; only its title becomes the new project's name.
  function handleTaskToProject(task: Task) {
    const project = addProject(task.title);
    deleteTask(task.id);
    setExpandedGroupIds((current) => new Set(current).add(project.id));
  }

  // Pending-delete tasks disappear from the tree immediately (the undo toast is the
  // only remaining trace of them) — the actual TaskStoreContext delete only happens
  // once the undo window elapses with no undo.
  const visibleTasks = tasks.filter((task) => !isPending(task.id));
  const groups = buildTaskGroups(projects, visibleTasks);

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
          const collapsed = !expandedGroupIds.has(group.id);
          const isRenamingThisGroup = group.project !== undefined && editingProjectId === group.project.id;

          return (
            <div key={group.id} className="task-group">
              <div className="task-group-header">
                <TaskGroupHeader
                  group={group}
                  collapsed={collapsed}
                  onToggleExpanded={() => toggleExpanded(group.id)}
                  isRenaming={isRenamingThisGroup}
                  draftName={projectDraftName}
                  onDraftNameChange={setProjectDraftName}
                  onSaveRename={saveProjectName}
                  onCancelRename={() => setEditingProjectId(null)}
                  onStartRename={() => group.project && startEditingProject(group.project)}
                  onBreakdown={() => group.project && handleBreakdown(group.project)}
                  onProjectToTask={() => group.project && handleProjectToTask(group.project)}
                  onDelete={() => group.project && handleDeleteProject(group.project)}
                />
              </div>

              {!collapsed && (
                <div className="task-group-body">
                  <AddTaskRow projectId={group.project?.id} />
                  {group.tasks.length === 0 ? (
                    <p className="task-empty">Nothing here.</p>
                  ) : (
                    <ul className="task-list">
                      {group.tasks.map((task) => (
                        <TaskListItem
                          key={task.id}
                          task={task}
                          projects={projects}
                          isEditing={editingTaskId === task.id}
                          draft={taskDraft}
                          onDraftChange={(patch) => setTaskDraft((draft) => ({ ...draft, ...patch }))}
                          onStartEdit={() => startEditingTask(task)}
                          onSaveEdit={saveTaskEdit}
                          onCancelEdit={() => setEditingTaskId(null)}
                          onToggleDone={(done) => updateTask(task.id, { done })}
                          onCategoryChange={(category) => updateTask(task.id, { category })}
                          onTaskToProject={() => handleTaskToProject(task)}
                          onDelete={() => handleDeleteTask(task)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <UndoToastStack
        items={pendingDeletes.map((entry) => ({ id: entry.id, label: entry.label }))}
        onUndo={undo}
      />
    </div>
  );
}

export const everythingPileTool: ToolDefinition = {
  meta,
  Component: EverythingPile,
};
