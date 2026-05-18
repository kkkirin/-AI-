import { test, expect, _electron as electron } from '@playwright/test';

async function findQuickTextWindow(app: any) {
  const deadline = Date.now() + 15000;
  let openWindows: string[] = [];

  while (Date.now() < deadline) {
    const windows = app.windows();
    openWindows = [];

    for (const window of windows) {
      const url = window.url();
      const title = await window.title().catch(() => '');
      openWindows.push(`${title || '(no title)'} ${url}`);

      if (url.startsWith('devtools://')) {
        continue;
      }

      const hasQuickText = await window
        .getByText(/QuickText/i)
        .first()
        .isVisible({ timeout: 250 })
        .catch(() => false);

      if (hasQuickText) {
        return window;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`QuickText window not found. Open windows: ${openWindows.join(' | ')}`);
}

async function closeApp(app: any) {
  const process = app.process();
  await Promise.race([
    app.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch(() => undefined);

  if (process && !process.killed) {
    try {
      process.kill('SIGKILL');
    } catch {
      // Process may have already exited.
    }
  }
}

test('app launches and shows QuickText', async () => {
  const app = await electron.launch({ args: ['.'] });

  try {
    const window = await findQuickTextWindow(app);
    await expect(window.getByText(/QuickText/i)).toBeVisible();
  } finally {
    await closeApp(app);
  }
});
