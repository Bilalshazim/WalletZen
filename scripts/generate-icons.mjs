/**
 * Builds every logo/icon asset from the two brand sources in /brand:
 *   logo-light-source.png  navy wallet on white  -> light theme + install icons
 *   logo-dark-source.png   dark wallet on black  -> dark theme
 *
 * Run with `npm run icons` after replacing a source image.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'public';
const VARIANTS = {
  light: { source: 'brand/logo-light-source.png', background: '#FFFFFF' },
  dark: { source: 'brand/logo-dark-source.png', background: '#000000' },
};
// The wallet mark sits above the wordmark; this band of the 2000px source excludes the text.
const MARK_BAND = { top: 300, height: 1000 };

/** Makes the background transparent by flood-filling from the edges, with anti-aliased borders. */
async function removeBackground(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const bg = [data[0], data[1], data[2]];
  const diff = (p) => Math.abs(data[p] - bg[0]) + Math.abs(data[p + 1] - bg[1]) + Math.abs(data[p + 2] - bg[2]);
  const HARD = 24; // fully background below this distance
  const SOFT = 150; // partially transparent up to this distance (edge anti-aliasing)

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);

  while (stack.length) {
    const idx = stack.pop();
    if (seen[idx]) continue;
    seen[idx] = 1;
    const p = idx * 4;
    const d = diff(p);
    if (d >= SOFT) continue;

    const alpha = d <= HARD ? 0 : (d - HARD) / (SOFT - HARD);
    // Un-blend the background so edge pixels keep the foreground color.
    for (let c = 0; c < 3; c++) {
      data[p + c] = alpha ? Math.max(0, Math.min(255, Math.round((data[p + c] - bg[c] * (1 - alpha)) / alpha))) : 0;
    }
    data[p + 3] = Math.round(alpha * 255);

    const x = idx % width;
    if (x > 0) stack.push(idx - 1);
    if (x < width - 1) stack.push(idx + 1);
    if (idx >= width) stack.push(idx - width);
    if (idx < width * (height - 1)) stack.push(idx + width);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png();
}

const trimmed = async (img) => sharp(await img.toBuffer()).trim({ threshold: 1 }).png().toBuffer();

/** Square icon: the mark centered on a solid or transparent square with the given padding ratio. */
async function squareIcon(mark, size, padding, background) {
  const inner = Math.round(size * (1 - padding * 2));
  const resized = await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** ICO container holding a single PNG image (supported by every modern browser). */
function pngToIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

mkdirSync(`${OUT}/brand`, { recursive: true });
const marks = {};

for (const [name, { source }] of Object.entries(VARIANTS)) {
  const clean = await removeBackground(source);
  const cleanBuffer = await clean.toBuffer();

  const lockup = await trimmed(sharp(cleanBuffer));
  await sharp(lockup).resize({ width: 640 }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(`${OUT}/brand/logo-${name}.png`);

  const mark = await trimmed(sharp(cleanBuffer).extract({ left: 0, top: MARK_BAND.top, width: 2000, height: MARK_BAND.height }));
  marks[name] = mark;
  await sharp(mark).resize({ width: 256 }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(`${OUT}/brand/mark-${name}.png`);

  // Theme-aware browser-tab favicons.
  writeFileSync(`${OUT}/favicon-${name}.png`, await squareIcon(mark, 64, 0.04));
}

// Install icons use the primary (light) brand mark on its white tile.
const white = { r: 255, g: 255, b: 255, alpha: 1 };
writeFileSync(`${OUT}/favicon.ico`, pngToIco(await squareIcon(marks.light, 48, 0.04), 48));
writeFileSync(`${OUT}/pwa-64x64.png`, await squareIcon(marks.light, 64, 0.1, white));
writeFileSync(`${OUT}/pwa-192x192.png`, await squareIcon(marks.light, 192, 0.12, white));
writeFileSync(`${OUT}/pwa-512x512.png`, await squareIcon(marks.light, 512, 0.12, white));
writeFileSync(`${OUT}/maskable-icon-512x512.png`, await squareIcon(marks.light, 512, 0.22, white));
writeFileSync(`${OUT}/apple-touch-icon-180x180.png`, await squareIcon(marks.light, 180, 0.14, white));

console.log('Brand assets written to /public');
