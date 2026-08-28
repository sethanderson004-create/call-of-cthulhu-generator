import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 420, height: 780 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/call-of-cthulhu-generator/prototypes/dial.html');
await p.waitForTimeout(500);
await p.locator('#watch').click(); // pure spectator: four bots, same rules
for (const mark of [45, 90, 150, 210, 270]) {
  await p.waitForTimeout(45000);
  
  console.log(`${mark}s | ${(await p.locator('#legend').innerText()).replace(/\n/g, '  ')}`);
  if (mark === 90) await p.screenshot({ path: '/tmp/dial-mid.png' });
  if (mark === 270) await p.screenshot({ path: '/tmp/dial-late.png' });
  const status = await p.locator('#targetOut').innerText();
  if (status.includes('cornered') || status.includes('yours')) { console.log('ended at', mark + 's:', status); break; }
}
await b.close();
