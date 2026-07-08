import { defineFunction } from '@aws-amplify/backend';

export const logEventFunction = defineFunction({
  name: 'log-event',
  entry: './handler.ts',
  timeoutSeconds: 10,
});
