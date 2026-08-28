// Bundle Monopolis into a single self-contained HTML file.
//
// The playable page imports its modules as ES modules, which needs a server.
// This inlines the whole local module graph into the page so the result can be
// opened straight from disk, with no build tooling and nothing to keep in sync
// by hand. Remote play still needs the server; this is the offline build.
//
//   node tools/build-standalone.mjs [outfile]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const root = new URL('..', import.meta.url);
const out = process.argv[2] ?? new URL('dist/monopolis.html', root).pathname;

const IMPORT = /^import\s+\{([\s\S]*?)\}\s+from\s+'(\.[^']+)';$/gm;

/** Depth-first inline of a module and everything it imports, each once. */
async function inline(specifier, base, seen, chunks) {
  const url = new URL(specifier, base);
  if (seen.has(url.href)) return;
  seen.add(url.href);

  const source = await readFile(url, 'utf8');
  for (const [, , dep] of source.matchAll(IMPORT)) await inline(dep, url, seen, chunks);

  // Every export in these modules is a declaration (`export function`,
  // `export const`), so dropping the keyword leaves valid top-level code.
  chunks.push(`// ---- ${specifier.replace('./', '')} ----\n`
    + source.replace(IMPORT, '').replace(/^export /gm, ''));
}

const page = await readFile(new URL('monopolis.html', root), 'utf8');
const scriptOpen = '<script type="module">';
const start = page.indexOf(scriptOpen);
const end = page.indexOf('</script>', start);
if (start === -1 || end === -1) throw new Error('could not find the page module script');

const ui = page.slice(start + scriptOpen.length, end);
const chunks = [];
const seen = new Set();
for (const [, , dep] of ui.matchAll(IMPORT)) await inline(dep, new URL('monopolis.html', root), seen, chunks);

const bundled = page.slice(0, start + scriptOpen.length)
  + `\n${chunks.join('\n')}\n// ---- interface ----${ui.replace(IMPORT, '')}`
  + page.slice(end);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, bundled);
console.log(`wrote ${out} (${(bundled.length / 1024).toFixed(0)} KB)`);
