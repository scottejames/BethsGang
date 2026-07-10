import * as chrono from 'chrono-node';

export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'interval'; amount: number; unit: 'minutes' | 'hours' };

export interface ParsedReminder {
  ok: true;
  message: string;
  fireAt: Date;
  warnBeforeMinutes?: number;
  repeat: RepeatRule;
}

export interface ParseFailure {
  ok: false;
  reason: string;
}

// The supported grammar is "remind me (at|in|before) <time> [to <message>][, warn me
// <n> minutes before]" — "remind me" is always the leading verb; "warn me" only ever
// appears as this trailing clause, never as its own leading verb (that dual-entry-point
// shape was confusing and has been removed). Tried in order; each has exactly one
// capture group (the number of minutes) and its full match ([0]) is stripped from the
// text so it doesn't confuse message/time parsing.
const WARN_PATTERNS: RegExp[] = [
  /\bwarn me\s+(\d+)\s*(?:minutes?|mins?)\s*before(?:\s*hand)?\b/i,
  /\b(\d+)\s*(?:minutes?|mins?)\s*before(?:\s*hand)?\b/i,
];

const REPEAT_PATTERNS: { regex: RegExp; toRule: (match: RegExpMatchArray) => RepeatRule }[] = [
  {
    regex: /\bevery\s*weekdays?\b|\bweekdays?\s*only\b|\bon\s*weekdays\b/i,
    toRule: () => ({ kind: 'weekdays' }),
  },
  {
    regex: /\bevery\s*day\b|\bdaily\b|\beach\s*day\b/i,
    toRule: () => ({ kind: 'daily' }),
  },
  {
    regex: /\bevery\s*(\d+)\s*(?:minutes?|mins?)\b/i,
    toRule: (match) => ({ kind: 'interval', amount: Number(match[1]), unit: 'minutes' }),
  },
  {
    regex: /\bevery\s*(\d+)\s*(?:hours?|hrs?)\b/i,
    toRule: (match) => ({ kind: 'interval', amount: Number(match[1]), unit: 'hours' }),
  },
];

const LEADING_PREFIX = /^\s*remind me\b\s*/i;
const LEADING_CONNECTOR = /^\s*(?:that|to)\b\s*/i;

// chrono absorbs "at"/"in" into its own matched time phrase for numeric times (e.g. "at
// 5:30", "in 20 mins"), but not for the "noon"/"midnight"/"midday" keywords ("at noon"
// only matches "noon", leaving a dangling "at") or for "before"/"by" used the same way
// ("remind me before 5:30 to go home" otherwise leaves a dangling "before") — all
// stripped here when one directly precedes the matched time phrase.
const LEADING_TIME_PREPOSITION = /\b(?:before|by|at)\s*$/i;

// A reminder more than an hour out is easy to forget is even coming — default to a
// 15-minute heads-up unless the user explicitly asked for a different warning (or none).
const AUTO_WARN_THRESHOLD_MS = 60 * 60 * 1000;
const AUTO_WARN_MINUTES = 15;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).join('|');

function wordToNumber(token: string): number | undefined {
  const digits = Number(token);
  if (!Number.isNaN(digits)) return digits;
  return NUMBER_WORDS[token.toLowerCase()];
}

// chrono-node handles plenty of casual duration/time phrasing natively ("in a couple of
// hours", "in a few minutes", "half an hour", "noon") but a handful of common ones either
// silently give the wrong answer or aren't recognised at all — rewritten here into a form
// chrono already understands, before chrono ever sees the text. Every rewrite is confined
// to the matched substring, so it can't shift the meaning of surrounding text.
function normalizeDurationPhrases(text: string): string {
  let result = text;

  // "an hour and a half" (idiomatic — "an hour" always means one here) -> "1.5 hours".
  // Handled separately from the general case below since it has no leading number.
  result = result.replace(/\ban?\s+hours?\s+and\s+a\s+half\b/gi, '1.5 hours');

  // "<number> and a half hours" -> "<number>.5 hours". Without this, chrono matches only
  // "half hours" and silently drops the leading number entirely (a real, confirmed bug —
  // "two and a half hours" was being parsed as exactly 30 minutes).
  result = result.replace(
    new RegExp(`\\b(\\d+|${NUMBER_WORD_PATTERN})\\s+and\\s+a\\s+half\\s+hours?\\b`, 'gi'),
    (whole, num: string) => {
      const n = wordToNumber(num);
      return n === undefined ? whole : `${n}.5 hours`;
    },
  );

  // "quarter of an hour" / "a quarter hour" / "quarter hour" -> "15 minutes". Without
  // this, chrono matches just "an hour" (or worse, "a quarter" as a quarter-*year*).
  result = result.replace(/\b(?:a\s+)?quarter\s+(?:of\s+an?\s+)?hours?\b/gi, '15 minutes');

  // British clock idioms chrono doesn't recognise at all ("half past five", "quarter
  // past five", "quarter to five") — rewritten to plain "H:MM", which then flows through
  // the same ambiguous-hour resolution as any other bare clock time.
  const hourPattern = `\\d{1,2}|${NUMBER_WORD_PATTERN}`;
  result = result.replace(
    new RegExp(`\\bhalf\\s+past\\s+(${hourPattern})\\b`, 'gi'),
    (whole, hour: string) => {
      const h = wordToNumber(hour);
      return h === undefined ? whole : `${h}:30`;
    },
  );
  result = result.replace(
    new RegExp(`\\bquarter\\s+past\\s+(${hourPattern})\\b`, 'gi'),
    (whole, hour: string) => {
      const h = wordToNumber(hour);
      return h === undefined ? whole : `${h}:15`;
    },
  );
  result = result.replace(
    new RegExp(`\\bquarter\\s+to\\s+(${hourPattern})\\b`, 'gi'),
    (whole, hour: string) => {
      const h = wordToNumber(hour);
      if (h === undefined) return whole;
      return `${h <= 1 ? 12 : h - 1}:45`;
    },
  );

  return result;
}

function nextAtHour(hour: number, minute: number, now: Date): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

// "noon"/"midday"/"midnight" report hour 12/0 with meridiem "uncertain" too, but the
// words themselves are never ambiguous — skip the resolver for those.
const UNAMBIGUOUS_HOUR_KEYWORDS = /\b(?:noon|midday|midnight)\b/i;

// chrono defaults an hour with no am/pm given to AM, then pushes to the next day once
// that's passed — so "at 5:30" asked at 2pm becomes 5:30am tomorrow, not 5:30pm today.
// For a casual reminder, the soonest future occurrence of that clock time (am or pm) is
// almost always what's meant. Only applied when there's no explicit date/weekday/meridiem
// in the phrase — those cases are far less ambiguous, so chrono's own resolution stands.
// Hour 12 gets the same treatment as 1-11 (candidates 00:xx and 12:xx rather than
// hour/hour+12) — "quarter to one" resolving to "12:45" is exactly as ambiguous as any
// other bare hour.
function resolveAmbiguousHour(result: chrono.ParsedResult, now: Date): Date {
  const start = result.start;
  const hour = start.get('hour');
  const minute = start.get('minute') ?? 0;

  if (
    hour !== null &&
    (hour === 12 || (hour >= 1 && hour <= 11)) &&
    !UNAMBIGUOUS_HOUR_KEYWORDS.test(result.text) &&
    !start.isCertain('meridiem') &&
    !start.isCertain('day') &&
    !start.isCertain('weekday')
  ) {
    const amHour = hour === 12 ? 0 : hour;
    const pmHour = hour === 12 ? 12 : hour + 12;
    const amCandidate = nextAtHour(amHour, minute, now);
    const pmCandidate = nextAtHour(pmHour, minute, now);
    return amCandidate.getTime() <= pmCandidate.getTime() ? amCandidate : pmCandidate;
  }

  return start.date();
}

function stripClause(text: string, match: RegExpMatchArray): string {
  return text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length);
}

function cleanMessage(text: string): string {
  let message = text.trim();
  message = message.replace(LEADING_PREFIX, '');
  message = message.replace(LEADING_CONNECTOR, '');
  message = message.replace(/\s{2,}/g, ' ');
  message = message.replace(/^[,\s]+|[,\s]+$/g, '');
  return message;
}

export function parseReminderText(text: string, now: Date = new Date()): ParsedReminder | ParseFailure {
  let working = text;
  let warnBeforeMinutes: number | undefined;

  for (const pattern of WARN_PATTERNS) {
    const match = working.match(pattern);
    if (match) {
      warnBeforeMinutes = Number(match[1]);
      working = stripClause(working, match);
      break;
    }
  }

  let repeat: RepeatRule = { kind: 'none' };
  for (const { regex, toRule } of REPEAT_PATTERNS) {
    const match = working.match(regex);
    if (match) {
      repeat = toRule(match);
      working = stripClause(working, match);
      break;
    }
  }

  const normalizedForTime = normalizeDurationPhrases(working);
  const results = chrono.parse(normalizedForTime, now, { forwardDate: true });
  const timeResult = results[0];

  let fireAt: Date;
  if (timeResult) {
    fireAt = resolveAmbiguousHour(timeResult, now);
    let spanStart = timeResult.index;
    const precedingPreposition = normalizedForTime.slice(0, spanStart).match(LEADING_TIME_PREPOSITION);
    if (precedingPreposition) {
      spanStart -= precedingPreposition[0].length;
    }
    working = normalizedForTime.slice(0, spanStart) + normalizedForTime.slice(timeResult.index + timeResult.text.length);
  } else if (repeat.kind === 'interval') {
    const unitMs = repeat.unit === 'hours' ? 60 * 60 * 1000 : 60 * 1000;
    fireAt = new Date(now.getTime() + repeat.amount * unitMs);
  } else if (repeat.kind === 'daily' || repeat.kind === 'weekdays') {
    return {
      ok: false,
      reason: "Couldn't work out what time to remind you each day — try adding one, like \"every day at 9am\".",
    };
  } else {
    return { ok: false, reason: "Couldn't work out when to remind you — try including a time, like \"in 20 mins\" or \"at 5:30\"." };
  }

  if (fireAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "That's in the past — try a time after now." };
  }

  const message = cleanMessage(working);
  if (!message) {
    return { ok: false, reason: "Couldn't work out what to remind you about — try adding what comes after \"to\"." };
  }

  if (warnBeforeMinutes !== undefined) {
    const warnAt = fireAt.getTime() - warnBeforeMinutes * 60_000;
    if (warnAt <= now.getTime()) {
      return {
        ok: false,
        reason: `A ${warnBeforeMinutes}-minute warning would already be in the past — try a shorter warning or a later reminder time.`,
      };
    }
  } else if (fireAt.getTime() - now.getTime() > AUTO_WARN_THRESHOLD_MS) {
    warnBeforeMinutes = AUTO_WARN_MINUTES;
  }

  return { ok: true, message, fireAt, warnBeforeMinutes, repeat };
}
