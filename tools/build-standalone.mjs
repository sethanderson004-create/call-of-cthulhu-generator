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
  for (const [, names, dep] of source.matchAll(IMPORT)) {
    // Inlining flattens every module into one scope, so a renamed import
    // (`x as y`) would leave `y` undefined in the bundle while the served
    // version works perfectly. Catch it here rather than in the browser.
    if (/\bas\b/.test(names)) {
      throw new Error(`${specifier}: renamed import (${names.trim()}) cannot be inlined — import it under its own name`);
    }
    await inline(dep, url, seen, chunks);
  }

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

// Inlining flattens every module and the page's own script into one scope, so
// a name used twice becomes a syntax error in the bundle while the served
// version, with real module boundaries, works fine. Catch it at build time.
const declarations = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const seenNames = new Map();
for (const [source, label] of [...chunks.map((c, i) => [c, `module ${i + 1}`]), [ui, 'the page script']]) {
  for (const [, name] of source.matchAll(declarations)) {
    if (seenNames.has(name)) {
      throw new Error(`name collision: "${name}" is declared in ${seenNames.get(name)} and again in ${label} — inlining puts them in one scope, so one of them must be renamed`);
    }
    seenNames.set(name, label);
  }
}

const bundled = page.slice(0, start + scriptOpen.length)
  + `\n${chunks.join('\n')}\n// ---- interface ----${ui.replace(IMPORT, '')}`
  + page.slice(end);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, bundled);
console.log(`wrote ${out} (${(bundled.length / 1024).toFixed(0)} KB)`);
