import { expect, test, type Page } from '@playwright/test';
import {
  assertSandbox,
  createDisposableUser,
  deleteDisposableUser,
  type DisposableUser,
} from '../live/liveEnv';
import { goHome, openTool, signIn, signOut } from './helpers';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });

let user: DisposableUser;

test.beforeAll(() => {
  assertSandbox();
  user = createDisposableUser();
});

test.afterAll(() => {
  if (user) deleteDisposableUser(user.username);
});

const uniqueReminder = () => `e2e check ${crypto.randomUUID().slice(0, 8)}`;

// A list can load before its live connection is ready, and a change made in that gap isn't
// delivered. Each of the 5 data types opens 3 subscriptions, and the server confirms each one.
const LIVE_SUBSCRIPTIONS = 15;

function countLiveSubscriptions(page: Page) {
  let confirmed = 0;
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (String(payload).includes('"start_ack"')) confirmed += 1;
    });
  });
  return () => confirmed;
}

const waitUntilLoaded = (page: Page) => expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 20_000 });

async function addReminder(page: Page, message: string) {
  await waitUntilLoaded(page);
  await page.getByPlaceholder(/^Remind me in 20 mins/).fill(`Remind me in 20 mins to ${message}`);
  const saved = page.waitForResponse((response) => response.request().postData()?.includes('createReminder') ?? false);
  await page.getByRole('button', { name: 'Set reminder' }).click();
  await expect(reminder(page, message)).toBeVisible();
  expect((await (await saved).json()).errors).toBeUndefined();
}

const reminder = (page: Page, message: string) => page.getByRole('listitem').filter({ hasText: message });

async function cancelReminder(page: Page, message: string) {
  const deleted = page.waitForResponse((response) => response.request().postData()?.includes('deleteReminder') ?? false);
  await reminder(page, message).getByRole('button').click();
  await deleted;
}

// The first load of account data can take several seconds.
const expectLoadedFromAccount = (page: Page, message: string) =>
  expect(reminder(page, message)).toBeVisible({ timeout: 20_000 });

test('a signed-in visit: AI tool, saved reminder, sign out, sign back in', async ({ page }) => {
  const message = uniqueReminder();
  await page.goto('/');
  await signIn(page, user);

  await openTool(page, 'Task Breakdown');
  await page.getByPlaceholder('e.g. Sort out my taxes').fill('Water the plant');
  await page.getByRole('button', { name: 'Break it down' }).click();
  await expect(page.getByRole('button', { name: 'Send to Everything Pile' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.tool-error')).toHaveCount(0);

  await goHome(page);
  await openTool(page, 'Remind Me');
  await addReminder(page, message);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // After a reload the reminder can only have come from the account.
  await page.reload();
  await openTool(page, 'Remind Me');
  await expectLoadedFromAccount(page, message);

  await signOut(page);
  await expect(reminder(page, message)).toHaveCount(0);
  // Closing the live connection at sign-out must not look like a sync failure.
  await page.waitForTimeout(2_000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await openTool(page, 'Remind Me');
  await expect(reminder(page, message)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain(message);

  await signIn(page, user);
  await expectLoadedFromAccount(page, message);
  await cancelReminder(page, message);
  await expect(reminder(page, message)).toHaveCount(0);
});

test('a change on one device appears on another without a reload', async ({ browser }) => {
  const message = uniqueReminder();
  const [laptop, phone] = await Promise.all([browser.newPage(), browser.newPage()]);
  const liveOnPhone = countLiveSubscriptions(phone);
  for (const device of [laptop, phone]) {
    await device.goto('/');
    await signIn(device, user);
    await openTool(device, 'Remind Me');
    await waitUntilLoaded(device);
  }
  await expect.poll(liveOnPhone, { timeout: 20_000 }).toBeGreaterThanOrEqual(LIVE_SUBSCRIPTIONS);

  await addReminder(laptop, message);
  await expect(reminder(phone, message)).toBeVisible({ timeout: 20_000 });

  await cancelReminder(phone, message);
  await expect(reminder(laptop, message)).toHaveCount(0, { timeout: 20_000 });
});

test('says it is loading while account data is on its way, then shows it', async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/graphql', async (route) => {
    if (/listReminders|listUserPreferences/.test(route.request().postData() ?? '')) await held;
    await route.continue();
  });
  await page.goto('/');
  await signIn(page, user);
  await openTool(page, 'Remind Me');

  await expect(page.getByText('Loading…')).toBeVisible();
  await expect(page.getByText('No reminders set yet.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Energy level loading' })).toBeDisabled();

  release();

  await expect(page.getByText('No reminders set yet.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Energy level: \d+/ })).toBeEnabled();
});

test('a failed fetch never leaves it claiming there is nothing', async ({ page }) => {
  await page.clock.install();
  await page.route('**/graphql', async (route) => {
    if ((route.request().postData() ?? '').includes('listReminders')) await route.abort();
    else await route.continue();
  });
  await page.goto('/');
  await page.clock.resume();
  await signIn(page, user);
  await openTool(page, 'Remind Me');
  await expect(page.getByText('Loading…')).toBeVisible();

  await page.clock.fastForward(31_000);

  await expect(page.getByText("Couldn't load your reminders.")).toBeVisible();
  await expect(page.getByText('No reminders set yet.')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('reload the page');
});
