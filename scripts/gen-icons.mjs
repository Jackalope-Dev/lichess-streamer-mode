// Generates the extension icon set as PNGs with zero dependencies.
// Motif: a white chess pawn on a dark, green-bordered rounded tile, with a
// black "censor" bar across the pawn's face — i.e. a hidden chess identity.
// Rendered with 4x supersampling for smooth edges at every size.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'icon',
);

// --- PNG encoding --------------------------------------------------------
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};

const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const crc = zlib.crc32(Buffer.concat([t, data]));
  return Buffer.concat([u32(data.length), t, data, u32(crc)]);
};

const encodePng = (size, rgba) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = rgba[i];
      raw[p++] = rgba[i + 1];
      raw[p++] = rgba[i + 2];
      raw[p++] = rgba[i + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// --- shape helpers (all in normalised [0,1] coordinates) -----------------
const BG = [38, 36, 33];
const BORDER = [117, 153, 0];
const PIECE = [238, 238, 238];
const BAR = [13, 13, 13];
const BAR_EDGE = [205, 205, 205];

const R = 0.22; // tile corner radius
const T = 0.06; // tile border thickness

// Inside a rounded square [0,1]^2 with corner radius r.
const inRoundRect = (x, y, r) => {
  const ax = Math.abs(x - 0.5);
  const ay = Math.abs(y - 0.5);
  const cx = 0.5 - r;
  const cy = 0.5 - r;
  if (ax > 0.5 || ay > 0.5) return false;
  if (ax <= cx || ay <= cy) return true;
  const dx = ax - cx;
  const dy = ay - cy;
  return dx * dx + dy * dy <= r * r;
};

const inEllipse = (x, y, cx, cy, rx, ry) => {
  const a = (x - cx) / rx;
  const b = (y - cy) / ry;
  return a * a + b * b <= 1;
};

// Pawn silhouette: head + collar + flaring body + base slab.
const inPawn = (x, y) => {
  if (inEllipse(x, y, 0.5, 0.27, 0.14, 0.14)) return true; // head
  if (inEllipse(x, y, 0.5, 0.45, 0.16, 0.05)) return true; // collar
  if (y >= 0.42 && y <= 0.71) {
    const half = 0.07 + (0.22 - 0.07) * ((y - 0.42) / (0.71 - 0.42)); // cone body
    if (Math.abs(x - 0.5) <= half) return true;
  }
  if (y >= 0.71 && y <= 0.82 && Math.abs(x - 0.5) <= 0.25) return true; // base
  return false;
};

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Colour (with alpha) of a single sample point.
const sample = (x, y) => {
  if (!inRoundRect(x, y, R)) return [0, 0, 0, 0]; // outside tile -> transparent

  // border = inside tile but outside the inset tile
  const u = (x - T) / (1 - 2 * T);
  const v = (y - T) / (1 - 2 * T);
  const inner = u >= 0 && u <= 1 && v >= 0 && v <= 1 && inRoundRect(u, v, R);

  let c = inner ? BG : BORDER;
  if (inPawn(x, y)) c = PIECE;

  // censor bar across the pawn's face, drawn on top
  if (inRect(x, y, 0.24, 0.205, 0.76, 0.325)) {
    c = inRect(x, y, 0.258, 0.223, 0.742, 0.307) ? BAR : BAR_EDGE;
  }

  return [c[0], c[1], c[2], 255];
};

const SS = 4; // supersampling factor

const render = (N) => {
  const rgba = Buffer.alloc(N * N * 4);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      // premultiplied-alpha accumulation for clean edges
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / N;
          const y = (py + (sy + 0.5) / SS) / N;
          const [cr, cg, cb, ca] = sample(x, y);
          const af = ca / 255;
          r += cr * af;
          g += cg * af;
          b += cb * af;
          a += af;
        }
      }
      const n = SS * SS;
      const i = (py * N + px) * 4;
      if (a === 0) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
      } else {
        rgba[i] = Math.round(r / a); // un-premultiply
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return rgba;
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  fs.writeFileSync(path.join(OUT_DIR, `${size}.png`), encodePng(size, render(size)));
}
console.log(`Wrote chess-pawn icons to ${OUT_DIR}`);
