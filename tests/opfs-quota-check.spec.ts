/**
 * Quick diagnostic: check OPFS storage quota and clear existing data.
 * Run: npx playwright test tests/opfs-quota-check.spec.ts --headed
 */
import { test } from './helpers/persistent-chrome';

test('OPFS quota check', async ({ persistentPage: page }) => {
  await page.goto('http://localhost:5175/?lowbit-q-validation=1', { waitUntil: 'networkidle', timeout: 30_000 });

  // List and clear OPFS entries
  const entries = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    // @ts-ignore
    for await (const [name] of root.entries()) {
      names.push(name);
    }
    return names;
  });
  console.log('OPFS entries before clear:', entries);

  if (entries.length > 0) {
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      // @ts-ignore
      for await (const [name] of root.entries()) {
        await root.removeEntry(name, { recursive: true });
      }
    });
    console.log('Cleared all OPFS entries');
  }

  // Check storage estimate
  const estimate = await page.evaluate(async () => {
    const est = await navigator.storage.estimate();
    return { quota: est.quota, usage: est.usage };
  });
  console.log(`Quota: ${Math.round((estimate.quota ?? 0) / 1024 / 1024)} MB`);
  console.log(`Usage: ${Math.round((estimate.usage ?? 0) / 1024 / 1024)} MB`);
  console.log(`Available: ${Math.round(((estimate.quota ?? 0) - (estimate.usage ?? 0)) / 1024 / 1024)} MB`);

  // Try to persist storage (may grant more quota)
  const persisted = await page.evaluate(() => navigator.storage.persist());
  console.log(`Storage persisted: ${persisted}`);

  const estimate2 = await page.evaluate(async () => {
    const est = await navigator.storage.estimate();
    return { quota: est.quota, usage: est.usage };
  });
  console.log(`After persist — Quota: ${Math.round((estimate2.quota ?? 0) / 1024 / 1024)} MB`);
  console.log(`After persist — Available: ${Math.round(((estimate2.quota ?? 0) - (estimate2.usage ?? 0)) / 1024 / 1024)} MB`);
  console.log(`Gemma 4 needs: 2963 MB`);
  console.log(`Sufficient: ${((estimate2.quota ?? 0) - (estimate2.usage ?? 0)) > 3.1 * 1024 * 1024 * 1024 ? 'YES' : 'NO'}`);
});
