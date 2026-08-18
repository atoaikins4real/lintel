// Audit: every statically-required package must be declared in
// package.json.
//
// Why this exists: Netlify's function bundler (zip-it-and-ship-it)
// resolves require() calls STATICALLY, before any code runs. A literal
// require('some-package') fails the entire deploy with "Cannot find
// module" even when it sits inside a try/catch that would never execute
// — which is exactly how an optional dependency broke a deploy once.
//
// Run with: npm run audit:deps
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const pkg = require('./package.json');
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]);

const SRC = path.join(__dirname, 'src');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
})(SRC);

let missing = 0;
let checked = 0;

for (const file of files) {
  const rel = path.relative(__dirname, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');

  // Only literal string requires — a computed name (require(varName)) is
  // invisible to the bundler too, which is the supported way to make a
  // dependency genuinely optional.
  const re = /require\(\s*'([^']+)'\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('/')) continue; // local file

    checked++;
    const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (builtinModules.includes(base)) continue;
    if (declared.has(base)) continue;

    const line = src.slice(0, m.index).split('\n').length;
    console.log(`MISSING  ${rel}:${line}  require('${spec}')`);
    console.log(`         "${base}" is not in package.json — this will fail the Netlify function bundler.`);
    console.log(`         Either add it as a dependency, or build the name at runtime if it's optional.`);
    missing++;
  }
}

console.log(
  `\n${checked} package require(s) checked; ${missing} not declared.` +
    (missing ? '' : ' Safe to bundle.')
);
process.exit(missing === 0 ? 0 : 1);
