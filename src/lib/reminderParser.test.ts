import { describe, expect, it } from 'vitest';
import { parseReminderText } from './reminderParser';

describe('parseReminderText', () => {
  it('parses a relative-minutes reminder', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me in 20 mins to have lunch', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('have lunch');
    expect(result.fireAt.getTime()).toBe(now.getTime() + 20 * 60 * 1000);
    expect(result.repeat).toEqual({ kind: 'none' });
    expect(result.warnBeforeMinutes).toBeUndefined();
  });

  it('resolves an ambiguous clock time to the soonest occurrence (afternoon "now")', () => {
    // Asked at 2pm, "at 5:30" should mean 5:30pm today, not 5:30am tomorrow.
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me at 5.30 to go home', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('go home');
    expect(result.fireAt).toEqual(new Date('2026-07-08T17:30:00'));
  });

  it('parses a trailing "warn me" clause alongside an ambiguous clock time', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me at 5.30 to go home, warn me 20 mins before', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('go home');
    expect(result.fireAt).toEqual(new Date('2026-07-08T17:30:00'));
    expect(result.warnBeforeMinutes).toBe(20);
  });

  it('parses "before" as a time preposition, same as "at"/"in"', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me before 5:30 to go home, warn me 10 mins before', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('go home');
    expect(result.fireAt).toEqual(new Date('2026-07-08T17:30:00'));
    expect(result.warnBeforeMinutes).toBe(10);
  });

  it('parses a daily repeat with an explicit meridiem', () => {
    const now = new Date('2026-07-08T08:00:00');
    const result = parseReminderText('remind me every day at 9am to take meds', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('take meds');
    expect(result.repeat).toEqual({ kind: 'daily' });
    expect(result.fireAt).toEqual(new Date('2026-07-08T09:00:00'));
  });

  it('parses an hourly interval with no explicit time, anchored to now', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me every 2 hours to stretch', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('stretch');
    expect(result.repeat).toEqual({ kind: 'interval', amount: 2, unit: 'hours' });
    expect(result.fireAt.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
  });

  it('parses a weekdays repeat with an ambiguous morning clock time', () => {
    // Asked at 8am, "at 9" should mean 9am (soonest), not 9pm.
    const now = new Date('2026-07-08T08:00:00');
    const result = parseReminderText('remind me every weekday at 9 to stand up', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('stand up');
    expect(result.repeat).toEqual({ kind: 'weekdays' });
    expect(result.fireAt).toEqual(new Date('2026-07-08T09:00:00'));
  });

  it('fails when no message can be found', () => {
    const result = parseReminderText('remind me in 20 mins', new Date('2026-07-08T14:00:00'));
    expect(result.ok).toBe(false);
  });

  it('fails when no time can be found and there is no repeat rule', () => {
    const result = parseReminderText('remind me to stretch', new Date('2026-07-08T14:00:00'));
    expect(result.ok).toBe(false);
  });

  it('accepts a short-fuse reminder with a short warning, both still in the future', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me in 2 mins to have lunch, warn me 1 min before', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fireAt.getTime()).toBe(now.getTime() + 2 * 60 * 1000);
    expect(result.warnBeforeMinutes).toBe(1);
  });

  it('fails when the requested warning would already be in the past', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me in 1 min to have lunch, warn me 5 mins before', now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/warning.*past/i);
  });

  it('fails when the reminder time itself is in the past', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me on january 1 2020 at 9am to celebrate', now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/past/i);
  });

  it('defaults to a 15-minute warning when the reminder is more than an hour away and none was requested', () => {
    const now = new Date('2026-07-08T14:00:00');
    const result = parseReminderText('remind me at 5.30 to go home', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fireAt).toEqual(new Date('2026-07-08T17:30:00'));
    expect(result.warnBeforeMinutes).toBe(15);
  });

  it('does not default a warning for a reminder exactly an hour or less away', () => {
    const now = new Date('2026-07-08T08:00:00');
    const result = parseReminderText('remind me every weekday at 9 to stand up', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fireAt).toEqual(new Date('2026-07-08T09:00:00'));
    expect(result.warnBeforeMinutes).toBeUndefined();
  });

  describe('flexible duration and clock-idiom phrasing', () => {
    const now = new Date('2026-07-08T14:00:00');

    it('parses "an hour and a half" as 90 minutes (not 60 or 30)', () => {
      const result = parseReminderText('remind me in an hour and a half to eat food', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.message).toBe('eat food');
      expect(result.fireAt.getTime()).toBe(now.getTime() + 90 * 60 * 1000);
    });

    it('parses "<number> and a half hours" with a spelled-out number', () => {
      const result = parseReminderText('remind me in two and a half hours to eat food', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fireAt.getTime()).toBe(now.getTime() + 150 * 60 * 1000);
    });

    it('parses "<number> and a half hours" with a digit', () => {
      const result = parseReminderText('remind me in 2 and a half hours to eat food', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fireAt.getTime()).toBe(now.getTime() + 150 * 60 * 1000);
    });

    it('parses "a quarter hour" / "quarter of an hour" as 15 minutes', () => {
      const a = parseReminderText('remind me in a quarter hour to check the oven', now);
      const b = parseReminderText('remind me in quarter of an hour to check the oven', now);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.fireAt.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
      expect(b.fireAt.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
    });

    it('parses "half past five" as the soonest 5:30, same as "at 5.30"', () => {
      const result = parseReminderText('remind me half past five to go home', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fireAt).toEqual(new Date('2026-07-08T17:30:00'));
    });

    it('parses "quarter past five" and "quarter to five"', () => {
      const past = parseReminderText('remind me quarter past five to go home', now);
      const to = parseReminderText('remind me quarter to five to go home', now);
      expect(past.ok).toBe(true);
      expect(to.ok).toBe(true);
      if (!past.ok || !to.ok) return;
      expect(past.fireAt).toEqual(new Date('2026-07-08T17:15:00'));
      expect(to.fireAt).toEqual(new Date('2026-07-08T16:45:00'));
    });

    it('resolves the hour-12 edge case ("quarter to one") to the soonest occurrence', () => {
      // Asked at 2pm, "12:45" should mean tonight at 00:45, not tomorrow at 12:45pm.
      const result = parseReminderText('remind me quarter to one to go home', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fireAt).toEqual(new Date('2026-07-09T00:45:00'));
    });

    it('does not leave a dangling "at" before "noon"/"midnight"', () => {
      const noon = parseReminderText('remind me at noon to eat', now);
      const midnight = parseReminderText('remind me at midnight to sleep', now);
      expect(noon.ok).toBe(true);
      expect(midnight.ok).toBe(true);
      if (!noon.ok || !midnight.ok) return;
      expect(noon.message).toBe('eat');
      expect(midnight.message).toBe('sleep');
    });
  });
});
