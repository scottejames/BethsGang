import { defineBackend } from '@aws-amplify/backend';
import { data } from './data/resource';
import { aiAssistFunction } from './functions/ai-assist/resource';
import { logEventFunction } from './functions/log-event/resource';

defineBackend({
  data,
  aiAssistFunction,
  logEventFunction,
});
