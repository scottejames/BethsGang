import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendUsageEvent, summarizeInputForLogging } from './usageLog';

const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({ mutations: { logEvent } }),
}));

describe('summarizeInputForLogging', () => {
  it('keeps short string values as-is (e.g. tone/verbosity choices)', () => {
    const input = JSON.stringify({ tone: 'friendly', verbosity: 'medium' });
    expect(summarizeInputForLogging(input)).toEqual({ tone: 'friendly', verbosity: 'medium' });
  });

  it('reduces a long string value to just its length', () => {
    const message = 'Can you send that over when you get a chance? Thanks so much!';
    const input = JSON.stringify({ message, tone: 'neutral' });

    expect(summarizeInputForLogging(input)).toEqual({
      message: { length: message.length },
      tone: 'neutral',
    });
  });

  it('passes non-string values through unchanged', () => {
    const input = JSON.stringify({ amount: 2, enabled: true, repeat: { kind: 'daily' } });
    expect(summarizeInputForLogging(input)).toEqual({
      amount: 2,
      enabled: true,
      repeat: { kind: 'daily' },
    });
  });

  it('falls back to overall length for a plain (non-JSON) string input', () => {
    const input = 'Sort out my taxes before the deadline';
    expect(summarizeInputForLogging(input)).toEqual({ length: input.length });
  });

  it('falls back to overall length for a JSON array (not the expected object shape)', () => {
    const input = JSON.stringify(['a', 'b', 'c']);
    expect(summarizeInputForLogging(input)).toEqual({ length: input.length });
  });

  it('treats a value at exactly the threshold as short', () => {
    const value = 'a'.repeat(24);
    const input = JSON.stringify({ field: value });
    expect(summarizeInputForLogging(input)).toEqual({ field: value });
  });

  it('treats a value one over the threshold as long', () => {
    const value = 'a'.repeat(25);
    const input = JSON.stringify({ field: value });
    expect(summarizeInputForLogging(input)).toEqual({ field: { length: 25 } });
  });
});

// Telemetry must never be able to break the feature it's attached to.
describe('sendUsageEvent', () => {
  const event = { toolId: 'task-breakdown', event: 'opened' as const };

  beforeEach(() => {
    logEvent.mockReset();
  });

  it('sends the event with a timestamp', () => {
    logEvent.mockResolvedValue({ data: 'ok' });

    sendUsageEvent(event);

    const sent = JSON.parse(logEvent.mock.calls[0][0].input);
    expect(sent).toMatchObject(event);
    expect(new Date(sent.timestamp).getTime()).not.toBeNaN();
  });

  // Regression: logEvent can be missing from the deployed backend straight after a
  // release, which throws immediately and once broke tool navigation.
  it('does not throw when the call itself throws', () => {
    logEvent.mockImplementation(() => {
      throw new TypeError('logEvent is not a function');
    });

    expect(() => sendUsageEvent(event)).not.toThrow();
  });

  it('handles a rejected request, so it cannot become an unhandled error', () => {
    const request = { catch: vi.fn() };
    logEvent.mockReturnValue(request);

    sendUsageEvent(event);

    expect(request.catch).toHaveBeenCalledTimes(1);
  });

  it('copes with a call that returns nothing', () => {
    logEvent.mockReturnValue(undefined);

    expect(() => sendUsageEvent(event)).not.toThrow();
  });
});
