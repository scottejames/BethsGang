import { expect, type Page } from '@playwright/test';
import type { DisposableUser } from '../live/liveEnv';

const TABS = ['Everyday Helpers', 'Get Organized', 'Study Help'];

export async function openTool(page: Page, name: string) {
  for (const tab of TABS) {
    await page.getByRole('button', { name: tab }).click();
    const card = page.getByRole('button', { name: new RegExp(`^${name}`) });
    if (await card.count()) {
      await card.click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      return;
    }
  }
  throw new Error(`${name} isn't on any Home tab`);
}

export const goHome = (page: Page) => page.getByRole('button', { name: /all tools/i }).click();

export const accountButton = (page: Page) => page.getByRole('button', { name: /^Signed in as/ });

export async function signIn(page: Page, user: DisposableUser) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="username"]').fill(user.username);
  await dialog.locator('input[name="password"]').fill(user.password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(accountButton(page)).toBeVisible({ timeout: 30_000 });
}

export async function signOut(page: Page) {
  await accountButton(page).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
}
