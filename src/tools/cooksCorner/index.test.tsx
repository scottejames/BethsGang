import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { EnergyProvider } from '../../context/EnergyContext';
import { TaskStoreProvider } from '../../context/TaskStoreContext';
import { ToolNavigationProvider } from '../../context/ToolNavigationContext';
import { runAiTool } from '../../lib/aiClient';
import { cooksCornerTool } from './index';

vi.mock('../../hooks/useUsageLog', () => ({
  useUsageLog: () => vi.fn(),
}));

vi.mock('../../lib/aiClient', () => ({
  runAiTool: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const Component = cooksCornerTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <TaskStoreProvider>
          <ToolNavigationProvider>{children}</ToolNavigationProvider>
        </TaskStoreProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}

function renderTool() {
  return render(<Component />, { wrapper });
}

const MEAL_IDEAS =
  '1. Chicken Piccata — chicken pan-fried with a caper butter sauce, served with mash (Shop: cream)\n' +
  '2. Potato and Caper Hash — crispy potatoes with fried capers and grated cheese';

const RECIPE =
  'Recipe: Chicken Piccata\n' +
  'Ingredients:\n' +
  '- 2 chicken breasts\n' +
  '- 2 tbsp capers\n' +
  '- 100ml cream\n' +
  'Method:\n' +
  '1. Pan-fry the chicken until golden.\n' +
  '2. Add the capers and cream, simmer briefly.\n' +
  'Shop: cream';

describe('CooksCorner', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    window.localStorage.removeItem('beths-gang:energy-spoons');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(runAiTool).mockReset();
  });

  afterEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    window.localStorage.removeItem('beths-gang:energy-spoons');
  });

  it('disables submit until the fridge contents field has content', () => {
    renderTool();
    const submit = screen.getByRole('button', { name: 'Suggest meals' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. cheese, capers, potatoes, chicken'), {
      target: { value: 'cheese, capers, potatoes, chicken' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('sends just the fridge contents on the first request', async () => {
    vi.mocked(runAiTool).mockResolvedValue(MEAL_IDEAS);
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. cheese, capers, potatoes, chicken'), {
      target: { value: 'cheese, capers, potatoes, chicken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest meals' }));
    await screen.findByText(/Chicken Piccata/);

    const [, envelope] = vi.mocked(runAiTool).mock.calls[0];
    const { input } = JSON.parse(envelope);
    expect(JSON.parse(input)).toEqual({ fridgeItems: 'cheese, capers, potatoes, chicken' });
  });

  it('renders meal ideas with the name, description, and optional shop note', async () => {
    vi.mocked(runAiTool).mockResolvedValue(MEAL_IDEAS);
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. cheese, capers, potatoes, chicken'), {
      target: { value: 'cheese, capers, potatoes, chicken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest meals' }));
    await screen.findByText(/Chicken Piccata/);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Chicken Piccata — chicken pan-fried with a caper butter sauce, served with mash (Shop: cream)',
    );
    expect(items[1]).toHaveTextContent(
      'Potato and Caper Hash — crispy potatoes with fried capers and grated cheese',
    );
  });

  it('sends the current meal ideas and feedback on an update, then clears the feedback field', async () => {
    vi.mocked(runAiTool).mockResolvedValueOnce(MEAL_IDEAS).mockResolvedValueOnce(RECIPE);
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. cheese, capers, potatoes, chicken'), {
      target: { value: 'cheese, capers, potatoes, chicken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest meals' }));
    await screen.findByText(/Chicken Piccata/);

    fireEvent.change(screen.getByPlaceholderText(/chicken piccata sounds good/i), {
      target: { value: 'The chicken piccata sounds good, let\'s do that' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update with feedback' }));

    await screen.findByRole('heading', { name: 'Chicken Piccata' });

    const [, secondEnvelope] = vi.mocked(runAiTool).mock.calls[1];
    const { input } = JSON.parse(secondEnvelope);
    const payload = JSON.parse(input);
    expect(payload.fridgeItems).toBe('cheese, capers, potatoes, chicken');
    expect(payload.currentMealIdeas).toBe(MEAL_IDEAS);
    expect(payload.feedback).toBe('The chicken piccata sounds good, let\'s do that');
    expect(screen.getByPlaceholderText(/chicken piccata sounds good/i)).toHaveValue('');
  });

  it('renders an elaborated recipe with ingredients, method, and shop note', async () => {
    vi.mocked(runAiTool).mockResolvedValueOnce(MEAL_IDEAS).mockResolvedValueOnce(RECIPE);
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. cheese, capers, potatoes, chicken'), {
      target: { value: 'cheese, capers, potatoes, chicken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest meals' }));
    await screen.findByText(/Chicken Piccata/);

    fireEvent.change(screen.getByPlaceholderText(/chicken piccata sounds good/i), {
      target: { value: 'The chicken piccata sounds good' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update with feedback' }));

    await screen.findByRole('heading', { name: 'Chicken Piccata' });
    expect(screen.getByText('2 chicken breasts')).toBeInTheDocument();
    expect(screen.getByText('Pan-fry the chicken until golden.')).toBeInTheDocument();
    expect(screen.getByText('cream')).toBeInTheDocument();
  });
});
