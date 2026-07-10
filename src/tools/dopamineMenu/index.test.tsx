import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dopamineMenuTool } from './index';

const Component = dopamineMenuTool.Component;
const STORAGE_KEY = 'beths-gang:dopamine-items';

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: /edit list/i }));
}

describe('DopamineMenu', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('hides the list by default and shows Surprise me + an Edit list toggle', () => {
    render(<Component />);
    expect(screen.queryByText('Stretch for 2 minutes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /surprise me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit list/i })).toBeInTheDocument();
  });

  it('reveals the seeded default items once Edit list is clicked', () => {
    render(<Component />);
    openEditor();
    expect(screen.getByText('Stretch for 2 minutes')).toBeInTheDocument();
    expect(screen.getByText('Make a hot drink')).toBeInTheDocument();
  });

  it('hides the list again when Done editing is clicked', () => {
    render(<Component />);
    openEditor();
    expect(screen.getByText('Stretch for 2 minutes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /done editing/i }));
    expect(screen.queryByText('Stretch for 2 minutes')).not.toBeInTheDocument();
  });

  it('adds a new item and persists it to localStorage', () => {
    render(<Component />);
    openEditor();

    fireEvent.change(screen.getByLabelText('New menu item'), { target: { value: 'Feed the cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Feed the cat')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored.some((item: { text: string }) => item.text === 'Feed the cat')).toBe(true);
  });

  it('deletes an item', () => {
    render(<Component />);
    openEditor();
    fireEvent.click(screen.getByLabelText('Delete "Make a hot drink"'));
    expect(screen.queryByText('Make a hot drink')).not.toBeInTheDocument();
  });

  it('deleting an item shows an undo toast; Undo restores it, and it is only actually removed once the window elapses unnoticed', () => {
    vi.useFakeTimers();
    try {
      render(<Component />);
      openEditor();
      fireEvent.click(screen.getByLabelText('Delete "Make a hot drink"'));

      expect(screen.queryByText('Make a hot drink')).not.toBeInTheDocument();
      expect(screen.getByText('"Make a hot drink" deleted.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('Make a hot drink')).toBeInTheDocument();
      expect(screen.queryByText('"Make a hot drink" deleted.')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Delete "Make a hot drink"'));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
      expect(stored.some((item: { text: string }) => item.text === 'Make a hot drink')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects a deliberately emptied list rather than reseeding defaults, and forces the editor open', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    render(<Component />);
    // No items to hide, so the add form shows without needing to click Edit list —
    // and there's nothing to toggle either, since an empty list has no editor to hide.
    expect(screen.queryByRole('button', { name: /edit list/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Stretch for 2 minutes')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing on the menu yet/i)).toBeInTheDocument();
  });

  it('reveals an item from the list when Surprise me is clicked, independent of the editor', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: /surprise me/i }));

    const reveal = document.querySelector('.dopamine-reveal-text');
    expect(reveal).toHaveTextContent('Stretch for 2 minutes');
    vi.restoreAllMocks();
  });

  it('does not repeat the same item on a second Surprise me click when another exists', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0); // picks the 1st item first
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: /surprise me/i }));
    expect(document.querySelector('.dopamine-reveal-text')).toHaveTextContent('Stretch for 2 minutes');

    randomSpy.mockReturnValueOnce(0); // would pick the 1st of the *remaining* candidates
    fireEvent.click(screen.getByRole('button', { name: /surprise me/i }));
    expect(document.querySelector('.dopamine-reveal-text')).not.toHaveTextContent('Stretch for 2 minutes');

    randomSpy.mockRestore();
  });

  it('moves an item up and down in the list', () => {
    render(<Component />);
    openEditor();
    const items = screen.getAllByRole('listitem');
    const firstItemText = items[0].querySelector('.dopamine-item-text')?.textContent ?? '';
    const secondItemText = items[1].querySelector('.dopamine-item-text')?.textContent ?? '';

    fireEvent.click(screen.getByLabelText(`Move "${firstItemText}" down`));

    const reordered = screen.getAllByRole('listitem');
    expect(reordered[0].querySelector('.dopamine-item-text')?.textContent).toBe(secondItemText);
    expect(reordered[1].querySelector('.dopamine-item-text')?.textContent).toBe(firstItemText);
  });
});
