import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAiTool } from '../../lib/aiClient';
import { captureImageForUpload } from '../../lib/imageCapture';
import {
  cleanupAiTool,
  pendingResponse,
  renderAiTool,
  resetAiToolMocks,
  sentPayload,
} from '../../test-utils/aiTool';
import { toneCheckerTool } from './index';

vi.mock('../../lib/aiClient', () => ({ runAiTool: vi.fn() }));
vi.mock('../../lib/usageLog', () => ({
  sendUsageEvent: vi.fn(),
  summarizeInputForLogging: () => ({}),
}));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));
vi.mock('../../lib/imageCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/imageCapture')>()),
  captureImageForUpload: vi.fn(),
}));

const SCREENSHOT_ERROR = /couldn't read that screenshot/i;
const screenshot = new File(['fake'], 'chat.png', { type: 'image/png' });

const messageBox = () => screen.getByPlaceholderText(/paste your message here/i);
const contextBox = () => screen.getByPlaceholderText(/who this is going to/i);
const submitButton = () => screen.getByRole('button', { name: /check tone|checking/i });

function typeMessage(text: string) {
  fireEvent.change(messageBox(), { target: { value: text } });
}

function submit(text = 'Fine, whatever.') {
  typeMessage(text);
  fireEvent.click(submitButton());
}

function uploadScreenshot(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [screenshot] } });
}

describe('ToneChecker', () => {
  beforeEach(() => {
    resetAiToolMocks();
    vi.mocked(captureImageForUpload)
      .mockReset()
      .mockResolvedValue({ base64: 'ZmFrZQ==', mediaType: 'image/jpeg' });
  });

  afterEach(cleanupAiTool);

  it('keeps submit disabled until there is a real message', () => {
    renderAiTool(toneCheckerTool.Component);
    expect(submitButton()).toBeDisabled();

    typeMessage('   ');
    expect(submitButton()).toBeDisabled();

    typeMessage('Hello');
    expect(submitButton()).not.toBeDisabled();
  });

  it('sends the trimmed message and context to the tone-checker tool', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Tone: Curt');
    renderAiTool(toneCheckerTool.Component);

    fireEvent.change(contextBox(), { target: { value: '  to my boss ' } });
    submit('  Fine, whatever.  ');
    await screen.findByText('Curt');

    expect(vi.mocked(runAiTool).mock.calls[0][0]).toBe('tone-checker');
    expect(sentPayload()).toEqual({ message: 'Fine, whatever.', context: 'to my boss' });
  });

  it('shows the three result fields', async () => {
    vi.mocked(runAiTool).mockResolvedValue(
      'Tone: Curt\nLikely to land as: A bit annoyed\nSuggestion: Add a thank you',
    );
    renderAiTool(toneCheckerTool.Component);

    submit();

    expect(await screen.findByText('Curt')).toBeInTheDocument();
    expect(screen.getByText('Likely to land as')).toBeInTheDocument();
    expect(screen.getByText('A bit annoyed')).toBeInTheDocument();
    expect(screen.getByText('Add a thank you')).toBeInTheDocument();
  });

  it('shows only the fields the answer contained', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Tone: Curt');
    renderAiTool(toneCheckerTool.Component);

    submit();

    await screen.findByText('Curt');
    expect(screen.queryByText('Suggestion')).not.toBeInTheDocument();
  });

  it('shows the plain answer when it has no recognisable fields', async () => {
    vi.mocked(runAiTool).mockResolvedValue('It reads as fairly neutral to me.');
    renderAiTool(toneCheckerTool.Component);

    submit();

    expect(await screen.findByText('It reads as fairly neutral to me.')).toBeInTheDocument();
  });

  it('shows the error when the request fails', async () => {
    vi.mocked(runAiTool).mockRejectedValue(new Error('Not Authorized'));
    renderAiTool(toneCheckerTool.Component);

    submit();

    expect(await screen.findByText('Not Authorized')).toHaveClass('tool-error');
  });

  it('shows progress and locks the form while checking', async () => {
    const finish = pendingResponse();
    renderAiTool(toneCheckerTool.Component);

    submit();

    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(messageBox()).toBeDisabled();

    await act(async () => finish('Tone: Curt'));
    expect(screen.getByRole('button', { name: 'Check tone' })).not.toBeDisabled();
  });

  describe('screenshots', () => {
    it('puts the text from an uploaded screenshot in the message box, without checking it yet', async () => {
      vi.mocked(runAiTool).mockResolvedValue('Me: Are we still on?');
      const { container } = renderAiTool(toneCheckerTool.Component);

      uploadScreenshot(container);

      await waitFor(() => expect(messageBox()).toHaveValue('Me: Are we still on?'));
      expect(vi.mocked(runAiTool)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(runAiTool).mock.calls[0][0]).toBe('screenshot-to-text');
      expect(sentPayload()).toEqual({ imageBase64: 'ZmFrZQ==', mediaType: 'image/jpeg' });
    });

    it('reads a screenshot pasted into the message box', async () => {
      vi.mocked(runAiTool).mockResolvedValue('Them: See you at 5');
      renderAiTool(toneCheckerTool.Component);

      fireEvent.paste(messageBox(), {
        clipboardData: { items: [{ type: 'image/png', getAsFile: () => screenshot }] },
      });

      await waitFor(() => expect(messageBox()).toHaveValue('Them: See you at 5'));
    });

    it('leaves an ordinary text paste alone', () => {
      renderAiTool(toneCheckerTool.Component);

      fireEvent.paste(messageBox(), {
        clipboardData: { items: [{ type: 'text/plain', getAsFile: () => null }] },
      });

      expect(captureImageForUpload).not.toHaveBeenCalled();
      expect(runAiTool).not.toHaveBeenCalled();
    });

    it('explains when the image cannot be processed', async () => {
      vi.mocked(captureImageForUpload).mockRejectedValue(new Error('bad image'));
      const { container } = renderAiTool(toneCheckerTool.Component);

      uploadScreenshot(container);

      expect(await screen.findByText(SCREENSHOT_ERROR)).toBeInTheDocument();
      expect(runAiTool).not.toHaveBeenCalled();
    });

    it('explains when reading the screenshot fails', async () => {
      vi.mocked(runAiTool).mockRejectedValue(new Error('Network error'));
      const { container } = renderAiTool(toneCheckerTool.Component);

      uploadScreenshot(container);

      expect(await screen.findByText(SCREENSHOT_ERROR)).toBeInTheDocument();
    });

    it('explains when the screenshot has no readable text', async () => {
      vi.mocked(runAiTool).mockResolvedValue('');
      const { container } = renderAiTool(toneCheckerTool.Component);

      uploadScreenshot(container);

      expect(await screen.findByText(SCREENSHOT_ERROR)).toBeInTheDocument();
    });
  });
});
