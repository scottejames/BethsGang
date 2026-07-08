import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

// Assumed to cover this codebase's actual fixed vocabulary (tone/verbosity/repeat-kind
// values like "friendly", "medium", "weekdays") without being long enough to capture the
// substance of free-text a user typed (a message, a reminder, a call topic).
const SHORT_VALUE_MAX_LENGTH = 24;

// Reduces a tool's raw input string to something safe to ship to CloudWatch: short
// string values are kept as-is (useful to see which options people pick), longer string
// values are reduced to just their length (several tools handle real personal content —
// messages, reminders — that shouldn't be logged verbatim by default). Non-string values
// pass through unchanged, and a non-JSON input (e.g. Task Breakdown's plain string) just
// reports its overall length.
export function summarizeInputForLogging(input: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const summary: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        summary[key] =
          typeof value === 'string' && value.length > SHORT_VALUE_MAX_LENGTH
            ? { length: value.length }
            : value;
      }
      return summary;
    }
  } catch {
    // Not JSON — plain string input.
  }
  return { length: input.length };
}

export type UsageEventKind = 'opened' | 'ai_call';

export interface UsageEvent {
  toolId: string;
  event: UsageEventKind;
  spoons?: number;
  detail?: Record<string, unknown>;
}

// Fire-and-forget on purpose: usage tracking must never surface an error to the user or
// delay a tool's own action, so failures are swallowed rather than thrown. The whole
// call is wrapped (not just a `.catch` on the returned promise) since `logEvent` can be
// briefly absent from the *deployed* backend's schema relative to this file's compiled
// TypeScript types (e.g. right after this code ships but before the backend has
// finished deploying) — calling a method that doesn't yet exist on the generated client
// throws synchronously, which a `.catch` alone wouldn't catch.
export function sendUsageEvent(event: UsageEvent): void {
  try {
    const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
    client.mutations.logEvent({ input: payload })?.catch(() => {});
  } catch {
    // Ignored — see above.
  }
}
