import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { TaskStoreProvider } from '../../context/TaskStoreContext';
import { ToolNavigationProvider, useToolNavigation } from '../../context/ToolNavigationContext';
import { everythingPileTool } from './index';

// ToolNavigationProvider logs usage via useUsageLog, which needs EnergyContext —
// mocked out here since this file is only testing Everything Pile's own behavior.
vi.mock('../../hooks/useUsageLog', () => ({
  useUsageLog: () => vi.fn(),
}));

// TaskStoreContext now reads sign-in state (see its own test file for signed-in
// backend behavior) — every test in this file runs signed out, so it's exercising the
// same localStorage-backed path as before that change.
vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const Component = everythingPileTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TaskStoreProvider>
        <ToolNavigationProvider>{children}</ToolNavigationProvider>
      </TaskStoreProvider>
    </AuthProvider>
  );
}

// Everything Pile's "Break down" button acts entirely through ToolNavigationContext (sets
// pendingBreakdownRequest, then navigates) — this app has no router, so there's no
// visible change within Everything Pile's own render to assert on. This spy, mounted
// alongside the tool inside the same provider, makes those context side effects
// observable without needing to render the whole App.
function NavigationSpy() {
  const { activeToolId, pendingBreakdownRequest } = useToolNavigation();
  return (
    <div data-testid="nav-spy">
      <span data-testid="active-tool-id">{activeToolId ?? ''}</span>
      <span data-testid="pending-breakdown">
        {pendingBreakdownRequest ? JSON.stringify(pendingBreakdownRequest) : ''}
      </span>
    </div>
  );
}

function renderTool() {
  return render(
    <>
      <Component />
      <NavigationSpy />
    </>,
    { wrapper },
  );
}

function group(name: string): HTMLElement {
  return screen.getByText(name, { selector: '.task-group-name' }).closest('.task-group') as HTMLElement;
}

function categoryValue(label: 'Now' | 'Later' | 'Not Your Problem'): string {
  return { Now: 'now', Later: 'later', 'Not Your Problem': 'not-your-problem' }[label];
}

// Groups start collapsed by default (except a project right after creation — see
// EverythingPile's handleAddProject) — expand first if needed so the add-task row
// this helper targets actually exists in the DOM.
function ensureExpanded(groupName: string) {
  const expandButton = screen.queryByRole('button', { name: `Expand ${groupName}` });
  if (expandButton) {
    fireEvent.click(expandButton);
  }
}

function addTaskTo(groupName: string, title: string, category?: 'Now' | 'Later' | 'Not Your Problem') {
  ensureExpanded(groupName);
  const scope = within(group(groupName));
  fireEvent.change(scope.getByPlaceholderText('Add anything'), { target: { value: title } });
  if (category) {
    fireEvent.change(scope.getByLabelText('Category'), { target: { value: categoryValue(category) } });
  }
  fireEvent.click(scope.getByRole('button', { name: 'Add to pile' }));
}

function addProject(name: string) {
  fireEvent.change(screen.getByLabelText('New project name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
}

// The task-edit form's Project <select> options are keyed by project id (a UUID), not
// their visible name — look up the actual option value rather than assuming it matches
// the label text.
function selectProjectOption(scope: ReturnType<typeof within>, label: string) {
  const option = scope.getByText(label, { selector: 'option' }) as HTMLOptionElement;
  fireEvent.change(scope.getByLabelText('Project'), { target: { value: option.value } });
}

describe('EverythingPile', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
  });

  it('always shows an Everything Else group for standalone tasks, collapsed by default', () => {
    renderTool();
    expect(screen.getByText('Everything Else', { selector: '.task-group-name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Everything Else' })).toBeInTheDocument();

    addTaskTo('Everything Else', 'water the plants', 'Now');
    expect(within(group('Everything Else')).getByText('water the plants')).toBeInTheDocument();
  });

  it('a freshly created project starts expanded, ready to add a task right away', () => {
    renderTool();
    addProject('Kitchen reno');
    expect(screen.getByRole('button', { name: 'Collapse Kitchen reno' })).toBeInTheDocument();
  });

  it('always lists Everything Else first, ahead of every project', () => {
    renderTool();
    addProject('Kitchen reno');
    addProject('Side hustle');

    const names = screen.getAllByText(/.+/, { selector: '.task-group-name' }).map((el) => el.textContent);
    expect(names).toEqual(['Everything Else', 'Kitchen reno', 'Side hustle']);
  });

  it('adding a task from inside a project group ties it to that project, not Everything Else', () => {
    renderTool();
    addProject('Kitchen reno');
    ensureExpanded('Everything Else');

    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    expect(within(group('Kitchen reno')).getByText('grout tiles')).toBeInTheDocument();
    expect(within(group('Everything Else')).queryByText('grout tiles')).not.toBeInTheDocument();
  });

  it('re-triages a task to a different category via its tag select', () => {
    renderTool();
    addTaskTo('Everything Else', 'call the dentist', 'Later');

    const item = within(group('Everything Else')).getByText('call the dentist').closest('li') as HTMLElement;
    const select = within(item).getByLabelText(/move .* to a different category/i) as HTMLSelectElement;
    expect(select.value).toBe('later');

    fireEvent.change(select, { target: { value: 'now' } });
    expect(select.value).toBe('now');
  });

  it('deletes a task', () => {
    renderTool();
    addTaskTo('Everything Else', 'cancel gym membership', 'Now');

    const item = within(group('Everything Else')).getByText('cancel gym membership').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Delete' }));

    expect(within(group('Everything Else')).queryByText('cancel gym membership')).not.toBeInTheDocument();
    expect(within(group('Everything Else')).getByText('Nothing here.')).toBeInTheDocument();
  });

  it('deleting a task shows an undo toast, and Undo restores the task', () => {
    renderTool();
    addTaskTo('Everything Else', 'cancel gym membership', 'Now');

    const item = within(group('Everything Else')).getByText('cancel gym membership').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Delete' }));

    expect(within(group('Everything Else')).queryByText('cancel gym membership')).not.toBeInTheDocument();
    expect(screen.getByText('"cancel gym membership" deleted.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(within(group('Everything Else')).getByText('cancel gym membership')).toBeInTheDocument();
    expect(screen.queryByText('"cancel gym membership" deleted.')).not.toBeInTheDocument();
  });

  it('a deleted task is actually removed once the undo window elapses with no undo', () => {
    vi.useFakeTimers();
    try {
      renderTool();
      addTaskTo('Everything Else', 'cancel gym membership', 'Now');

      const item = within(group('Everything Else')).getByText('cancel gym membership').closest('li') as HTMLElement;
      fireEvent.click(within(item).getByRole('button', { name: 'Delete' }));
      expect(screen.getByText('"cancel gym membership" deleted.')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText('"cancel gym membership" deleted.')).not.toBeInTheDocument();
      // Re-expanding (a fresh render path, not just the already-filtered list) confirms
      // the task is actually gone from the store, not just still hidden by the toast.
      expect(within(group('Everything Else')).getByText('Nothing here.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deleting a project moves its tasks into Everything Else instead of losing them', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    fireEvent.click(screen.getByRole('button', { name: 'Delete project Kitchen reno' }));

    expect(screen.queryByText('Kitchen reno', { selector: '.task-group-name' })).not.toBeInTheDocument();
    expect(within(group('Everything Else')).getByText('grout tiles')).toBeInTheDocument();
  });

  it('marking a task done strikes it through and sinks it to the bottom of its group', () => {
    renderTool();
    addTaskTo('Everything Else', 'first task', 'Now');
    addTaskTo('Everything Else', 'second task', 'Now');

    const firstItem = within(group('Everything Else')).getByText('first task').closest('li') as HTMLElement;
    fireEvent.click(within(firstItem).getByRole('checkbox'));

    const items = within(group('Everything Else')).getAllByRole('listitem');
    expect(items[items.length - 1]).toHaveTextContent('first task');
    expect(firstItem.className).toContain('task-item-done');
  });

  it('collapsing a group hides its tasks and add-task row; expanding shows them again', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Kitchen reno' }));

    expect(within(group('Kitchen reno')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(within(group('Kitchen reno')).queryByPlaceholderText('Add anything')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Kitchen reno' }));

    expect(within(group('Kitchen reno')).getByText('grout tiles')).toBeInTheDocument();
  });

  it('renames a project', () => {
    renderTool();
    addProject('Kitchen reno');

    fireEvent.click(screen.getByRole('button', { name: 'Rename project Kitchen reno' }));
    const input = screen.getByLabelText('Rename Kitchen reno');
    fireEvent.change(input, { target: { value: 'Kitchen renovation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Kitchen renovation', { selector: '.task-group-name' })).toBeInTheDocument();
    expect(screen.queryByText('Kitchen reno', { selector: '.task-group-name' })).not.toBeInTheDocument();
  });

  it('cancelling a project rename leaves the name unchanged', () => {
    renderTool();
    addProject('Kitchen reno');

    fireEvent.click(screen.getByRole('button', { name: 'Rename project Kitchen reno' }));
    fireEvent.change(screen.getByLabelText('Rename Kitchen reno'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Kitchen reno', { selector: '.task-group-name' })).toBeInTheDocument();
  });

  it('edits a task\'s title and size in place', () => {
    renderTool();
    addTaskTo('Everything Else', 'water the plants', 'Now');

    const item = within(group('Everything Else')).getByText('water the plants').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit "water the plants"' }));

    const editForm = within(item).getByLabelText('Edit task title').closest('form') as HTMLElement;
    fireEvent.change(within(editForm).getByLabelText('Edit task title'), { target: { value: 'water the office plants' } });
    fireEvent.click(within(editForm).getByLabelText('Large'));
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    const updatedItem = within(group('Everything Else')).getByText('water the office plants').closest('li') as HTMLElement;
    expect(within(updatedItem).getByLabelText('Size: large')).toBeInTheDocument();
  });

  it('moves a task to a different project via the edit form, and back to Everything Else', () => {
    renderTool();
    addProject('Kitchen reno');
    addProject('Side hustle');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    const item = within(group('Kitchen reno')).getByText('grout tiles').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit "grout tiles"' }));
    const editForm = within(item).getByLabelText('Edit task title').closest('form') as HTMLElement;
    selectProjectOption(within(editForm), 'Side hustle');
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    expect(within(group('Kitchen reno')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(within(group('Side hustle')).getByText('grout tiles')).toBeInTheDocument();

    // And back out to standalone.
    const movedItem = within(group('Side hustle')).getByText('grout tiles').closest('li') as HTMLElement;
    fireEvent.click(within(movedItem).getByRole('button', { name: 'Edit "grout tiles"' }));
    const secondEditForm = within(movedItem).getByLabelText('Edit task title').closest('form') as HTMLElement;
    selectProjectOption(within(secondEditForm), 'Everything Else');
    fireEvent.click(within(secondEditForm).getByRole('button', { name: 'Save' }));

    expect(within(group('Side hustle')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(within(group('Everything Else')).getByText('grout tiles')).toBeInTheDocument();
  });

  it('cancelling a task edit discards the draft', () => {
    renderTool();
    addTaskTo('Everything Else', 'water the plants', 'Now');

    const item = within(group('Everything Else')).getByText('water the plants').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit "water the plants"' }));
    fireEvent.change(within(item).getByLabelText('Edit task title'), { target: { value: 'something else entirely' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Cancel' }));

    expect(within(group('Everything Else')).getByText('water the plants')).toBeInTheDocument();
    expect(within(group('Everything Else')).queryByText('something else entirely')).not.toBeInTheDocument();
  });

  it('the Break down button hands the project off to Task Breakdown and navigates there', () => {
    renderTool();
    addProject('Kitchen reno');

    fireEvent.click(screen.getByRole('button', { name: 'Break down project Kitchen reno' }));

    expect(screen.getByTestId('active-tool-id')).toHaveTextContent('task-breakdown');
    const pending = JSON.parse(screen.getByTestId('pending-breakdown').textContent || '{}');
    expect(pending.projectName).toBe('Kitchen reno');
    expect(pending.prefillText).toBe('Kitchen reno');
    expect(typeof pending.projectId).toBe('string');
  });

  it('Everything Else does not get a Break down button (not a real project)', () => {
    renderTool();
    expect(screen.queryByRole('button', { name: 'Break down project Everything Else' })).not.toBeInTheDocument();
  });

  it('an empty project can be turned into a task in Everything Else', () => {
    renderTool();
    addProject('Kitchen reno');

    fireEvent.click(screen.getByLabelText('Turn project "Kitchen reno" into a task'));

    expect(screen.queryByText('Kitchen reno', { selector: '.task-group-name' })).not.toBeInTheDocument();
    expect(within(group('Everything Else')).getByText('Kitchen reno')).toBeInTheDocument();
    const item = within(group('Everything Else')).getByText('Kitchen reno').closest('li') as HTMLElement;
    expect(within(item).getByLabelText('Size: small')).toBeInTheDocument();
  });

  it('a project with tasks in it does not offer the turn-into-a-task button', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    expect(screen.queryByLabelText('Turn project "Kitchen reno" into a task')).not.toBeInTheDocument();
  });

  it('a standalone task can be turned into its own project', () => {
    renderTool();
    addTaskTo('Everything Else', 'redo the bathroom', 'Later');

    fireEvent.click(screen.getByLabelText('Turn "redo the bathroom" into a project'));

    expect(within(group('Everything Else')).queryByText('redo the bathroom')).not.toBeInTheDocument();
    expect(screen.getByText('redo the bathroom', { selector: '.task-group-name' })).toBeInTheDocument();
    // The new project starts expanded, same as one created via the New project form.
    expect(screen.getByRole('button', { name: 'Collapse redo the bathroom' })).toBeInTheDocument();
  });

  it('a task already inside a project can also be turned into its own project', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    fireEvent.click(screen.getByLabelText('Turn "grout tiles" into a project'));

    expect(within(group('Kitchen reno')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(screen.getByText('grout tiles', { selector: '.task-group-name' })).toBeInTheDocument();
  });
});
