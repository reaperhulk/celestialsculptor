import {readFile,writeFile} from 'node:fs/promises';
import {aggregateDevices} from '../web/device-qualification.js';
const [manifest,...files]=process.argv.slice(2);if(!manifest)throw new Error('Usage: node scripts/qualify-devices.mjs build-info.json [report.json ...]');const build=JSON.parse(await readFile(manifest,'utf8'));
const reports=await Promise.all(files.map(async file=>JSON.parse(await readFile(file,'utf8')))),report=aggregateDevices(reports,build.revision,build.assets?.['pkg/celestial_wasm_bg.wasm']?.sha256);
await writeFile('device-qualification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
