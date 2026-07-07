// @vitest-environment node
//
// Pure Node logic, no DOM — overrides the project's default jsdom environment
// (needed elsewhere for React component tests), since the Anthropic SDK
// refuses to construct in a browser-like (jsdom) global scope.
//
// The Anthropic client is constructed at module scope in handler.ts, so a key
// must exist before it's imported — never a real network call in these tests,
// since we only exercise the pure helper functions below.
process.env.ANTHROPIC_API_KEY = 'test-key-not-real';

import { describe, expect, it } from 'vitest';
import {
  buildCallScriptMessage,
  buildEnergyInstruction,
  buildIsThisMadMessage,
  buildReplyStarterMessage,
  buildToneCheckerMessage,
  parseEnvelope,
} from './handler';

describe('parseEnvelope', () => {
  it('unwraps a plain-string tool payload (e.g. Task Breakdown)', () => {
    const raw = JSON.stringify({ spoons: 15, input: 'Sort out my taxes' });
    expect(parseEnvelope(raw)).toEqual({ spoons: 15, input: 'Sort out my taxes' });
  });

  it('unwraps a double-encoded JSON payload (e.g. Reply Starter) without corrupting it', () => {
    const innerPayload = JSON.stringify({ message: 'hey', tone: 'formal' });
    const raw = JSON.stringify({ spoons: 90, input: innerPayload });

    const result = parseEnvelope(raw);

    expect(result.spoons).toBe(90);
    expect(JSON.parse(result.input)).toEqual({ message: 'hey', tone: 'formal' });
  });

  it('falls back to treating the whole string as input when it is not our envelope shape', () => {
    expect(parseEnvelope('just a plain string, not json at all')).toEqual({
      input: 'just a plain string, not json at all',
    });
  });

  it('falls back gracefully for JSON that is not an envelope (e.g. missing input field)', () => {
    const raw = JSON.stringify({ foo: 'bar' });
    expect(parseEnvelope(raw)).toEqual({ input: raw });
  });
});

describe('buildEnergyInstruction', () => {
  it('returns undefined when no energy level was sent', () => {
    expect(buildEnergyInstruction(undefined)).toBeUndefined();
  });

  it('buckets low/medium/high at the documented boundaries', () => {
    expect(buildEnergyInstruction(0)).toContain('low');
    expect(buildEnergyInstruction(33)).toContain('low');
    expect(buildEnergyInstruction(34)).toContain('medium');
    expect(buildEnergyInstruction(66)).toContain('medium');
    expect(buildEnergyInstruction(67)).toContain('high');
    expect(buildEnergyInstruction(100)).toContain('high');
  });
});

describe('buildReplyStarterMessage', () => {
  it('includes tone, length, and intent when all are provided', () => {
    const raw = JSON.stringify({
      message: 'Can you send the report by Friday?',
      tone: 'formal',
      verbosity: 'short',
      intent: 'ask for one more day',
    });

    const message = buildReplyStarterMessage(raw);

    expect(message).toContain('Can you send the report by Friday?');
    expect(message).toContain('Formal');
    expect(message).toContain('Short');
    expect(message).toContain('ask for one more day');
  });

  it('defaults tone to neutral and length to medium when omitted', () => {
    const raw = JSON.stringify({ message: 'hey wanna grab lunch' });
    const message = buildReplyStarterMessage(raw);

    expect(message).toContain('Neutral');
    expect(message).toContain('Medium');
    expect(message).not.toContain('Desired intent');
  });

  it('falls back to treating a non-JSON string as the raw message', () => {
    const message = buildReplyStarterMessage('just a plain pasted message');
    expect(message).toContain('just a plain pasted message');
  });
});

describe('buildToneCheckerMessage', () => {
  it('includes context when provided', () => {
    const raw = JSON.stringify({
      message: 'Fine. Whatever works.',
      context: 'reply to my manager after a rescheduled meeting',
    });

    const message = buildToneCheckerMessage(raw);

    expect(message).toContain('Fine. Whatever works.');
    expect(message).toContain('reply to my manager after a rescheduled meeting');
  });

  it('omits the context line entirely when context is empty', () => {
    const raw = JSON.stringify({ message: 'Sounds good, talk soon.', context: '' });
    const message = buildToneCheckerMessage(raw);

    expect(message).toContain('Sounds good, talk soon.');
    expect(message).not.toContain('Context for the situation');
  });
});

describe('buildCallScriptMessage', () => {
  it('includes the purpose, tone, and who the call is to when all are provided', () => {
    const raw = JSON.stringify({
      message: 'Reschedule my dentist appointment to a later date',
      tone: 'friendly',
      about: "my dentist's office",
    });

    const message = buildCallScriptMessage(raw);

    expect(message).toContain('Reschedule my dentist appointment to a later date');
    expect(message).toContain('Friendly');
    expect(message).toContain("my dentist's office");
  });

  it('defaults tone to neutral and omits the "who" line when not provided', () => {
    const raw = JSON.stringify({ message: 'Ask about my order status' });
    const message = buildCallScriptMessage(raw);

    expect(message).toContain('Neutral');
    expect(message).not.toContain('Who the call is to');
  });

  it('falls back to treating a non-JSON string as the raw purpose', () => {
    const message = buildCallScriptMessage('just a plain pasted purpose');
    expect(message).toContain('just a plain pasted purpose');
  });
});

describe('buildIsThisMadMessage', () => {
  it('includes context when provided', () => {
    const raw = JSON.stringify({
      message: 'Fine.',
      context: 'reply from my manager after I asked to reschedule',
    });

    const message = buildIsThisMadMessage(raw);

    expect(message).toContain('Fine.');
    expect(message).toContain('reply from my manager after I asked to reschedule');
  });

  it('omits the context line entirely when context is empty', () => {
    const raw = JSON.stringify({ message: 'Sounds good, talk soon.', context: '' });
    const message = buildIsThisMadMessage(raw);

    expect(message).toContain('Sounds good, talk soon.');
    expect(message).not.toContain('Context for the situation');
  });

  it('falls back to treating a non-JSON string as the raw message', () => {
    const message = buildIsThisMadMessage('just a plain pasted message');
    expect(message).toContain('just a plain pasted message');
  });
});
