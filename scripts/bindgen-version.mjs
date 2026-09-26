// Prints the wasm-bindgen version the crate pins, which the binding generator
// CLI must match exactly. CI keys its CLI cache and install on it, so a
// dependency update needs no workflow edit.
import { verifyToolchainContracts } from './contracts.mjs';
const { bindgen } = await verifyToolchainContracts();
console.log(bindgen);
