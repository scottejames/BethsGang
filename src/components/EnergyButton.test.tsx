import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../context/AuthContext';
import { EnergyProvider } from '../context/EnergyContext';
import { EnergyButton } from './EnergyButton';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));

const STORAGE_KEY = 'beths-gang:energy-spoons';

async function renderButton() {
  const view = render(
    <AuthProvider>
      <EnergyProvider>
        <EnergyButton />
      </EnergyProvider>
    </AuthProvider>,
  );
  // Lets the sign-in check finish, as it would before anyone could touch the screen.
  await act(async () => {});
  return view;
}

const energyButton = () => screen.getByRole('button', { name: /energy level/i });
const slider = () => screen.getByRole('slider', { name: /energy level/i });
const setSlider = (value: number) => fireEvent.change(slider(), { target: { value: String(value) } });

describe('EnergyButton', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('shows the current spoons', async () => {
    await renderButton();

    expect(energyButton()).toHaveTextContent('70');
    expect(energyButton()).toHaveAccessibleName('Energy level: 70 out of 100 spoons. Click to change.');
  });

  it('is closed until clicked', async () => {
    await renderButton();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(energyButton());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('updates the button as the slider moves', async () => {
    await renderButton();
    fireEvent.click(energyButton());

    setSlider(25);

    expect(energyButton()).toHaveTextContent('25');
    expect(screen.getByText(/— 25\/100/)).toBeInTheDocument();
  });

  it.each([
    [0, /^running on fumes/i],
    [10, /^running on fumes/i],
    [11, /^running low/i],
    [30, /^running low/i],
    [31, /^getting there/i],
    [60, /^getting there/i],
    [61, /^feeling good/i],
    [85, /^feeling good/i],
    [86, /^fully loaded/i],
    [100, /^fully loaded/i],
  ])('at %i spoons shows the right caption', async (spoons, caption) => {
    await renderButton();
    fireEvent.click(energyButton());

    setSlider(spoons);

    expect(screen.getByText(caption)).toBeInTheDocument();
  });

  it('fills one spoon picture per ten spoons', async () => {
    const { container } = await renderButton();
    fireEvent.click(energyButton());

    setSlider(40);

    expect(container.querySelectorAll('.spoon-filled')).toHaveLength(4);
    expect(container.querySelectorAll('.spoon-empty')).toHaveLength(6);
  });

  it('closes with Done and keeps the new value', async () => {
    await renderButton();
    fireEvent.click(energyButton());
    setSlider(15);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(energyButton()).toHaveTextContent('15');
  });
});
