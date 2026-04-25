type Rgba = [number, number, number, number];

const sizes = [16, 48, 128] as const;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcData = new Uint8Array(typeBytes.length + data.length);
  crcData.set(typeBytes);
  crcData.set(data, typeBytes.length);

  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32(crc32(crcData)), 8 + data.length);
  return out;
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const part = data.subarray(offset, Math.min(offset + 65535, data.length));
    const block = new Uint8Array(5 + part.length);
    block[0] = offset + part.length >= data.length ? 1 : 0;
    block[1] = part.length & 0xff;
    block[2] = (part.length >>> 8) & 0xff;
    const nlen = (~part.length) & 0xffff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(part, 5);
    blocks.push(block);
  }

  const bodyLen = blocks.reduce((sum, block) => sum + block.length, 0);
  const out = new Uint8Array(2 + bodyLen + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let cursor = 2;
  for (const block of blocks) {
    out.set(block, cursor);
    cursor += block.length;
  }
  out.set(u32(adler32(data)), cursor);
  return out;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function iconPixel(size: number, x: number, y: number): Rgba {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const dx = x - cx;
  const dy = y - cy;
  const radius = size * 0.47;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) return [0, 0, 0, 0];

  const t = Math.max(0, Math.min(1, (x + y) / (size * 2 - 2)));
  const base: Rgba = [mix(233, 83, t), mix(69, 52, t), mix(96, 131, t), 255];

  const nodes: Array<[number, number, number]> = [
    [0.34, 0.39, 0.09],
    [0.66, 0.35, 0.075],
    [0.5, 0.63, 0.105],
  ];
  for (const [nx, ny, nr] of nodes) {
    const ndx = x - size * nx;
    const ndy = y - size * ny;
    if (Math.sqrt(ndx * ndx + ndy * ndy) <= size * nr) {
      return [255, 255, 255, 235];
    }
  }

  return base;
}

function png(size: number): Uint8Array {
  const stride = size * 4 + 1;
  const raw = new Uint8Array(stride * size);
  for (let y = 0; y < size; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      raw.set(iconPixel(size, x, y), row + 1 + x * 4);
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

await Bun.$`mkdir -p dist/icons`;
for (const size of sizes) {
  await Bun.write(`dist/icons/icon${size}.png`, png(size));
}
