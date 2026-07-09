import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { aiAssistFunction } from './functions/ai-assist/resource';
import { logEventFunction } from './functions/log-event/resource';

defineBackend({
  auth,
  data,
  aiAssistFunction,
  logEventFunction,
});
