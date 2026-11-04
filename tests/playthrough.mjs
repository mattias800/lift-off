import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.clock.install();
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.getByRole('button', { name: 'LET’S GO UP' }).click();
  const held = new Set();
  let state,
    combatSaved = false,
    bossSaved = false;
  for (let i = 0; i < 900; i++) {
    state = await page.evaluate(() => window.__LIFT_OFF__);
    if (state.mode === 'won' || state.mode === 'lost') break;
    const p = state.hero;
    const targets = state.enemies.toSorted(
      (a, b) => Math.hypot(a.x - p.x, (a.y - p.y) * 2) - Math.hypot(b.x - p.x, (b.y - p.y) * 2),
    );
    const target = targets[0],
      dx = target ? target.x - p.x : 0,
      dy = target ? target.y - p.y : 0;
    const keys = new Set(['KeyJ']);
    if (Math.abs(dx) > 27) keys.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(dy) > 5) keys.add(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    if (target && Math.abs(dx) < 75 && Math.abs(dy) < 30) keys.add('Space');
    for (const key of held)
      if (!keys.has(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of keys)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    await page.clock.runFor(200);
    if (!combatSaved && state.floor === 3 && state.enemies.length >= 3) {
      await page.screenshot({ path: 'test-results/brawl.png', fullPage: true });
      combatSaved = true;
    }
    if (!bossSaved && state.enemies.some((e) => e.kind === 'boss' && e.state === 'windup')) {
      await page.screenshot({ path: 'test-results/boss.png', fullPage: true });
      bossSaved = true;
    }
  }
  for (const key of held) await page.keyboard.up(key);
  assert.equal(state.mode, 'won', JSON.stringify(state));
  await page.clock.runFor(1300);
  await page.getByRole('heading', { name: 'ROOM AT THE TOP.' }).waitFor();
  await page.screenshot({ path: 'test-results/win.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.ok(state.score > 10000);
  console.log('Full real-input browser playthrough: WON', JSON.stringify(state));
  await page.getByRole('button', { name: 'ONE MORE RIDE' }).click();
  await page.clock.runFor(3200);
  const restarted = await page.evaluate(() => window.__LIFT_OFF__);
  assert.equal(restarted.floor, 1);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.health, 100);
  assert.ok((await page.locator('#best-score').textContent()).includes(String(state.score)));
  console.log('Win screen / replay / saved high score: passed');
} finally {
  await browser.close();
}
