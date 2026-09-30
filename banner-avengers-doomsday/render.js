// Renderiza banner.html a PNG en los dos formatos para WhatsApp.
// Uso: node render.js   (requiere playwright)
const path = require('path');
const { chromium } = require('playwright');

const sizes = [
  { layout: 'story', width: 1080, height: 1920, out: 'avengers-doomsday-estado-1080x1920.png' },
  { layout: 'square', width: 1080, height: 1080, out: 'avengers-doomsday-chat-1080x1080.png' },
];

(async () => {
  const browser = await chromium.launch();
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    const url = 'file://' + path.join(__dirname, 'banner.html') + '?layout=' + s.layout;
    await page.goto(url);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.screenshot({ path: path.join(__dirname, s.out) });
    console.log('ok', s.out);
    await page.close();
  }
  await browser.close();
})();
