// Stamps a new version onto every script and style address in the two pages.
//
// Why: browsers keep copies of files for a while. After an update, a browser
// could mix an old copy of one script with a new copy of another, and the page
// would fail to start. A new stamp makes every address new, so the browser
// fetches a matching set.
//
// Run this from the otter-poll folder before each update to the site:
//   node tools/stamp.mjs
//
// It rewrites index.html and instructor.html in place.

import fs from 'node:fs';

const stamp = process.argv[2] || new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const modules = fs
  .readdirSync('js')
  .filter((name) => name.endsWith('.js'))
  .sort();

// Scripts import each other by plain names like './util.js'. This block tells the
// browser to fetch the stamped address for each of those names.
const importMap = [
  '    <!-- importmap:start (written by tools/stamp.mjs) -->',
  '    <script type="importmap">',
  '      {',
  '        "imports": {',
  modules.map((name) => `          "./js/${name}": "./js/${name}?v=${stamp}"`).join(',\n'),
  '        }',
  '      }',
  '    </script>',
  '    <!-- importmap:end -->',
].join('\n');

for (const page of ['index.html', 'instructor.html']) {
  let html = fs.readFileSync(page, 'utf8');

  // Stamp every local script and the stylesheet.
  html = html.replace(/(href|src)="((?:js\/[\w.-]+\.js)|(?:css\/styles\.css))(?:\?v=[^"]*)?"/g, (match, attr, file) => `${attr}="${file}?v=${stamp}"`);

  // Put the import map before the first script preload, replacing an earlier one.
  const existing = /[ \t]*<!-- importmap:start[\s\S]*?<!-- importmap:end -->\r?\n/;
  if (existing.test(html)) {
    html = html.replace(existing, () => importMap + '\n');
  } else {
    const at = html.search(/[ \t]*(?:<!--[^\n]*-->\r?\n[ \t]*)?<link rel="modulepreload"/);
    if (at === -1) throw new Error(`${page}: no modulepreload link found`);
    html = html.slice(0, at) + importMap + '\n' + html.slice(at);
  }

  fs.writeFileSync(page, html);
  const count = (html.match(/\?v=/g) || []).length;
  console.log(`${page}: ${count} addresses stamped with ${stamp}`);
}
