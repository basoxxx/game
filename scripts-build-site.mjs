// Builds the GitHub Pages site: landing page at / and the playable web build at /play/
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || 'basoxxx/game';
rmSync('site', { recursive: true, force: true });
mkdirSync('site', { recursive: true });
cpSync('dist', 'site/play', { recursive: true });
cpSync('site-src', 'site', { recursive: true });
const html = readFileSync('site-src/index.html', 'utf8').replaceAll('__VERSION__', pkg.version).replaceAll('__REPO__', repo);
writeFileSync('site/index.html', html);
if (existsSync('public/icon.svg')) cpSync('public/icon.svg', 'site/icon.svg');
writeFileSync('site/.nojekyll', '');
console.log('Site built in ./site');
