import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAiTool } from '../../lib/aiClient';
import {
  cleanupAiTool,
  pendingResponse,
  renderAiTool,
  resetAiToolMocks,
  sentPayload,
} from '../../test-utils/aiTool';
import { replyStarterTool } from './index';

vi.mock('../../lib/aiClient', () => ({ runAiTool: vi.fn() }));
vi.mock('../../lib/usageLog', () => ({
  sendUsageEvent: vi.fn(),
  summarizeInputForLogging: () => ({}),
}));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));

const DRAFTS = '1. Sounds good, thanks!\n2. Can do.\n3. Yes, works for me.';

const messageBox = () => screen.getByPlaceholderText(/message you need to reply to/i);
const submitButton = () => screen.getByRole('button', { name: /get reply drafts|drafting/i });

function typeMessage(text: string) {
  fireEvent.change(messageBox(), { target: { value: text } });
}

function submit(text = 'Are you free on Friday?') {
  typeMessage(text);
  fireEvent.click(submitButton());
}

describe('ReplyStarter', () => {
  beforeEach(resetAiToolMocks);
  afterEach(cleanupAiTool);

  it('keeps submit disabled until there is a real message', () => {
    renderAiTool(replyStarterTool.Component);
    expect(submitButton()).toBeDisabled();

    typeMessage('   ');
    expect(submitButton()).toBeDisabled();

    typeMessage('Hello');
    expect(submitButton()).not.toBeDisabled();
  });

  it('sends the default tone and length when none are chosen', async () => {
    vi.mocked(runAiTool).mockResolvedValue(DRAFTS);
    renderAiTool(replyStarterTool.Component);

    submit('  Are you free?  ');
    await screen.findByText('Can do.');

    expect(vi.mocked(runAiTool).mock.calls[0][0]).toBe('reply-starter');
    expect(sentPayload()).toEqual({
      message: 'Are you free?',
      tone: 'neutral',
      verbosity: 'medium',
      intent: '',
    });
  });

  it('sends the chosen tone, length, and intent', async () => {
    vi.mocked(runAiTool).mockResolvedValue(DRAFTS);
    renderAiTool(replyStarterTool.Component);

    fireEvent.change(screen.getByLabelText('Tone'), { target: { value: 'friendly' } });
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Intent (optional)'), {
      target: { value: ' politely decline ' },
    });
    submit();
    await screen.findByText('Can do.');

    expect(sentPayload()).toMatchObject({
      tone: 'friendly',
      verbosity: 'short',
      intent: 'politely decline',
    });
  });

  it('lists each draft without its number', async () => {
    vi.mocked(runAiTool).mockResolvedValue(DRAFTS);
    renderAiTool(replyStarterTool.Component);

    submit();

    expect(await screen.findByText('Sounds good, thanks!')).toBeInTheDocument();
    expect(screen.getByText('Can do.')).toBeInTheDocument();
    expect(screen.getByText('Yes, works for me.')).toBeInTheDocument();
  });

  it('still shows an answer that is not numbered', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Just say yes.');
    renderAiTool(replyStarterTool.Component);

    submit();

    expect(await screen.findByText('Just say yes.')).toBeInTheDocument();
  });

  it('copies one draft and marks only that one as copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.mocked(runAiTool).mockResolvedValue(DRAFTS);
    renderAiTool(replyStarterTool.Component);

    submit();
    const draft = (await screen.findByText('Can do.')).closest('li') as HTMLElement;

    await act(async () => {
      fireEvent.click(within(draft).getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('Can do.');
    expect(within(draft).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('shows the error when the request fails', async () => {
    vi.mocked(runAiTool).mockRejectedValue(new Error('Not Authorized'));
    renderAiTool(replyStarterTool.Component);

    submit();

    expect(await screen.findByText('Not Authorized')).toHaveClass('tool-error');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows progress and locks the form while drafting', async () => {
    const finish = pendingResponse();
    renderAiTool(replyStarterTool.Component);

    submit();

    expect(await screen.findByRole('button', { name: 'Drafting…' })).toBeDisabled();
    expect(messageBox()).toBeDisabled();

    await act(async () => finish(DRAFTS));
    expect(screen.getByRole('button', { name: 'Get reply drafts' })).not.toBeDisabled();
  });
});
