import type { Scene } from '@unysonplus/scene-player/types';
import playerScript from '@unysonplus/scene-player/dist/scene-player.iife.js?raw';
import editorScript from '@unysonplus/scene-player/dist/scene-editor.iife.js?raw';

/**
 * Builds the two HTML documents the Studio produces from a scene: the preview page shown in the
 * iframe, and the standalone file people download. Both carry the same player and the same scene
 * file, so what the preview shows is what the download plays.
 */

/** JSON that is safe inside a <script> element (no "</script>" or "<!--" can end it early). */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** The player inlined into a page. */
const inlinePlayer = (autoMount: boolean) =>
  `<script${autoMount ? '' : ' data-auto-mount="false"'}>/* Unyson+ scene player ${__PLAYER_VERSION__} */\n${playerScript.replace(/<\/script/gi, '<\\/script')}</script>`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A complete, standalone page that plays the scene. */
export function exportHtml(scene: Scene): string {
  const title = escapeHtml(scene.title || 'Animation');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Unyson+ Animation Studio ${__STUDIO_VERSION__}">
<title>${title}</title>
<style>html,body{margin:0;background:#0a0d11}</style>
</head>
<body>
<div data-upw-scene>
<script type="application/json">${safeJson(scene)}</script>
</div>
${inlinePlayer(true)}
</body>
</html>
`;
}

/**
 * The preview page: the top of a website with the scene as its hero and page content below. The
 * editor script mounts the scene, draws selection handles and talks to the Studio (see editor.ts).
 */
export function previewHtml(scene: Scene, opts: { safeArea: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html,body{margin:0;background:#0a0d11;color:#c9d1da;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.page{padding:6vh 6vw 10vh;display:grid;gap:18px;max-width:1100px;margin:0 auto}
.page i{display:block;height:14px;border-radius:7px;background:#1b222b}
.page i:nth-child(1){width:38%;height:22px;background:#232b35}
.page i:nth-child(3){width:86%}
.page i:nth-child(4){width:72%}
.page p{margin:0;font-size:13px;color:#7d8794}
.err{margin:24px;padding:16px;border:1px solid #6b2a2a;border-radius:8px;background:#1c1214;color:#f2b8b5;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap}
</style>
</head>
<body data-safe="${opts.safeArea ? 'true' : 'false'}">
<div id="scene"></div>
<div class="page" aria-hidden="true"><i></i><p>The rest of the page continues below the scene.</p><i></i><i></i><i></i></div>
<script type="application/json" id="scene-json">${safeJson(scene)}</script>
${inlinePlayer(false)}
<script>${editorScript.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}
