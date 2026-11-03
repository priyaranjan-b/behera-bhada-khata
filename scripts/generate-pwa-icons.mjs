// Renders the installed-app icons in public/icons/ from the brand tile in
// src/app/icon.svg. Run after changing the logo: node scripts/generate-pwa-icons.mjs
//
// - icon-192.png / icon-512.png: the rounded tile as is ("any" purpose).
// - maskable-512.png: a full-bleed square with the book inside the central
//   safe zone (Android crops it to a circle, squircle...).
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "public", "icons");
const tile = await readFile(path.join(root, "src", "app", "icon.svg"), "utf8");

// The book glyph and gradient from icon.svg, without the rounded tile.
const glyph = tile.match(/<g [\s\S]*<\/g>/)?.[0];
const gradient = tile.match(/<defs>[\s\S]*<\/defs>/)?.[0];
if (!glyph || !gradient) throw new Error("src/app/icon.svg no longer has the <defs> and <g> this script expects");

// The glyph spans 14.4..49.6 of 64 (55%), inside the 80% safe zone of a maskable icon.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  ${gradient}
  <rect width="64" height="64" fill="url(#tile)"/>
  ${glyph}
</svg>`;

await mkdir(out, { recursive: true });
const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toFile(path.join(out, file));

await render(tile, 192, "icon-192.png");
await render(tile, 512, "icon-512.png");
await render(maskable, 512, "maskable-512.png");
console.log(`Wrote icons to ${path.relative(root, out)}`);
