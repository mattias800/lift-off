import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const requests = [];
page.on('request', (request) => {
  if (request.url().startsWith('http')) requests.push(request.url());
});
try {
  // The production artifact must work directly from disk, with no server/network.
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.getByRole('button', { name: 'LET’S GO UP' }).waitFor();
  await page.screenshot({ path: 'test-results/title.png', fullPage: true });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3100);
  const state = () => page.evaluate(() => window.__LIFT_OFF__);
  assert.equal((await state()).mode, 'playing');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  assert.ok((await state()).hero.x > 250, 'arrow controls move the courier');
  await page.keyboard.press('Escape');
  assert.equal((await state()).paused, true);
  const pausedTime = (await state()).time;
  await page.waitForTimeout(250);
  assert.equal((await state()).time, pausedTime, 'pause freezes the simulation');
  await page.getByRole('button', { name: 'BACK TO IT' }).click();
  await page.keyboard.down('KeyJ');
  await page.keyboard.down('Space');
  await page.waitForTimeout(6000);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyJ');
  const combat = await state();
  assert.ok(combat.score > 0, 'real keyboard combat scores hits');
  await page.screenshot({ path: 'test-results/combat.png', fullPage: true });
  await page.getByRole('button', { name: 'Mute sound' }).click();
  assert.equal(await page.getByRole('button', { name: 'Enable sound' }).count(), 1);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.fullscreenElement?.id === 'cabinet');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.deepEqual(requests, [], 'offline build makes no network requests');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log(
    'Desktop / offline / keyboard / combat / pause / sound / fullscreen: passed',
    JSON.stringify(combat),
  );

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(pathToFileURL(resolve('dist/index.html')).href);
  await mobile.getByRole('button', { name: 'LET’S GO UP' }).tap();
  await mobile.waitForTimeout(3100);
  const right = mobile.getByRole('button', { name: 'Move right' });
  const bounds = await right.boundingBox();
  assert.ok(bounds);
  await right.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: bounds.x + 10,
    clientY: bounds.y + 10,
  });
  await mobile.waitForTimeout(300);
  await right.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  assert.ok(
    (await mobile.evaluate(() => window.__LIFT_OFF__)).hero.x > 250,
    'touch movement works',
  );
  await mobile.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.ok(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'mobile has no horizontal overflow',
  );
  assert.deepEqual(errors, []);
  console.log('Mobile / touch controls / layout: passed');
} finally {
  await browser.close();
}
