import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { aiAssistFunction } from '../functions/ai-assist/resource';
import { logEventFunction } from '../functions/log-event/resource';

const schema = a.schema({
  runAiTool: a
    .query()
    .arguments({
      toolId: a.string().required(),
      input: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(aiAssistFunction)),

  // Fire-and-forget usage tracking — see src/lib/usageLog.ts for what gets sent and
  // amplify/functions/log-event/handler.ts for where it ends up (CloudWatch Logs).
  logEvent: a
    .mutation()
    .arguments({
      input: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(logEventFunction)),

  // User accounts, Phase 2: per-user persistence for signed-in users. Owner-scoped
  // (Cognito user pool auth, distinct from the two operations above which stay on the
  // public API key) — see designs/user-personalization.md for why these two models
  // specifically (they're the only client state that currently persists at all) and
  // src/context/RemindersContext.tsx / EnergyContext.tsx for the signed-in/signed-out
  // branching that reads and writes them.
  Reminder: a
    .model({
      message: a.string().required(),
      fireAt: a.datetime().required(),
      warnBeforeMinutes: a.integer(),
      warnedForCurrentFireAt: a.boolean().required().default(false),
      // JSON-stringified RepeatRule (src/lib/reminderParser.ts) — a single evolving
      // field rather than separate columns, same pattern already used for every
      // AI tool's structured input (see designs/user-personalization.md's schema
      // evolution strategy).
      repeat: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // One row per signed-in user (id is set client-side to their Cognito username — see
  // EnergyContext.tsx), a home for any future per-user scalar preference without a new
  // model each time. Only `spoons` (the energy level) exists today.
  UserPreferences: a
    .model({
      spoons: a.integer().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // User accounts, Phase 3: the Shared Task Store (see src/context/TaskStoreContext.tsx)
  // follows Reminder's model above — owner-scoped, client-generated ids, plain fields
  // rather than a JSON blob (unlike Reminder.repeat, `size`/`category` are simple fixed
  // string unions already, with no nested structure to evolve). No `belongsTo`/`hasMany`
  // relation between Task and Project on purpose: a task's `projectId` is a plain
  // optional string, matching the existing "detach, don't cascade-delete" behavior when
  // a project is deleted (a relation would need its own on-delete policy to get that).
  Project: a
    .model({
      name: a.string().required(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Task: a
    .model({
      title: a.string().required(),
      projectId: a.string(),
      size: a.string().required(),
      category: a.string().required(),
      done: a.boolean().required().default(false),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // Timetable — see designs/timetable.md and src/context/TimetableContext.tsx.
  // Weekly-recurring by design: entries are keyed by day-of-week, not by date, so
  // "this Monday" and "last Monday" are the same set of rows — there's no repeat rule
  // to advance the way Reminder.repeat needs one. `dayOfWeek` is a plain string
  // ('monday'..'sunday'), not a GraphQL enum, per the same "might evolve" reasoning as
  // every other plain-string field in this schema. `startTime`/`endTime` are AWSTime
  // (a.time()) — TimetableContext.tsx converts to/from this app's "HH:mm" client shape.
  TimetableEntry: a
    .model({
      dayOfWeek: a.string().required(),
      startTime: a.time().required(),
      endTime: a.time(),
      label: a.string().required(),
      location: a.string(),
      // Unset means "use the default (15 minutes)" — same "explicit value always
      // wins" rule as Reminder.warnBeforeMinutes.
      alertMinutesBefore: a.integer(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});
