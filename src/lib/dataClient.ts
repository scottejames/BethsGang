import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Shared client for the owner-scoped models (Reminder, UserPreferences) used by
// RemindersContext/EnergyContext once a user is signed in. Separate from
// aiClient.ts/usageLog.ts's own generateClient() calls (those hit runAiTool/logEvent,
// which use identityPool roles instead) because Reminder/
// UserPreferences only permit allow.owner() — a client call without an explicit
// userPool authMode is rejected server-side with "Not Authorized", confirmed against
// a real sandbox deploy.
export const client = generateClient<Schema>({ authMode: 'userPool' });
