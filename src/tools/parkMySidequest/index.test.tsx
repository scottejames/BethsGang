import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TaskStoreProvider } from '../../context/TaskStoreContext';
import { ToolNavigationProvider, useToolNavigation } from '../../context/ToolNavigationContext';
import { parkMySidequestTool } from './index';

// ToolNavigationProvider logs usage via useUsageLog, which needs EnergyContext —
// mocked out here since this file is only testing Sidequest's own behavior.
vi.mock('../../hooks/useUsageLog', () => ({
  useUsageLog: () => vi.fn(),
}));

const Component = parkMySidequestTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <TaskStoreProvider>
      <ToolNavigationProvider>{children}</ToolNavigationProvider>
    </TaskStoreProvider>
  );
}

// Sidequest's "Break down" button acts entirely through ToolNavigationContext (sets
// pendingBreakdownRequest, then navigates) — this app has no router, so there's no
// visible change within Sidequest's own render to assert on. This spy, mounted
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

function addTaskTo(groupName: string, title: string, category?: 'Now' | 'Later' | 'Not Your Problem') {
  const scope = within(group(groupName));
  fireEvent.change(scope.getByPlaceholderText('What needs parking?'), { target: { value: title } });
  if (category) {
    fireEvent.change(scope.getByLabelText('Category'), { target: { value: categoryValue(category) } });
  }
  fireEvent.click(scope.getByRole('button', { name: 'Park it' }));
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

describe('ParkMySidequest', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
  });

  afterEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
  });

  it('always shows a Parking Lot group for standalone tasks, expanded by default', () => {
    renderTool();
    expect(screen.getByText('Parking Lot', { selector: '.task-group-name' })).toBeInTheDocument();

    addTaskTo('Parking Lot', 'water the plants', 'Now');
    expect(within(group('Parking Lot')).getByText('water the plants')).toBeInTheDocument();
  });

  it('always lists Parking Lot first, ahead of every project', () => {
    renderTool();
    addProject('Kitchen reno');
    addProject('Side hustle');

    const names = screen.getAllByText(/.+/, { selector: '.task-group-name' }).map((el) => el.textContent);
    expect(names).toEqual(['Parking Lot', 'Kitchen reno', 'Side hustle']);
  });

  it('adding a task from inside a project group ties it to that project, not Parking Lot', () => {
    renderTool();
    addProject('Kitchen reno');

    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    expect(within(group('Kitchen reno')).getByText('grout tiles')).toBeInTheDocument();
    expect(within(group('Parking Lot')).queryByText('grout tiles')).not.toBeInTheDocument();
  });

  it('re-triages a task to a different category via its tag select', () => {
    renderTool();
    addTaskTo('Parking Lot', 'call the dentist', 'Later');

    const item = within(group('Parking Lot')).getByText('call the dentist').closest('li') as HTMLElement;
    const select = within(item).getByLabelText(/move .* to a different category/i) as HTMLSelectElement;
    expect(select.value).toBe('later');

    fireEvent.change(select, { target: { value: 'now' } });
    expect(select.value).toBe('now');
  });

  it('deletes a task', () => {
    renderTool();
    addTaskTo('Parking Lot', 'cancel gym membership', 'Now');

    const item = within(group('Parking Lot')).getByText('cancel gym membership').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Delete' }));

    expect(within(group('Parking Lot')).queryByText('cancel gym membership')).not.toBeInTheDocument();
    expect(within(group('Parking Lot')).getByText('Nothing here.')).toBeInTheDocument();
  });

  it('deleting a project moves its tasks into Parking Lot instead of losing them', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    fireEvent.click(screen.getByRole('button', { name: 'Delete project Kitchen reno' }));

    expect(screen.queryByText('Kitchen reno', { selector: '.task-group-name' })).not.toBeInTheDocument();
    expect(within(group('Parking Lot')).getByText('grout tiles')).toBeInTheDocument();
  });

  it('marking a task done strikes it through and sinks it to the bottom of its group', () => {
    renderTool();
    addTaskTo('Parking Lot', 'first task', 'Now');
    addTaskTo('Parking Lot', 'second task', 'Now');

    const firstItem = within(group('Parking Lot')).getByText('first task').closest('li') as HTMLElement;
    fireEvent.click(within(firstItem).getByRole('checkbox'));

    const items = within(group('Parking Lot')).getAllByRole('listitem');
    expect(items[items.length - 1]).toHaveTextContent('first task');
    expect(firstItem.className).toContain('task-item-done');
  });

  it('collapsing a group hides its tasks and add-task row; expanding shows them again', () => {
    renderTool();
    addProject('Kitchen reno');
    addTaskTo('Kitchen reno', 'grout tiles', 'Later');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Kitchen reno' }));

    expect(within(group('Kitchen reno')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(within(group('Kitchen reno')).queryByPlaceholderText('What needs parking?')).not.toBeInTheDocument();

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
    addTaskTo('Parking Lot', 'water the plants', 'Now');

    const item = within(group('Parking Lot')).getByText('water the plants').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit "water the plants"' }));

    const editForm = within(item).getByLabelText('Edit task title').closest('form') as HTMLElement;
    fireEvent.change(within(editForm).getByLabelText('Edit task title'), { target: { value: 'water the office plants' } });
    fireEvent.click(within(editForm).getByLabelText('Large'));
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    const updatedItem = within(group('Parking Lot')).getByText('water the office plants').closest('li') as HTMLElement;
    expect(within(updatedItem).getByLabelText('Size: large')).toBeInTheDocument();
  });

  it('moves a task to a different project via the edit form, and back to Parking Lot', () => {
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
    selectProjectOption(within(secondEditForm), 'Parking Lot');
    fireEvent.click(within(secondEditForm).getByRole('button', { name: 'Save' }));

    expect(within(group('Side hustle')).queryByText('grout tiles')).not.toBeInTheDocument();
    expect(within(group('Parking Lot')).getByText('grout tiles')).toBeInTheDocument();
  });

  it('cancelling a task edit discards the draft', () => {
    renderTool();
    addTaskTo('Parking Lot', 'water the plants', 'Now');

    const item = within(group('Parking Lot')).getByText('water the plants').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit "water the plants"' }));
    fireEvent.change(within(item).getByLabelText('Edit task title'), { target: { value: 'something else entirely' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Cancel' }));

    expect(within(group('Parking Lot')).getByText('water the plants')).toBeInTheDocument();
    expect(within(group('Parking Lot')).queryByText('something else entirely')).not.toBeInTheDocument();
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

  it('Parking Lot does not get a Break down button (not a real project)', () => {
    renderTool();
    expect(screen.queryByRole('button', { name: 'Break down project Parking Lot' })).not.toBeInTheDocument();
  });
});
