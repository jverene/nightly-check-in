/**
 * Generates the PWA icons as PNGs with zero image dependencies:
 * white background, black rounded square, white check mark.
 * Run: npm run icons
 */
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- minimal PNG encoder ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- drawing ----------

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const rectPad = size * 0.1;
  const radius = size * 0.2;
  const checkWidth = size * 0.09;
  const p1 = [0.27 * size, 0.53 * size];
  const p2 = [0.44 * size, 0.69 * size];
  const p3 = [0.74 * size, 0.33 * size];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r = 255, g = 255, b = 255;

      // inside black rounded square?
      const inX = x >= rectPad && x < size - rectPad;
      const inY = y >= rectPad && y < size - rectPad;
      if (inX && inY) {
        const cx = Math.max(rectPad + radius, Math.min(x, size - rectPad - radius));
        const cy = Math.max(rectPad + radius, Math.min(y, size - rectPad - radius));
        if (Math.hypot(x - cx, y - cy) <= radius) {
          r = 10; g = 10; b = 10;
        }
      }

      // white check mark
      if (r === 10) {
        const d = Math.min(
          distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]),
          distToSegment(x, y, p2[0], p2[1], p3[0], p3[1]),
        );
        if (d <= checkWidth / 2) {
          r = 255; g = 255; b = 255;
        }
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

const targets = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
  ["src/app/icon.png", 32],
];

for (const [path, size] of targets) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, drawIcon(size));
  console.log(`wrote ${path} (${size}x${size})`);
}
