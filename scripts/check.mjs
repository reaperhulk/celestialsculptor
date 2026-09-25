import { verifyDomReferences } from './dom-contracts.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { assetManifest } from './integrity.mjs';
import { localReferences } from './references.mjs';
import { verifyToolchainContracts } from './contracts.mjs';
import { verifyStyleTokens } from './style-contracts.mjs';
import { verifyAssetBudget } from './budget.mjs';
import { minifySource, minified } from './minify.mjs';
import { SAVE_VERSION } from '../web/version.js';
import { resolve, dirname } from 'node:path';
for (const name of await readdir('web'))
  if (name.endsWith('.js')) {
    const r = spawnSync(process.execPath, ['--check', `web/${name}`], { stdio: 'inherit' });
    assert.equal(r.status, 0, `Syntax: ${name}`);
  }
const html = await readFile('web/index.html', 'utf8');
const modules = Object.fromEntries(
  await Promise.all(
    (await readdir('web'))
      .filter((name) => name.endsWith('.js'))
      .map(async (name) => [name, await readFile(`web/${name}`, 'utf8')]),
  ),
);
console.log('DOM coverage:', verifyDomReferences(html, modules));
for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) await readFile(`dist/${path}`);
assert.ok(
  (await readFile('dist/pkg/celestial_wasm_bg.wasm')).length > 8,
  'WASM artifact is missing',
);
// Link previews fetch the share image from the published site: it must ship.
const site = html.match(/<meta property="og:url" content="([^"]+)">/)?.[1];
const image = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
assert.ok(site && image?.startsWith(site), 'Open Graph image must live on the published site');
await readFile(`dist/${image.slice(site.length)}`);
console.log('Web modules, DOM contracts, and built entrypoints verified.');

const build = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
assert.equal(
  build.saveVersion,
  SAVE_VERSION,
  'web/version.js SAVE_VERSION differs from the engine',
);
assert.deepEqual(
  await assetManifest('dist'),
  build.assets,
  'Built assets differ from their integrity manifest',
);

for (const name of await readdir('web')) {
  const source = await readFile(`web/${name}`);
  const expected = minified(name)
    ? Buffer.from(await minifySource(name, source.toString()))
    : source;
  assert.deepEqual(
    await readFile(`dist/${name}`),
    expected,
    `Stale build: ${name}; run npm run build`,
  );
  if (name.endsWith('.js'))
    for (const reference of localReferences(source.toString())) {
      const target = resolve(dirname(`dist/${name}`), reference);
      assert.ok(target.startsWith(resolve('dist') + '/'), `Asset leaves build: ${reference}`);
      await readFile(target);
    }
}

await verifyToolchainContracts();

verifyStyleTokens(await readFile('web/style.css', 'utf8'));

console.log(
  'Uncompressed asset bytes:',
  verifyAssetBudget(build.assets, JSON.parse(await readFile('performance-budget.json', 'utf8'))),
);
