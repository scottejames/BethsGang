import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Shared client for the owner-scoped models (Reminder, UserPreferences) used by
// RemindersContext/EnergyContext once a user is signed in. Separate from
// aiClient.ts/usageLog.ts's own generateClient() calls (those hit runAiTool/logEvent,
// which stay on the public API key) because this client needs a different default
// authMode: the schema's own defaultAuthorizationMode is 'apiKey' (so runAiTool/
// logEvent need no per-call override), but Reminder/UserPreferences only permit
// allow.owner() — an unauthenticated-by-default client call against them is rejected
// server-side with "Not Authorized", confirmed against a real sandbox deploy.
export const client = generateClient<Schema>({ authMode: 'userPool' });
