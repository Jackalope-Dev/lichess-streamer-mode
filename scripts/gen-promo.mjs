// Generates Chrome Web Store promo tiles as self-contained HTML, ready to be
// screenshotted headless at exact pixel sizes:
//   - small   440x280
//   - marquee 1400x560
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || root;
const logo =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(root, 'public/icon/128.png')).toString('base64');

// An 8x8 board with two masked player labels, scaled by --sq (square size px).
const board = (sq) => {
  let squares = '';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      squares += `<div class="sq ${(r + c) % 2 ? 'd' : 'l'}"></div>`;
  return `
  <div class="board" style="--sq:${sq}px">
    <div class="grid">${squares}</div>
    <span class="plabel top"><b>Opponent</b></span>
    <span class="plabel bottom"><b>Streamer</b></span>
  </div>`;
};

const chip = (t) => `<span class="chip">${t}</span>`;

const css = `
  * { margin: 0; box-sizing: border-box; }
  html, body { overflow: hidden; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #e8e6e3;
    background: #1c1b19;
    position: relative;
  }
  .bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(120% 140% at 85% 15%, rgba(117,153,0,.28), transparent 60%),
      radial-gradient(90% 120% at 10% 90%, rgba(117,153,0,.10), transparent 55%),
      #232220;
  }
  .wrap { position: relative; height: 100%; display: flex; align-items: center; }
  .copy { display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; }
  .brand img { display: block; flex: none; border-radius: 22%; }
  .title { font-weight: 800; line-height: 1; letter-spacing: -.5px; }
  .for { color: #a9cd3a; font-weight: 600; }
  .tag { color: #cfccc7; font-weight: 500; }
  .chips { display: flex; flex-wrap: wrap; }
  .chip {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(117,153,0,.5);
    color: #e8e6e3; border-radius: 999px; font-weight: 600;
    white-space: nowrap;
  }
  /* board */
  .board { position: relative; flex: none; border-radius: 8px; overflow: hidden;
           box-shadow: 0 18px 50px rgba(0,0,0,.5); }
  .grid { display: grid; grid-template-columns: repeat(8, var(--sq));
          grid-template-rows: repeat(8, var(--sq)); }
  .sq { width: var(--sq); height: var(--sq); }
  .sq.l { background: #eeeed2; }
  .sq.d { background: #769656; }
  .plabel {
    position: absolute; left: 50%; transform: translateX(-50%);
    background: #759900; color: #1a1a1a; font-weight: 800;
    border-radius: 6px; box-shadow: 0 3px 10px rgba(0,0,0,.45);
  }
  .plabel.top { top: 7%; }
  .plabel.bottom { bottom: 7%; }
`;

const page = (w, h, body, extra) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{width:${w}px;height:${h}px}${css}${extra}</style></head>
<body><div class="bg"></div><div class="wrap">${body}</div></body></html>`;

// --- small 440x280 -------------------------------------------------------
const small = page(
  440,
  280,
  `
  <div class="copy" style="gap:14px; padding-left:30px; width:250px">
    <div class="brand" style="gap:11px">
      <img src="${logo}" width="46" height="46">
      <div>
        <div class="title" style="font-size:25px">Streamer Mode</div>
        <div class="for" style="font-size:14px">for Lichess</div>
      </div>
    </div>
    <div class="tag" style="font-size:14.5px; line-height:1.35">
      Hide every username on Lichess in one click. Stop stream-sniping.
    </div>
    <div class="chips" style="gap:7px">
      ${chip('You → Streamer')}${chip('Opponent')}
    </div>
  </div>
  <div style="position:absolute; right:24px; top:50%; transform:translateY(-50%)">
    ${board(21)}
  </div>`,
  `.chip{padding:5px 11px; font-size:11.5px}
   .plabel{font-size:11px; padding:2px 9px}`,
);

// --- marquee 1400x560 ----------------------------------------------------
const marquee = page(
  1400,
  560,
  `
  <div class="copy" style="gap:30px; padding-left:90px; width:760px">
    <div class="brand" style="gap:26px">
      <img src="${logo}" width="116" height="116">
      <div>
        <div class="title" style="font-size:66px">Streamer Mode</div>
        <div class="for" style="font-size:32px; margin-top:4px">for Lichess</div>
      </div>
    </div>
    <div class="tag" style="font-size:30px; line-height:1.4; max-width:680px">
      Hide every username on Lichess with one click — you become
      <b style="color:#fff">Streamer</b>, your opponent
      <b style="color:#fff">Opponent</b>. Play live without getting stream-sniped.
    </div>
    <div class="chips" style="gap:13px">
      ${chip('Stop stream-sniping')}${chip('Chat &amp; board covered')}
      ${chip('Chrome · Edge · Firefox')}${chip('Free')}
    </div>
  </div>
  <div style="position:absolute; right:110px; top:50%; transform:translateY(-50%)">
    ${board(46)}
  </div>`,
  `.chip{padding:11px 22px; font-size:19px}
   .plabel{font-size:22px; padding:5px 18px}`,
);

fs.writeFileSync(path.join(outDir, 'promo-small.html'), small);
fs.writeFileSync(path.join(outDir, 'promo-marquee.html'), marquee);
console.log('wrote promo-small.html (440x280) and promo-marquee.html (1400x560) to', outDir);
