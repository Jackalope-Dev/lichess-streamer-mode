// Generates the extension icon set as PNGs with zero dependencies.
// Motif: two white "redaction bars" on a dark Lichess-toned tile with a
// green border — i.e. a hidden / blacked-out name.
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

const draw = (N) => {
  const bg = [38, 36, 33, 255];
  const border = [117, 153, 0, 255];
  const bar = [240, 240, 240, 255];
  const rgba = Buffer.alloc(N * N * 4);
  const b = Math.max(1, Math.round(N * 0.06)); // border thickness
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      let c = bg;
      const edge = x < b || x >= N - b || y < b || y >= N - b;
      if (edge) c = border;
      const inBar1 = y >= N * 0.4 && y < N * 0.52 && x >= N * 0.2 && x < N * 0.8;
      const inBar2 = y >= N * 0.58 && y < N * 0.7 && x >= N * 0.2 && x < N * 0.6;
      if (inBar1 || inBar2) c = bar;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = c[3];
    }
  }
  return rgba;
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  fs.writeFileSync(path.join(OUT_DIR, `${size}.png`), encodePng(size, draw(size)));
}
console.log(`Wrote icons to ${OUT_DIR}`);
