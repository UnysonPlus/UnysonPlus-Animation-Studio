// Builds the outline font that 3D text is extruded from: Inter ExtraBold (SIL Open Font License 1.1,
// © The Inter Project Authors), Latin characters, in the JSON format three.js's FontLoader reads.
// The result is committed (packages/player/src/three/font-inter-800.json), so this only runs when the
// font or the character set changes:  node scripts/make-3d-font.mjs
import opentype from 'opentype.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const woff = require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff');
const buf = readFileSync(woff);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Printable ASCII plus common Latin-1 letters and typographic marks.
const chars = new Set();
for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
for (const ch of 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ–—‘’“”•…€£¥©®™°×÷') chars.add(ch);

const r = (n) => Math.round(n);
const glyphs = {};
for (const ch of chars) {
  const g = font.charToGlyph(ch);
  if (!g || (g.index === 0 && ch !== ' ')) continue;
  // opentype paths are y-down at size = unitsPerEm with the baseline at y = 0 when drawn at (0, 0)
  // with y flipped back; three expects y-up font units.
  const path = g.getPath(0, 0, font.unitsPerEm);
  const out = [];
  for (const c of path.commands) {
    if (c.type === 'M') out.push('m', r(c.x), r(-c.y));
    else if (c.type === 'L') out.push('l', r(c.x), r(-c.y));
    else if (c.type === 'Q') out.push('q', r(c.x), r(-c.y), r(c.x1), r(-c.y1));
    else if (c.type === 'C') out.push('b', r(c.x), r(-c.y), r(c.x1), r(-c.y1), r(c.x2), r(-c.y2));
  }
  const bb = g.getBoundingBox();
  glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o: out.join(' ') };
}

const json = {
  glyphs,
  familyName: 'Inter',
  ascender: r(font.ascender),
  descender: r(font.descender),
  underlinePosition: r(font.tables.post.underlinePosition),
  underlineThickness: r(font.tables.post.underlineThickness),
  boundingBox: { yMin: r(font.tables.head.yMin), xMin: r(font.tables.head.xMin), yMax: r(font.tables.head.yMax), xMax: r(font.tables.head.xMax) },
  resolution: font.unitsPerEm,
  original_font_information: { license: 'SIL Open Font License 1.1', copyright: 'Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)', fontFamily: 'Inter', fontSubfamily: 'ExtraBold' },
};
const target = join(root, 'packages/player/src/three/font-inter-800.json');
writeFileSync(target, JSON.stringify(json));
console.log(`3D font: ${Object.keys(glyphs).length} glyphs → ${target} (${Math.round(JSON.stringify(json).length / 1024)} KB)`);
