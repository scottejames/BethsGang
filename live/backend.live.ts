import '../src/amplifyConfig';
import { signIn, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Schema } from '../amplify/data/resource';
import { runAiTool } from '../src/lib/aiClient';
import { client as dataClient } from '../src/lib/dataClient';
import {
  assertSandbox,
  createDisposableUser,
  deleteDisposableUser,
  deleteLeftoverUsers,
  type DisposableUser,
} from './liveEnv';

// usageLog.ts deliberately swallows every failure, so it can't report one. This uses the
// same auth mode against the same operation.
const usageClient = generateClient<Schema>({ authMode: 'identityPool' });

interface Row {
  id: string;
  [field: string]: unknown;
}
interface Result<T> {
  data: T;
  errors?: { message: string }[];
}
interface ModelApi {
  create(input: Row): Promise<Result<Row | null>>;
  get(key: { id: string }): Promise<Result<Row | null>>;
  list(options: { limit: number }): Promise<Result<Row[]>>;
  update(input: Row): Promise<Result<Row | null>>;
  delete(key: { id: string }): Promise<Result<Row | null>>;
}

const models = dataClient.models as unknown as Record<string, ModelApi>;
const now = new Date().toISOString();

// One real row per model. `edit` is a field the other user must not be able to change.
const MODELS = [
  {
    name: 'Reminder',
    fields: { message: 'Live check', fireAt: now, warnedForCurrentFireAt: false, repeat: '{"kind":"none"}' },
    edit: { message: 'Changed' },
  },
  { name: 'UserPreferences', fields: { spoons: 42 }, edit: { spoons: 1 } },
  { name: 'Project', fields: { name: 'Live check', createdAt: now }, edit: { name: 'Changed' } },
  {
    name: 'Task',
    fields: { title: 'Live check', size: 'small', category: 'now', done: false, createdAt: now },
    edit: { title: 'Changed' },
  },
  {
    name: 'TimetableEntry',
    fields: { dayOfWeek: 'monday', startTime: '09:00:00', label: 'Live check' },
    edit: { label: 'Changed' },
  },
];

async function signInAs(user: DisposableUser) {
  await signOut();
  const { isSignedIn } = await signIn({ username: user.username, password: user.password });
  expect(isSignedIn).toBe(true);
}

async function expectAiAndLoggingToWork() {
  const answer = await runAiTool('task-breakdown', 'Water the plant');
  expect(answer.trim()).not.toBe('');

  const { errors } = await usageClient.mutations.logEvent({
    input: JSON.stringify({ toolId: 'live-check', event: 'opened', timestamp: now }),
  });
  expect(errors).toBeUndefined();
}

describe('the deployed sandbox backend', () => {
  let owner: DisposableUser;
  let otherUser: DisposableUser;

  beforeAll(() => {
    assertSandbox();
    deleteLeftoverUsers();
    owner = createDisposableUser();
    otherUser = createDisposableUser();
  });

  afterAll(async () => {
    await signOut();
    [owner, otherUser].filter(Boolean).forEach((user) => deleteDisposableUser(user.username));
  });

  describe('AI tools and usage logging', () => {
    it('work signed out', async () => {
      await signOut();
      await expectAiAndLoggingToWork();
    });

    it('work signed in', async () => {
      await signInAs(owner);
      await expectAiAndLoggingToWork();
    });
  });

  describe.each(MODELS)('$name', ({ name, fields, edit }) => {
    const model = () => models[name];
    const id = crypto.randomUUID();

    it('can be created, read and updated by its owner', async () => {
      await signInAs(owner);

      const created = await model().create({ id, ...fields });
      expect(created.errors).toBeUndefined();

      const read = await model().get({ id });
      expect(read.data).toMatchObject(fields);

      const listed = await model().list({ limit: 1000 });
      expect(listed.data.map((row) => row.id)).toContain(id);
    });

    it("cannot be read, changed or deleted by another user", async () => {
      await signInAs(otherUser);

      expect((await model().get({ id })).data).toBeNull();
      expect((await model().list({ limit: 1000 })).data.map((row) => row.id)).not.toContain(id);
      expect((await model().update({ id, ...edit })).errors?.length).toBeGreaterThan(0);
      expect((await model().delete({ id })).errors?.length).toBeGreaterThan(0);

      // The errors above aren't proof on their own: confirm the row really is untouched.
      await signInAs(owner);
      expect((await model().get({ id })).data).toMatchObject(fields);
    });

    it('cannot be read when signed out', async () => {
      await signOut();

      await expect(model().get({ id })).rejects.toThrow();
    });

    it('can be deleted by its owner', async () => {
      await signInAs(owner);

      const deleted = await model().delete({ id });
      expect(deleted.errors).toBeUndefined();
      expect((await model().get({ id })).data).toBeNull();
    });
  });
});
