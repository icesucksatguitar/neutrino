// Pure top-edge color sampling for the Dia-style top bar tint (R20.2).
// No Electron imports: main passes in the raw bitmap of a thin strip captured from
// the top of the page (NativeImage.toBitmap(), BGRA on Windows/little-endian).

import type { Rgba } from './color';

export type PixelOrder = 'bgra' | 'rgba';

/** Pixels below this alpha are ignored (transparent areas say nothing about the page color). */
const MIN_PIXEL_ALPHA = 128;
/** Bucket size per channel (16 levels), so anti-aliasing and noise fall into one bucket. */
const BUCKET_SHIFT = 4;
/** The dominant bucket must cover this share of opaque pixels, otherwise the color is undeterminable. */
export const MIN_DOMINANT_SHARE = 0.3;

/**
 * Dominant color of a bitmap: pixels are grouped into coarse buckets and the mean of the
 * largest bucket is returned. Returns null when the buffer does not match the size, when no
 * pixel is opaque enough, or when no bucket holds at least MIN_DOMINANT_SHARE of the pixels
 * (a busy strip has no single page color; the top bar then keeps the default theme, R20.6).
 */
export function dominantBitmapColor(
  bitmap: Uint8Array,
  width: number,
  height: number,
  order: PixelOrder = 'bgra',
): Rgba | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (bitmap.length !== width * height * 4) return null;
  const [ri, bi] = order === 'bgra' ? [2, 0] : [0, 2];

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    if (bitmap[i + 3] < MIN_PIXEL_ALPHA) continue;
    const r = bitmap[i + ri];
    const g = bitmap[i + 1];
    const b = bitmap[i + bi];
    const key = ((r >> BUCKET_SHIFT) << 8) | ((g >> BUCKET_SHIFT) << 4) | (b >> BUCKET_SHIFT);
    const acc = buckets.get(key);
    if (acc) {
      acc.n += 1;
      acc.r += r;
      acc.g += g;
      acc.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
    opaque += 1;
  }
  if (opaque === 0) return null;

  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const acc of buckets.values()) {
    if (!best || acc.n > best.n) best = acc;
  }
  if (!best || best.n / opaque < MIN_DOMINANT_SHARE) return null;
  return {
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n),
    a: 1,
  };
}
