/**
 * The player's stylesheet, injected once per document.
 *
 * Structure:  [data-upw-scene] > .upw-scene > .upw-stage > .upw-canvas > .upw-layer > .upw-li
 *   host    Whatever element holds the scene. Always as wide as its container, even inside a
 *           centring flex layout, which would otherwise shrink a box with no content width to 0.
 *   stage   The visible box. Its height follows the height mode; it clips whatever falls outside.
 *   canvas  The designed frame, always the breakpoint's exact shape and as wide as the stage,
 *           centred vertically. When the stage is shorter it is trimmed top and bottom (the safe area
 *           keeps key content clear of that); when taller, the stage background shows around it.
 *           It is the size container, so 1cqw = 1% of the stage width ("stage units").
 *   layer   Positioned and anchored. Never animated, so its own transform is free for anchoring.
 *   li      The animated element.
 */
export const PLAYER_CSS = `
[data-upw-scene]{display:block;width:100%;min-width:0;align-self:stretch;max-width:100%}
.upw-scene{position:relative;display:block;width:100%;--upw-ar:16/9;--upw-offset:0px}
.upw-stage{position:relative;display:block;width:100%;overflow:hidden;aspect-ratio:var(--upw-ar);isolation:isolate;contain:paint}
.upw-scene[data-mode="ratio-capped"] .upw-stage{max-height:calc(100vh - var(--upw-offset));max-height:calc(100svh - var(--upw-offset))}
.upw-scene[data-mode="fill"] .upw-stage{aspect-ratio:auto;height:calc(100vh - var(--upw-offset));height:calc(100svh - var(--upw-offset))}
.upw-canvas{position:absolute;left:0;top:50%;width:100%;aspect-ratio:var(--upw-ar);transform:translateY(-50%);container-type:size}
.upw-layer{position:absolute;box-sizing:border-box}
.upw-layer[data-hidden]{display:none}
.upw-li{display:block;width:100%;height:100%;box-sizing:border-box}
.upw-text .upw-li{height:auto}
.upw-group>.upw-li{position:relative;overflow:visible}
.upw-gproxy{position:absolute;left:0;top:0;width:100%;height:100%}
.upw-text .upw-txt{display:block}
.upw-w{display:inline-block;white-space:nowrap;vertical-align:top}
.upw-wi,.upw-c{display:inline-block}
.upw-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.upw-li img{display:block;width:100%;height:100%;border-radius:inherit}
.upw-3d{position:relative}
.upw-safe{position:absolute;pointer-events:none;border:1px dashed rgba(255,255,255,.6);box-shadow:0 0 0 1px rgba(0,0,0,.35);z-index:2147483000;display:none}
.upw-scene[data-safe] .upw-safe{display:block}
`;

export function injectStyles(doc: Document) {
  if (doc.getElementById('upw-scene-css')) return;
  const style = doc.createElement('style');
  style.id = 'upw-scene-css';
  style.textContent = PLAYER_CSS;
  doc.head.appendChild(style);
}

export function injectFonts(doc: Document, fonts: Array<{ family: string; href?: string }> = []) {
  for (const f of fonts) {
    if (!f.href) continue;
    const exists = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).some((l) => l.href === f.href);
    if (exists) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = f.href;
    doc.head.appendChild(link);
  }
}
