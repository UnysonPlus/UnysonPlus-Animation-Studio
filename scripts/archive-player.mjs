// Publishes the player at a permanent, versioned address: apps/studio/public/player/<version>/.
//
// Embedded scenes load the player from that address, so a published version must never change.
// This script copies a new version in, leaves an unchanged one alone, and stops the build if the
// player's code changed without its version being bumped. Commit the folder it creates: the site is
// rebuilt from the repository on every deploy, so only committed versions stay online.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'packages/player/package.json'), 'utf8'));
const built = readFileSync(join(root, 'packages/player/dist/scene-player.iife.js'), 'utf8');
const dir = join(root, 'apps/studio/public/player', version);
const target = join(dir, 'scene-player.js');
const banner = `/*! Unyson+ scene player ${version} | https://github.com/UnysonPlus/UnysonPlus-Animation-Studio */\n`;
const content = banner + built;
const normal = (s) => s.replace(/\r\n/g, '\n');

if (existsSync(target)) {
  if (normal(readFileSync(target, 'utf8')) === normal(content)) {
    console.log(`player ${version}: already published, unchanged`);
  } else {
    console.error(
      `\nThe scene player changed, but version ${version} is already published at player/${version}/.\n` +
      `Published versions must never change (embedded scenes depend on them).\n` +
      `Bump packages/player/package.json, then build again.\n`,
    );
    process.exit(1);
  }
} else {
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, content);
  console.log(`player ${version}: published to apps/studio/public/player/${version}/ (commit this folder)`);
}
