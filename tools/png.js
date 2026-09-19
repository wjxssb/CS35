// Minimal pure-JS PNG encoder (solid color / simple 2D pixel buffer).
// Used to generate deterministic demo avatars without extra dependencies.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Create a PNG buffer.
 * @param {number} width
 * @param {number} height
 * @param {number[][]} pixels - width*height array of [r,g,b] (row-major)
 */
export function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y * width + x];
      raw[y * (width * 3 + 1) + 1 + x * 3] = r;
      raw[y * (width * 3 + 1) + 2 + x * 3] = g;
      raw[y * (width * 3 + 1) + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Generate a square avatar: solid background with a lighter inner square. */
export function avatarPng([r, g, b], size = 256) {
  const pixels = [];
  const inner = Math.floor(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x < inner || y < inner || x >= size - inner || y >= size - inner;
      if (edge) pixels.push([Math.min(255, r + 70), Math.min(255, g + 70), Math.min(255, b + 70)]);
      else pixels.push([r, g, b]);
    }
  }
  return encodePng(size, size, pixels);
}
