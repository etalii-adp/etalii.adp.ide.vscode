// Takes the screenshots in this folder, as readme.md describes them, in a real VS Code window.
//
//   npm run build
//   npm i --no-save puppeteer-core
//   node docs/screenshots/capture.mjs [image.png ...]
//
// Each image gets a fresh VS Code (downloaded once into .vscode-test/, like the real-IDE tests)
// with an empty profile, this extension loaded from the repository and every other extension off,
// opened on a copy of examples/ so nothing in the repository is edited. The script connects to the
// window over the Chrome DevTools protocol, opens the ADP views, opens the document by Quick Open,
// selects one element so ADP Properties has rows to show, centres the drawing and takes the
// picture. It exits non-zero naming any image whose diagram drew nothing, or whose toolbox or
// properties stayed empty.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
const viewport = { width: 1600, height: 900, deviceScaleFactor: 1 };
const port = 9333;

/** Every image: the document it opens, under examples/, its theme and the element it selects. */
const images = [
  { file: 'agent-behavior-modelling.png', document: 'agent-behavior-modelling/research-assistant/research-assistant.adp', theme: 'dark', select: '1.2' },
  { file: 'gartner-hypecycle-graph-light.png', document: 'gartner-hypecycle-graph/digital-trends/digital-trends.ghg', theme: 'light', select: 'middle-trend' },
];

const themes = { dark: 'Default Dark Modern', light: 'Default Light Modern' };
const wanted = process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(what, probe, timeout = 60_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const found = await probe().catch(() => undefined);
    if (found) return found;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}

/** The webview frame holding a selector: VS Code nests each webview's page in an inner frame. */
function frameWith(page, selector) {
  return until(selector, async () => {
    for (const frame of page.frames()) {
      if (await frame.$(selector).catch(() => null)) return frame;
    }
    return undefined;
  });
}

async function command(page, title) {
  await page.keyboard.press('F1');
  await page.waitForSelector('.quick-input-widget input', { visible: true });
  await page.keyboard.type(title);
  await sleep(600);
  await page.keyboard.press('Enter');
  await sleep(600);
}

async function capture(executable, image) {
  const scratch = mkdtempSync(join(tmpdir(), 'adp-capture-'));
  const workspace = join(scratch, 'examples');
  cpSync(join(repository, 'examples'), workspace, { recursive: true });
  const userData = join(scratch, 'user-data');
  mkdirSync(join(userData, 'User'), { recursive: true });
  writeFileSync(join(userData, 'User', 'settings.json'), JSON.stringify({
    'workbench.colorTheme': themes[image.theme],
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'workbench.layoutControl.enabled': false,
    'chat.disableAIFeatures': true,
    'window.zoomLevel': 0,
    'window.commandCenter': false,
    'window.restoreWindows': 'none',
    'security.workspace.trust.enabled': false,
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    'extensions.ignoreRecommendations': true,
  }, null, 2));

  const code = spawn(executable, [
    workspace,
    `--extensionDevelopmentPath=${repository}`,
    `--user-data-dir=${userData}`, `--extensions-dir=${join(scratch, 'extensions')}`,
    '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
    `--remote-debugging-port=${port}`,
  ], { stdio: 'ignore' });

  let browser;
  try {
    browser = await until('VS Code', () => puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null }));
    const page = await until('the workbench', async () => (await browser.pages()).find((candidate) => candidate.url().includes('workbench')));
    await page.setViewport(viewport);
    await page.waitForSelector('.monaco-workbench', { visible: true });

    // The ADP views in the side bar, no notifications. The panel is closed further down, and only
    // when it is open: "View: Close Panel" is not offered while the panel is closed, and the
    // command palette then runs its nearest match, which opens the panel with a terminal in it.
    await command(page, 'ADP: Focus on ADP Toolbox');
    await command(page, 'Notifications: Clear All Notifications');

    // Opened once the window is up: a file named on the command line of a fresh profile can open
    // before the extension's editors are known, as text.
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyP');
    await page.keyboard.up('Control');
    await page.waitForSelector('.quick-input-widget input', { visible: true });
    await page.keyboard.type(image.document.split('/').pop());
    await sleep(1000);
    await page.keyboard.press('Enter');

    if (await page.$eval('.part.panel', (panel) => panel.offsetHeight > 0).catch(() => false)) {
      await command(page, 'View: Close Panel');
    }

    const canvas = await frameWith(page, '.adp-content [data-id]');
    await frameWith(page, '.adp-toolbox-entry');
    const drawn = await canvas.$$eval('.adp-content [data-id]', (groups) => groups.length);
    if (drawn === 0) throw new Error(`${image.document} drew nothing`);

    // The drawing's middle in the middle of the editor, at the size the editor first drew it.
    await canvas.evaluate(() => {
      const surface = document.querySelector('.adp-surface');
      const content = document.querySelector('.adp-content').getBoundingClientRect();
      const view = surface.getBoundingClientRect();
      const dx = content.left + content.width / 2 - (view.left + view.width / 2);
      const dy = content.top + content.height / 2 - (view.top + view.height / 2);
      surface.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true }));
    });
    await sleep(800);

    // One element selected, so ADP Properties shows its rows: a named one, or the one of a kind
    // nearest the middle of the editor, so the selection is in view.
    const element = image.select === 'middle-trend'
      ? await canvas.evaluateHandle(() => {
        const view = document.querySelector('.adp-surface').getBoundingClientRect();
        const distance = (node) => {
          const box = node.getBoundingClientRect();
          return Math.hypot(box.left + box.width / 2 - (view.left + view.width / 2), box.top + box.height / 2 - (view.top + view.height / 2));
        };
        return [...document.querySelectorAll('.adp-content .adp-node-segmented')].reduce((best, node) => (distance(node) < distance(best) ? node : best));
      })
      : await canvas.waitForSelector(`.adp-content [data-id="${image.select}"] .adp-node`);
    await element.click();
    const properties = await frameWith(page, '.adp-properties');
    await until('properties of the selection', () => properties.$eval('.adp-properties', (root) => root.childElementCount > 0 && !root.querySelector('.adp-properties-empty')));
    await sleep(500);

    await page.screenshot({ path: join(here, image.file), clip: { x: 0, y: 0, ...viewport } });
    console.log(`${image.file}: ${drawn} things drawn`);
  } finally {
    await browser?.disconnect();
    // The whole process tree on Windows: a child left running keeps the scratch folder locked.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(code.pid), '/T', '/F'], { stdio: 'ignore' });
    else code.kill();
    await sleep(1000);
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

const executable = await downloadAndUnzipVSCode('stable');
let failed = 0;
for (const image of images.filter((candidate) => wanted.length === 0 || wanted.includes(candidate.file))) {
  try {
    await capture(executable, image);
  } catch (error) {
    failed++;
    console.error(`${image.file}: ${error.message}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
