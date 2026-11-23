import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const root = path.resolve(process.argv[2] || 'out');
const captures = process.argv[3];
const origin = 'https://quantistes.test';
const sample = readFileSync(new URL('../desk/data/quantistes-flow-embedded.txt', import.meta.url), 'utf8');
const { chainRaw } = JSON.parse(gunzipSync(Buffer.from(sample, 'base64')));
const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 }, locale: 'it-IT', timezoneId: 'Europe/Rome', reducedMotion: 'reduce',
  });
  // Exercise the actual export with a private test origin and no external requests.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const asset = path.resolve(root, file);
    if (!asset.startsWith(root + path.sep) || !existsSync(asset)) return route.fulfill({ status: 404 });
    return route.fulfill({ path: asset });
  });
  await page.goto(origin);
  const open = page.getByRole('button', { name: 'Dati e parametri' });
  await open.click();
  const hub = page.locator('#q15ParamsMount');
  const reference = hub.locator('section.sidegroup').filter({ has: page.locator('#settlement') });
  const calculate = reference.getByRole('button', { name: 'Calcola livelli', exact: true });
  await calculate.waitFor();
  assert.equal(await page.locator('#calculate').count(), 1);
  assert.equal(await hub.locator('#qlCalcDock').count(), 0);
  assert.ok(await calculate.isDisabled());
  await page.locator('#csvFile').setInputFiles({ name: 'ThetaData-SPXW.csv', mimeType: 'text/csv', buffer: Buffer.from(chainRaw) });
  await page.locator('#qxChainReceipt[data-state="loaded"]').waitFor();
  await reference.locator('#useSpot').click();
  assert.ok(await calculate.isEnabled());
  if (captures) mkdirSync(captures, { recursive: true });

  for (const [width, height] of [[1440, 960], [390, 844], [320, 740], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const layout = await hub.evaluate(panel => {
      const rect = selector => panel.querySelector(selector).getBoundingClientRect();
      const section = panel.querySelector('#settlement').closest('section').getBoundingClientRect();
      panel.scrollTo({ top: 0, behavior: 'instant' });
      const target = rect('#target'), status = rect('#qlCalcLabel'), action = rect('#calculate'), hint = rect('#computeHint');
      panel.scrollTo({ top: 160, behavior: 'instant' });
      return {
        distance: panel.scrollTop, buttonTravel: action.top - rect('#calculate').top, targetTravel: target.top - rect('#target').top,
        ordered: target.bottom <= status.top && status.bottom <= action.top && action.bottom <= hint.top + 1,
        aligned: Math.abs(action.left - target.left) <= 2 && Math.abs(action.right - target.right) <= 2,
        fits: action.width > 0 && action.height >= 40 && action.left >= Math.max(0, section.left) && action.right <= Math.min(innerWidth, section.right) + 1,
      };
    });
    assert.ok(layout.ordered && layout.aligned && layout.fits, width + 'px: ' + JSON.stringify(layout));
    assert.ok(Math.abs(layout.distance - layout.buttonTravel) <= 1 && Math.abs(layout.distance - layout.targetTravel) <= 1,
      'La posizione del pulsante deve seguire lo scorrimento dei campi a ' + width + 'px');
    if (width === 1440 || width === 390) {
      assert.ok(layout.distance > 100);
      if (captures) {
        await reference.evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await calculate.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(captures, 'livelli-' + width + '.png') });
      }
    }
  }
  await page.locator('#q15SettingsClose').click();
  await open.click();
  await calculate.click();
  await page.waitForFunction(() => !window.Desk.state.busy && !!window.Desk.state.result, null, { timeout: 90000 });
  const result = await page.evaluate(() => {
    const { selectedRows, ippo, ws } = window.Desk.state.result;
    return [selectedRows, ippo.levels.length, ws.levels.length];
  });
  assert.deepEqual(result, [556, 17, 17]);
  console.log('Verificati scheda, allineamento e scorrimento a 320, 390, 1440 e 3840 px. Calcolo da CSV: 556 righe, 17 livelli per modello.');
} finally {
  await browser.close();
}
