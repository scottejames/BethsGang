import { defineFunction, secret } from '@aws-amplify/backend';

export const aiAssistFunction = defineFunction({
  name: 'ai-assist',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    ANTHROPIC_API_KEY: secret('ANTHROPIC_API_KEY'),
  },
});
