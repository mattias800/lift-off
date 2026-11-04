import { readFile, writeFile } from 'node:fs/promises';

// Keep the standalone release self-contained, including the font licenses.
const notices = {};
for (const file of ['LICENSE', 'licenses/Barlow-Condensed-OFL.txt', 'licenses/DM-Sans-OFL.txt']) {
  notices[file] = await readFile(file, 'utf8');
}
const html = await readFile('dist/index.html', 'utf8');
const data = JSON.stringify(notices).replaceAll('<', '\\u003c');
const standalone = html.replace(
  '</body>',
  `<script type="application/json" id="license-notices">${data}</script></body>`,
);
await writeFile('dist/index.html', standalone);
await writeFile('dist/lift-off.html', standalone);
console.log('Standalone game packaged: dist/lift-off.html (fonts and licenses included)');
