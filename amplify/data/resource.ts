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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});
