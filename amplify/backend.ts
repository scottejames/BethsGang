import { defineBackend } from '@aws-amplify/backend';
import { data } from './data/resource';
import { aiAssistFunction } from './functions/ai-assist/resource';

defineBackend({
  data,
  aiAssistFunction,
});
