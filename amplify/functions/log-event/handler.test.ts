// @vitest-environment node
//
// Pure Node logic, no DOM — this function has no Anthropic SDK dependency at all, but
// kept consistent with ai-assist/handler.test.ts's environment override on principle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './handler';

function invoke(input: string) {
  // Only `event.arguments.input` is read by the handler — the rest of the Lambda event
  // shape isn't relevant to these tests.
  return handler({ arguments: { input } } as Parameters<typeof handler>[0], {} as never, undefined as never);
}

describe('log-event handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs a structured line for a well-formed usage payload and returns ok', async () => {
    const payload = { toolId: 'tone-checker', event: 'ai_call', spoons: 70, detail: { success: true } };
    const result = await invoke(JSON.stringify(payload));

    expect(result).toBe('ok');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({ type: 'usage', ...payload });
  });

  it('falls back to a raw line instead of throwing when the payload is not JSON', async () => {
    const result = await invoke('not valid json{{{');

    expect(result).toBe('ok');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      type: 'usage',
      raw: 'not valid json{{{',
    });
  });
});
