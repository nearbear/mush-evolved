// Minimal PNG decoder: 8-bit RGB or RGBA, non-interlaced. That covers every
// image this converter reads; anything else throws rather than guessing.

import { inflateSync } from "node:zlib";

export interface Image {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads only the header, for images we need the size of but not the pixels. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  checkSignature(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function decodePng(bytes: Uint8Array): Image {
  checkSignature(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];

  for (let pos = 8; pos < bytes.length; ) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const [bitDepth, colorType, , , interlace] = data.subarray(8);
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG: bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length; // length + type + data + CRC
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    unfilter(filter, line, prev, channels);
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      rgba[out] = line[x * channels]!;
      rgba[out + 1] = line[x * channels + 1]!;
      rgba[out + 2] = line[x * channels + 2]!;
      rgba[out + 3] = channels === 4 ? line[x * channels + 3]! : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

/** Reverses the per-scanline filter in place (PNG spec, section 9). */
function unfilter(filter: number, line: Uint8Array, prev: Uint8Array, bpp: number): void {
  for (let i = 0; i < line.length; i++) {
    const left = i >= bpp ? line[i - bpp]! : 0;
    const up = prev[i]!;
    const upLeft = i >= bpp ? prev[i - bpp]! : 0;
    let predictor: number;
    switch (filter) {
      case 0:
        predictor = 0;
        break;
      case 1:
        predictor = left;
        break;
      case 2:
        predictor = up;
        break;
      case 3:
        predictor = (left + up) >> 1;
        break;
      case 4:
        predictor = paeth(left, up, upLeft);
        break;
      default:
        throw new Error(`Bad PNG filter type ${filter}`);
    }
    line[i] = (line[i]! + predictor) & 0xff;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function checkSignature(bytes: Uint8Array): void {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("Not a PNG file");
}
