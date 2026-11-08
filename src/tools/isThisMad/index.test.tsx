import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAiTool } from '../../lib/aiClient';
import {
  cleanupAiTool,
  pendingResponse,
  renderAiTool,
  resetAiToolMocks,
  sentPayload,
} from '../../test-utils/aiTool';
import { isThisMadTool } from './index';

vi.mock('../../lib/aiClient', () => ({ runAiTool: vi.fn() }));
vi.mock('../../lib/usageLog', () => ({
  sendUsageEvent: vi.fn(),
  summarizeInputForLogging: () => ({}),
}));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));

const READ = `Tone: Busy
Most likely meaning: They need the report today.
Reassurance: Short doesn't mean cold.
Asks:
- Send the report
- Confirm the date`;

const messageBox = () => screen.getByPlaceholderText(/message you received/i);
const contextBox = () => screen.getByPlaceholderText(/who sent it/i);
const submitButton = () => screen.getByRole('button', { name: /get a calm read|reading/i });

function typeMessage(text: string) {
  fireEvent.change(messageBox(), { target: { value: text } });
}

function submit(text = 'We need to talk.') {
  typeMessage(text);
  fireEvent.click(submitButton());
}

describe('IsThisMad', () => {
  beforeEach(resetAiToolMocks);
  afterEach(cleanupAiTool);

  it('keeps submit disabled until there is a real message', () => {
    renderAiTool(isThisMadTool.Component);
    expect(submitButton()).toBeDisabled();

    typeMessage('   ');
    expect(submitButton()).toBeDisabled();

    typeMessage('Call me');
    expect(submitButton()).not.toBeDisabled();
  });

  it('sends the trimmed message and context to the is-this-mad tool', async () => {
    vi.mocked(runAiTool).mockResolvedValue(READ);
    renderAiTool(isThisMadTool.Component);

    fireEvent.change(contextBox(), { target: { value: ' from my manager ' } });
    submit('  We need to talk.  ');
    await screen.findByText('Busy');

    expect(vi.mocked(runAiTool).mock.calls[0][0]).toBe('is-this-mad');
    expect(sentPayload()).toEqual({ message: 'We need to talk.', context: 'from my manager' });
  });

  it('shows the tone, meaning, reassurance, and each ask', async () => {
    vi.mocked(runAiTool).mockResolvedValue(READ);
    renderAiTool(isThisMadTool.Component);

    submit();

    expect(await screen.findByText('Busy')).toBeInTheDocument();
    expect(screen.getByText('They need the report today.')).toBeInTheDocument();
    expect(screen.getByText("Short doesn't mean cold.")).toBeInTheDocument();
    expect(screen.getByText('Asks')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Send the report',
      'Confirm the date',
    ]);
  });

  it('leaves out the Asks section when there are none', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Tone: Friendly\nAsks:');
    renderAiTool(isThisMadTool.Component);

    submit();

    await screen.findByText('Friendly');
    expect(screen.queryByText('Asks')).not.toBeInTheDocument();
  });

  it('shows the plain answer when it has no recognisable fields', async () => {
    vi.mocked(runAiTool).mockResolvedValue('They seem perfectly fine.');
    renderAiTool(isThisMadTool.Component);

    submit();

    expect(await screen.findByText('They seem perfectly fine.')).toBeInTheDocument();
  });

  it('shows the error when the request fails', async () => {
    vi.mocked(runAiTool).mockRejectedValue(new Error('Not Authorized'));
    renderAiTool(isThisMadTool.Component);

    submit();

    expect(await screen.findByText('Not Authorized')).toHaveClass('tool-error');
  });

  it('shows progress and locks the form while reading', async () => {
    const finish = pendingResponse();
    renderAiTool(isThisMadTool.Component);

    submit();

    expect(await screen.findByRole('button', { name: 'Reading…' })).toBeDisabled();
    expect(messageBox()).toBeDisabled();

    await act(async () => finish(READ));
    expect(screen.getByRole('button', { name: 'Get a calm read' })).not.toBeDisabled();
  });
});
