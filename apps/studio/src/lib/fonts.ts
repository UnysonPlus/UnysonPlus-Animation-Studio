import type { Scene } from '@unysonplus/scene-player/types';

/**
 * Packs a scene's web fonts into the exported page, so it works offline and loads nothing from a font
 * service. Hosted font stylesheets usually split a family into character sets (latin, latin-ext,
 * cyrillic…); the Latin sets are embedded and any others stay linked, which keeps the file small
 * while text in other scripts still renders.
 */

const EMBEDDED_SUBSETS = ['latin', 'latin-ext'];

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const mimeFor = (url: string) =>
  /\.woff2(\?|$)/i.test(url) ? 'font/woff2' : /\.woff(\?|$)/i.test(url) ? 'font/woff' : /\.ttf(\?|$)/i.test(url) ? 'font/ttf' : 'font/woff2';

export interface EmbeddedFonts {
  /** @font-face rules to place in the page's <style>. */
  css: string;
  /** The scene with the embedded fonts' stylesheet links removed. */
  scene: Scene;
  /** Bytes added to the page by the embedded font files. */
  bytes: number;
}

export async function embedFonts(scene: Scene): Promise<EmbeddedFonts> {
  const fonts = scene.stage.fonts ?? [];
  let css = '';
  let bytes = 0;
  for (const font of fonts) {
    if (!font.href) continue;
    const res = await fetch(font.href);
    if (!res.ok) throw new Error(`Couldn't load the stylesheet for “${font.family}” (HTTP ${res.status}).`);
    const sheet = await res.text();

    // Each block, with the character-set comment that precedes it when the service provides one.
    const blocks = [...sheet.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{[^}]*\}/g)].map((m) => ({ subset: m[1] ?? null, rule: m[0] }));
    const labelled = blocks.some((b) => b.subset);
    for (const b of blocks) {
      const embed = !labelled || (b.subset !== null && EMBEDDED_SUBSETS.includes(b.subset));
      let rule = b.rule.replace(/^\/\*[^*]*\*\/\s*/, '');
      if (embed) {
        const urls = [...rule.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
        for (const url of urls) {
          const file = await fetch(new URL(url, font.href).href);
          if (!file.ok) throw new Error(`Couldn't download a font file for “${font.family}” (HTTP ${file.status}).`);
          const buf = await file.arrayBuffer();
          bytes += buf.byteLength;
          rule = rule.split(url).join(`data:${mimeFor(url)};base64,${toBase64(buf)}`);
        }
      } else {
        // Leave this character set linked; make its address absolute so it still resolves.
        rule = rule.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (_, u: string) => `url(${new URL(u, font.href).href})`);
      }
      css += `${rule}\n`;
    }
  }
  return {
    css,
    bytes,
    scene: { ...scene, stage: { ...scene.stage, fonts: fonts.map((f) => ({ family: f.family })) } },
  };
}
