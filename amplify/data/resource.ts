import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { aiAssistFunction } from '../functions/ai-assist/resource';

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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});
