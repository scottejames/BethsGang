/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openTool } from './helpers';

test.use({ serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial' });

async function waitForServiceWorker(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
}

test('can be installed', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();

  expect(manifest).toMatchObject({ name: "Beth's Gang", display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test('local tools keep working offline', async ({ page, context }) => {
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();

  await openTool(page, 'Pomodoro Timer');
});

test('a new deploy reaches an app that is already installed', async ({ page }) => {
  const newDeploy = page.locator('meta[name="e2e-new-deploy"]');
  await waitForServiceWorker(page);
  await expect(newDeploy).toHaveCount(0);

  // A deploy changes these two files: new content, and a new revision so the worker fetches it.
  const html = readFileSync('dist/index.html', 'utf8');
  writeFileSync('dist/index.html', html.replace('<head>', '<head><meta name="e2e-new-deploy">'));
  const worker = readFileSync('dist/sw.js', 'utf8');
  const updatedWorker = worker.replace(/\{[^{}]*url:"index\.html"[^{}]*\}/, (entry) =>
    entry.replace(/revision:"[^"]+"/, 'revision:"e2e-new-deploy"'),
  );
  expect(updatedWorker).not.toBe(worker);
  writeFileSync('dist/sw.js', updatedWorker);

  await expect
    .poll(
      async () => {
        await page.reload();
        return newDeploy.count();
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBe(1);
});
