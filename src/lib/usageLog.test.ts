import { describe, expect, it } from 'vitest';
import { summarizeInputForLogging } from './usageLog';

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
