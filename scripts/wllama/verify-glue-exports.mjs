#!/usr/bin/env node
/**
 * verify-glue-exports.mjs — checks that all three glue bundles export
 * the same public surface (Wllama, WllamaError, WllamaAbortError).
 *
 * Usage:
 *   node scripts/wllama/verify-glue-exports.mjs <glue-dir>
 *
 * <glue-dir> should be the directory containing index.js, webgpu-index.js,
 * and mem64-index.js (i.e. src/vendor/wllama/).
 *
 * Exits 0 if all present bundles have matching exports; exits 1 otherwise.
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

const glueDir = resolve(process.argv[2] ?? 'src/vendor/wllama');

const BUNDLES = [
  'index.js',
  'webgpu-index.js',
  'mem64-index.js',
];

const results = [];

for (const name of BUNDLES) {
  const filePath = join(glueDir, name);
  if (!existsSync(filePath)) {
    console.log(`[verify-glue-exports] SKIP ${name} — not found`);
    continue;
  }
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const keys = Object.keys(mod).sort();
    results.push({ name, keys });
    console.log(`[verify-glue-exports] ${name}: exports = [${keys.join(', ')}]`);
  } catch (err) {
    console.error(`[verify-glue-exports] ERROR loading ${name}: ${err.message}`);
    process.exit(1);
  }
}

if (results.length < 2) {
  console.log('[verify-glue-exports] Less than 2 bundles found — skipping comparison');
  process.exit(0);
}

const reference = results[0];
let mismatch = false;

for (const { name, keys } of results.slice(1)) {
  const refStr = reference.keys.join(',');
  const curStr = keys.join(',');
  if (refStr !== curStr) {
    console.error(`[verify-glue-exports] MISMATCH: ${name} exports differ from ${reference.name}`);
    console.error(`  ${reference.name}: [${refStr}]`);
    console.error(`  ${name}:           [${curStr}]`);
    mismatch = true;
  }
}

if (mismatch) {
  process.exit(1);
}

console.log('[verify-glue-exports] All present bundles have matching export surface — OK');
