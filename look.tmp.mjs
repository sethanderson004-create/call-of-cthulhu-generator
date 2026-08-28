import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 420, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file:///home/user/call-of-cthulhu-generator/prototypes/dial.html');
await p.waitForTimeout(800);
// Play it like a person: push into whatever neighbour is open, re-target when taken.
const box = await p.locator('canvas').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
async function tapAround() {
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 - Math.PI / 2;
    await p.mouse.click(cx + Math.cos(a) * box.width * 0.30, cy + Math.sin(a) * box.width * 0.30);
    await p.waitForTimeout(60);
    const t = await p.locator('#targetOut').innerText();
    if (t.startsWith('Pushing')) return t.replace(/\n/g, ' ');
  }
  return '(no reachable segment found)';
}
const marks = [30, 60, 120, 180, 240];
let last = 0;
for (const mark of marks) {
  const line = await tapAround();
  await p.waitForTimeout((mark - last) * 1000);
  last = mark;
  console.log(`${mark}s | you ${await p.locator('#shareOut').textContent()} | ${(await p.locator('#legend').innerText()).replace(/\n/g, '  ')}`);
  if (mark === 60) await p.screenshot({ path: '/tmp/dial-a.png' });
  if (mark === 180) await p.screenshot({ path: '/tmp/dial-b.png' });
  const status = await p.locator('#targetOut').innerText();
  if (status.includes('cornered') || line.includes('The market is yours')) { console.log('ended:', status.replace(/\n/g,' ')); break; }
}
console.log('errors:', errs.length ? errs.slice(0,3) : 'none');
await b.close();
