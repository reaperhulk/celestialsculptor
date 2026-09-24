// Qualification runs may execute on separate machines, each writing the same
// header with only its own runs. Merge them into the single raw document the
// gates read, refusing outputs whose headers (physics, fixture, horizon)
// disagree or that repeat a run.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export function mergeRaw(documents, key) {
  assert.ok(documents.length > 0, 'At least one raw qualification output');
  const header = ({ runs: _runs, ...rest }) => JSON.stringify(rest);
  const runs = [];
  for (const document of documents) {
    assert.equal(header(document), header(documents[0]), 'Raw outputs describe different runs');
    for (const run of document.runs) {
      assert.ok(!runs.some((seen) => key(seen) === key(run)), `Repeated run ${key(run)}`);
      runs.push(run);
    }
  }
  return { ...documents[0], runs };
}
export async function readRaw(paths, key) {
  return mergeRaw(
    await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, 'utf8')))),
    key,
  );
}
