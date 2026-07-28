// browser boot check: loads the app in system Chrome/Edge headless, fails on
// console errors, saves screenshots. Needs the dev server running (npm run dev).
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find(existsSync);
if (!CHROME) { console.error('no system browser found'); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(process.env.APP_URL || 'http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000)); // let the scene settle

const hud = await page.evaluate(() => ({
  clock: document.getElementById('clock')?.textContent,
  status: document.getElementById('npc-status')?.textContent,
  canvas: !!document.querySelector('canvas'),
}));
await page.screenshot({ path: 'test/screenshot-day.png' });

// jump to night: stars, fireflies, campfire, interior light
await page.evaluate(() => window.homestead.setTime(21.7));
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'test/screenshot-night.png' });

await browser.close();

if (!hud.canvas) { console.error('FAIL: no canvas rendered'); process.exit(1); }
if (!/^\d\d:\d\d$/.test(hud.clock ?? '')) { console.error(`FAIL: clock not running (${hud.clock})`); process.exit(1); }
if (errors.length) { console.error('FAIL: console errors:\n' + errors.join('\n')); process.exit(1); }
console.log(`e2e boot check: OK — clock ${hud.clock}, NPCs: ${JSON.stringify(hud.status)}`);
console.log('screenshot: test/screenshot-day.png');
