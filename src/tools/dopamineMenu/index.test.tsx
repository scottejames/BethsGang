import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dopamineMenuTool } from './index';

const Component = dopamineMenuTool.Component;
const STORAGE_KEY = 'beths-gang:dopamine-items';

describe('DopamineMenu', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('seeds default items on first load', () => {
    render(<Component />);
    expect(screen.getByText('Stretch for 2 minutes')).toBeInTheDocument();
    expect(screen.getByText('Make a hot drink')).toBeInTheDocument();
  });

  it('adds a new item and persists it to localStorage', () => {
    render(<Component />);

    fireEvent.change(screen.getByLabelText('New menu item'), { target: { value: 'Feed the cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Feed the cat')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored.some((item: { text: string }) => item.text === 'Feed the cat')).toBe(true);
  });

  it('deletes an item', () => {
    render(<Component />);
    fireEvent.click(screen.getByLabelText('Delete "Make a hot drink"'));
    expect(screen.queryByText('Make a hot drink')).not.toBeInTheDocument();
  });

  it('respects a deliberately emptied list rather than reseeding defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    render(<Component />);
    expect(screen.queryByText('Stretch for 2 minutes')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing on the menu yet/i)).toBeInTheDocument();
  });

  it('reveals an item from the list when Surprise me is clicked', () => {
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
    const items = screen.getAllByRole('listitem');
    const firstItemText = items[0].querySelector('.dopamine-item-text')?.textContent ?? '';
    const secondItemText = items[1].querySelector('.dopamine-item-text')?.textContent ?? '';

    fireEvent.click(screen.getByLabelText(`Move "${firstItemText}" down`));

    const reordered = screen.getAllByRole('listitem');
    expect(reordered[0].querySelector('.dopamine-item-text')?.textContent).toBe(secondItemText);
    expect(reordered[1].querySelector('.dopamine-item-text')?.textContent).toBe(firstItemText);
  });
});
