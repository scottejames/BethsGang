import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { essayPhraseBankTool } from './index';

const Component = essayPhraseBankTool.Component;

describe('EssayPhraseBank', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the first category by default', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: 'Opening the essay', pressed: true })).toBeInTheDocument();
    expect(screen.getByText(/this essay examines/i)).toBeInTheDocument();
  });

  it('switches category when another category button is clicked', () => {
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: 'Being critical' }));

    expect(screen.getByRole('button', { name: 'Being critical', pressed: true })).toBeInTheDocument();
    expect(screen.queryByText(/this essay examines/i)).not.toBeInTheDocument();
    expect(screen.getByText(/this argument has been criticised/i)).toBeInTheDocument();
  });

  it('searches across every category, hiding the category buttons while searching', () => {
    render(<Component />);
    fireEvent.change(screen.getByLabelText('Search phrases'), { target: { value: 'conclusion' } });

    expect(screen.queryByRole('button', { name: 'Opening the essay' })).not.toBeInTheDocument();
    expect(screen.getByText(/this essay has shown that/i)).toBeInTheDocument();
  });

  it('shows a no-results message when nothing matches the search', () => {
    render(<Component />);
    fireEvent.change(screen.getByLabelText('Search phrases'), { target: { value: 'xyzzy' } });

    expect(screen.getByText(/no phrases match "xyzzy"/i)).toBeInTheDocument();
  });

  it('copies a phrase to the clipboard', async () => {
    render(<Component />);
    const [copyButton] = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('This essay examines'));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
