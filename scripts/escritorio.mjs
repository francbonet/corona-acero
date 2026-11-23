/**
 * Empaqueta la versión de escritorio con electron-builder: `node scripts/escritorio.mjs mac|win|linux`
 * (los scripts `npm run escritorio:mac` y compañía hacen antes el build web).
 *
 * electron-builder no acepta rutas con caracteres especiales del shell (la carpeta del proyecto lleva un «&»),
 * así que se empaqueta en una carpeta temporal con solo lo necesario (el build de dist/, el proceso principal de
 * Electron y el icono) y los instaladores se copian después a `release/`. La configuración es la del campo
 * "build" de package.json.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PLATFORMS = { mac: 'MAC', win: 'WINDOWS', linux: 'LINUX' };

const platform = process.argv[2] ?? 'mac';
if (!(platform in PLATFORMS)) {
  console.error(`Plataforma desconocida: ${platform} (mac, win o linux)`);
  process.exit(1);
}
if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('Falta el build web: ejecuta antes `npm run build`.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;

// Carpeta temporal sin caracteres especiales, con lo justo para la aplicación.
const stage = join(tmpdir(), 'corona-y-acero-escritorio');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const dir of ['dist', 'electron', 'build']) cpSync(join(ROOT, dir), join(stage, dir), { recursive: true });
// package.json mínimo: sin dependencias (el build de Vite ya lo lleva todo dentro).
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, description: pkg.description, author: pkg.author, main: pkg.main }, null, 2),
);

const { build, Platform } = require('electron-builder');
const config = {
  ...pkg.build,
  electronVersion,
  directories: { ...pkg.build.directories, output: join(stage, 'release') },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
};

const started = Date.now();
await build({ projectDir: stage, targets: Platform[PLATFORMS[platform]].createTarget(), config });

// Los instaladores, al release/ del proyecto.
const out = join(ROOT, 'release');
mkdirSync(out, { recursive: true });
const made = [];
for (const name of readdirSync(join(stage, 'release'))) {
  const from = join(stage, 'release', name);
  if (!statSync(from).isFile() || !/\.(dmg|zip|exe|AppImage|blockmap)$/.test(name) || name.endsWith('.blockmap')) continue;
  cpSync(from, join(out, name));
  made.push(`${name} (${(statSync(from).size / 1048576).toFixed(1)} MB)`);
}
// Las aplicaciones sin empaquetar (para probarlas sin instalar), también.
for (const name of readdirSync(join(stage, 'release'))) {
  const from = join(stage, 'release', name);
  if (statSync(from).isDirectory() && /^(mac|win|linux)/.test(name)) cpSync(from, join(out, name), { recursive: true, verbatimSymlinks: true });
}
console.log(`\nListo en ${((Date.now() - started) / 1000).toFixed(0)} s. En release/:\n  ${made.join('\n  ')}`);
