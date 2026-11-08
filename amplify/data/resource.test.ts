// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { schema } from './resource';

const { generateClient } = vi.hoisted(() => ({ generateClient: vi.fn(() => ({})) }));
vi.mock('aws-amplify/data', () => ({ generateClient }));

// The @auth rules Amplify turns into the AppSync resolver's auth check. Asserting on
// these (rather than on the authorization() call) tests what actually gets deployed.
function authRulesFor(field: string): string {
  // [\s\S]: Amplify prints each rule after the first on its own line.
  const pattern = new RegExp(`^\\s*${field}\\([\\s\\S]*?@auth\\(rules: \\[([\\s\\S]*?)\\]\\)`, 'm');
  const rules = schema.transform().schema.match(pattern)?.[1];
  if (!rules) throw new Error(`No @auth rules found for ${field}`);
  return rules;
}

// Regression: allow.guest() alone only admits the Identity Pool's *unauthenticated*
// role. A signed-in user's identityPool credentials assume the *authenticated* role, so
// every AI tool failed for them with "Not Authorized to access runAiTool on type Query"
// while working fine signed out.
describe.each(['runAiTool', 'logEvent'])('%s authorization', (field) => {
  it('admits signed-out visitors (Identity Pool unauthenticated role)', () => {
    expect(authRulesFor(field)).toContain('{allow: public, provider: identityPool}');
  });

  it('admits signed-in users (Identity Pool authenticated role)', () => {
    expect(authRulesFor(field)).toContain('{allow: private, provider: identityPool}');
  });
});

const OWNER_ONLY = '{allow: owner, ownerField: "owner"}';

function modelAuthRules(): Record<string, string> {
  const matches = schema
    .transform()
    .schema.matchAll(/^type (\w+) @model @auth\(rules: \[([\s\S]*?)\]\)/gm);
  return Object.fromEntries([...matches].map(([, model, rules]) => [model, rules]));
}

// These tables hold people's personal data. The exact match is deliberate: adding a
// model, or loosening any rule, has to be a conscious change to this list.
describe('data model authorization', () => {
  it('keeps every model readable and writable only by its owner', () => {
    expect(modelAuthRules()).toEqual({
      Reminder: OWNER_ONLY,
      UserPreferences: OWNER_ONLY,
      Project: OWNER_ONLY,
      Task: OWNER_ONLY,
      TimetableEntry: OWNER_ONLY,
    });
  });
});

// The rules above only help if each client calls with the credentials those rules expect.
// Getting this wrong is invisible in the mocked unit tests: the server rejects the call.
describe.each([
  ['runAiTool', '../../src/lib/aiClient', 'identityPool'],
  ['logEvent', '../../src/lib/usageLog', 'identityPool'],
  ['owner-scoped models', '../../src/lib/dataClient', 'userPool'],
])('%s client', (_field, modulePath, authMode) => {
  it(`uses ${authMode} auth, matching the schema rules`, async () => {
    vi.resetModules();
    generateClient.mockClear();
    await import(/* @vite-ignore */ modulePath);
    expect(generateClient).toHaveBeenCalledWith({ authMode });
  });
});
