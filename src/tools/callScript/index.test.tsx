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
import { callScriptTool } from './index';

vi.mock('../../lib/aiClient', () => ({ runAiTool: vi.fn() }));
vi.mock('../../lib/usageLog', () => ({
  sendUsageEvent: vi.fn(),
  summarizeInputForLogging: () => ({}),
}));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));

const SCRIPT = `Opening: Hi, it's Sam calling about my appointment.
Main point: I'd like to move it to next week.
If they ask more: Any afternoon works.
Closing: Thanks for your help, bye.`;

const purposeBox = () => screen.getByPlaceholderText(/reschedule my dentist/i);
const submitButton = () => screen.getByRole('button', { name: /write my script|writing script/i });

function typePurpose(text: string) {
  fireEvent.change(purposeBox(), { target: { value: text } });
}

function submit(text = 'Move my dentist appointment') {
  typePurpose(text);
  fireEvent.click(submitButton());
}

describe('CallScript', () => {
  beforeEach(resetAiToolMocks);
  afterEach(cleanupAiTool);

  it('keeps submit disabled until the call is described', () => {
    renderAiTool(callScriptTool.Component);
    expect(submitButton()).toBeDisabled();

    typePurpose('   ');
    expect(submitButton()).toBeDisabled();

    typePurpose('Call the dentist');
    expect(submitButton()).not.toBeDisabled();
  });

  it('sends the default tone when none is chosen', async () => {
    vi.mocked(runAiTool).mockResolvedValue(SCRIPT);
    renderAiTool(callScriptTool.Component);

    submit('  Move my appointment  ');
    await screen.findByText(/any afternoon works/i);

    expect(vi.mocked(runAiTool).mock.calls[0][0]).toBe('call-script');
    expect(sentPayload()).toEqual({ message: 'Move my appointment', tone: 'neutral', about: '' });
  });

  it('sends the chosen tone and who is being called', async () => {
    vi.mocked(runAiTool).mockResolvedValue(SCRIPT);
    renderAiTool(callScriptTool.Component);

    fireEvent.change(screen.getByLabelText('Tone'), { target: { value: 'formal' } });
    fireEvent.change(screen.getByLabelText('Who are you calling? (optional)'), {
      target: { value: ' my landlord ' },
    });
    submit();
    await screen.findByText(/any afternoon works/i);

    expect(sentPayload()).toMatchObject({ tone: 'formal', about: 'my landlord' });
  });

  it('shows all four parts of the script', async () => {
    vi.mocked(runAiTool).mockResolvedValue(SCRIPT);
    renderAiTool(callScriptTool.Component);

    submit();

    expect(await screen.findByText("Hi, it's Sam calling about my appointment.")).toBeInTheDocument();
    expect(screen.getByText("I'd like to move it to next week.")).toBeInTheDocument();
    expect(screen.getByText('Any afternoon works.')).toBeInTheDocument();
    expect(screen.getByText('Thanks for your help, bye.')).toBeInTheDocument();
    for (const label of ['Opening', 'Main point', 'If they ask more', 'Closing']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the plain answer when it has no recognisable parts', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Just tell them you need to move it.');
    renderAiTool(callScriptTool.Component);

    submit();

    expect(await screen.findByText('Just tell them you need to move it.')).toBeInTheDocument();
    expect(screen.queryByText('Opening')).not.toBeInTheDocument();
  });

  it('shows the error when the request fails', async () => {
    vi.mocked(runAiTool).mockRejectedValue(new Error('Not Authorized'));
    renderAiTool(callScriptTool.Component);

    submit();

    expect(await screen.findByText('Not Authorized')).toHaveClass('tool-error');
  });

  it('shows progress and locks the form while writing', async () => {
    const finish = pendingResponse();
    renderAiTool(callScriptTool.Component);

    submit();

    expect(await screen.findByRole('button', { name: 'Writing script…' })).toBeDisabled();
    expect(purposeBox()).toBeDisabled();

    await act(async () => finish(SCRIPT));
    expect(screen.getByRole('button', { name: 'Write my script' })).not.toBeDisabled();
  });
});
