// Payload size is tracked, not gated: speed comes first, and size is kept down
// by review. Sizes over their targets are reported as warnings.
export function measurePayload(assets, targets) {
  const bytes = (match) =>
    Object.entries(assets)
      .filter(([path]) => match(path))
      .reduce((sum, [, asset]) => sum + asset.bytes, 0);
  const payload = {
    total: bytes(() => true),
    wasm: bytes((path) => path.endsWith('.wasm')),
    javascript: bytes((path) => path.endsWith('.js')),
  };
  const overTargets = [
    ['WebAssembly', payload.wasm, targets.wasmBytes],
    ['JavaScript', payload.javascript, targets.javaScriptBytes],
    ['Total payload', payload.total, targets.totalBytes],
  ]
    .filter(([, size, target]) => size > target)
    .map(([label, size, target]) => `${label} ${size} bytes is over its ${target}-byte target`);
  return { ...payload, overTargets };
}
// Print sizes, and each exceeded target as a warning (a CI annotation on GitHub).
export function reportPayload(payload) {
  console.log('Uncompressed asset bytes:', {
    total: payload.total,
    wasm: payload.wasm,
    javascript: payload.javascript,
  });
  for (const warning of payload.overTargets)
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${warning}` : `Warning: ${warning}`);
}
