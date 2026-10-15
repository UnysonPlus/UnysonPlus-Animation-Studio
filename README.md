# Unyson+ Animation Studio

A browser studio for timeline motion graphics: kinetic type, shapes, images and (later) 3D, laid out on a
timeline and exported as **plain HTML** for website heroes and sections, not video.

Live at **https://animation-studio.unysonplus.com/**. The plan and roadmap are on the docs site:
https://docs.unysonplus.com/animation-studio

## What's here

| Folder | What it is |
|---|---|
| `packages/player` | The scene player: the scene file format (`schema/scene.schema.json`), its validator, the responsive stage, the preset catalogue and the GSAP timeline builder. Builds to `dist/scene-player.iife.js` (the self-contained script exported pages load) and `dist/scene-editor.iife.js` (the Studio's in-preview editor: selection, dragging, resizing and in-place text editing; never shipped in exports). |
| `apps/studio` | The Studio web app (React + TypeScript + Vite): a preset library, a device-sized preview you edit directly (select one or many, drag, resize, double-click to edit text, Align and Distribute, lock layers), a timeline (drag, trim, zoom, drop presets), an inspector with per-breakpoint layouts, undo and redo, browser autosave, project files (`.scene.json`) and HTML export. |

## Develop

Requires Node.js 20 or newer.

```
npm install
npm run dev        # builds the player, then serves the Studio at http://localhost:5173
npm run build      # production build into apps/studio/dist
npm run typecheck
```

After changing the player, run `npm run build:player` (the Studio inlines the built player into its preview
and its exported files).

## The scene file in brief

A scene has a **stage** (an aspect ratio per breakpoint, a height mode and a safe area), **layers** drawn
bottom to top (text, shapes, images), and on each layer the **clips** that animate it. A clip is a preset
placed in time with its own settings. Positions are percentages of the stage and sizes are "stage units"
(1 = 1% of the stage width), so a scene draws the same at any size. Each breakpoint can override a layer's
position, size and type; the clips are shared.

Height modes:

- `ratio` keeps the shape; the page scrolls if the stage is taller than the window.
- `ratio-capped` keeps the shape but never grows taller than the window; the designed frame is trimmed
  top and bottom, which the safe area allows for.
- `fill` is exactly one window tall.

Presets (22): text `text-rise`, `text-slam`, `text-stretch`, `text-scramble`, `text-typewriter`, `text-blur`,
`text-flip`, `text-tracking`; reveal and exit `fade`, `wipe`, `iris`, `slide`, `grow`; move and scale `pop`,
`zoom`, `spin`, `keyframes`; emphasis `text-wave`, `pulse`, `shake`, `float`, `recolor`. Their settings are
described in `packages/player/src/presets/catalog.ts`, which the Studio uses to build its forms.

## Keyboard

| Keys | Does |
|---|---|
| Space | Play or pause |
| Home | Go to the start |
| `,` and `.` | Step one frame back or forward (Shift: one second) |
| Arrow keys | Nudge the selected layer (Shift: further), move the selected clip in time, or step the playhead |
| Delete | Delete the selected clip or layer |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |
| Ctrl+D | Duplicate the selected layer |
| Ctrl+S | Save the project file |
| Shift or Ctrl + click | Add a layer to (or remove it from) the selection, on the stage or the timeline |
| Drag on empty stage | Box-select the layers it touches (Shift or Ctrl adds to the selection) |
| Ctrl+A | Select every unlocked layer |
| Escape | Clear the selection |
| Alt while dragging | Turn snapping off |

## Exporting

**Export** in the Studio offers two things:

- **Web page:** one `.html` file carrying the scene and its own copy of the player. Optionally embeds the
  web fonts (Latin character sets) so the page works offline and loads nothing from a font service.
- **Embed code:** the scene inline, plus a `<script>` that loads the player from its permanent, versioned
  address, for pasting into any page (for example a Custom HTML block in WordPress):

```html
<div data-upw-scene>
  <script type="application/json">{ ...scene file... }</script>
</div>
<script src="https://animation-studio.unysonplus.com/player/0.0.2/scene-player.js" defer></script>
```

### Player versions are permanent

Every player version is published once, at `apps/studio/public/player/<version>/`, and never changes, so an
embedded scene keeps playing exactly as it was made. `npm run build:player` publishes a new version
automatically and **stops the build if the player's code changed without a version bump** in
`packages/player/package.json`. Commit the new folder: the site is rebuilt from the repository on each
deploy, so only committed versions stay online.

## Release stage

The Studio is in **alpha**: features are still missing and the scene file format may change between
versions. Exported pages and embeds keep working regardless, since they carry or pin their player.

## Deploy

Pushing to `main` builds the Studio and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
