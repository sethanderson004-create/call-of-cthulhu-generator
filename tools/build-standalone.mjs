// Bundle Monopolis into a single self-contained HTML file.
//
// The playable page imports its engine as an ES module, which needs a server.
// This inlines the engine into the page so the result can be opened straight
// from disk (or published anywhere that serves one file), with no build
// tooling and nothing to keep in sync by hand.
//
//   node tools/build-standalone.mjs [outfile]

import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const out = process.argv[2] ?? new URL('dist/monopolis.html', root).pathname;

const page = await readFile(new URL('monopolis.html', root), 'utf8');
const engine = await readFile(new URL('src/monopolis.js', root), 'utf8');

// Every export in the engine is a declaration (`export function`, `export
// const`), so dropping the keyword leaves valid top-level code.
const inlined = engine.replace(/^export /gm, '');

const scriptOpen = '<script type="module">';
const start = page.indexOf(scriptOpen);
const end = page.indexOf('</script>', start);
if (start === -1 || end === -1) throw new Error('could not find the page module script');

const ui = page.slice(start + scriptOpen.length, end)
  .replace(/^import \{[\s\S]*?\} from '\.\/src\/monopolis\.js';$/m, '');

const bundled = page.slice(0, start + scriptOpen.length)
  + `\n// ---- engine (inlined from src/monopolis.js) ----\n${inlined}\n`
  + `// ---- interface ----${ui}`
  + page.slice(end);

await writeFile(out, bundled);
console.log(`wrote ${out} (${(bundled.length / 1024).toFixed(0)} KB)`);
