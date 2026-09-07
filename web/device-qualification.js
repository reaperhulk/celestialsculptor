import {deviceScenario} from './device-test.js';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
// Reports are evidence for one workload and build, not a device-wide guarantee.
export const DEVICE_TARGETS={activeSeconds:300,fps:55,p95FrameMs:20,pace:.9};
export function qualifyDevice(report,revision,wasmHash){
 const reasons=[];report=report&&typeof report==='object'&&!Array.isArray(report)?report:{};
 if(report.dirty!==false||!wasmHash||report.wasmHash!==wasmHash)reasons.push('Exact clean WASM build not matched');
 if(report.quality?.maxDpr!==2||report.quality?.reduceMotion!==false)reasons.push('High-quality rendering target not recorded');
 if(report?.format!=='celestial-device-recording'||report.version!==2)reasons.push('Unsupported report');
 if(!revision||report.revision!==revision)reasons.push('Different or missing build revision');
 for(const field of ['activeSeconds','fps','p95FrameMs','throughputRatio','frames','maxFrameMs'])if(!Number.isFinite(report[field])||report[field]<0)reasons.push(`Invalid ${field}`);
 if(report.reason!=='completed'||report.activeSeconds<DEVICE_TARGETS.activeSeconds)reasons.push('Five active minutes not completed');
 if(!report.physicalDevice||typeof report.deviceModel!=='string'||!report.deviceModel.trim()||!['desktop','iphone','ipad','android','other'].includes(report.deviceClass))reasons.push('Physical hardware not identified');
 if(report.fps<DEVICE_TARGETS.fps||report.p95FrameMs>DEVICE_TARGETS.p95FrameMs)reasons.push('Display target missed');
 if(report.throughputRatio<DEVICE_TARGETS.pace)reasons.push('Simulation pace target missed');
 if(!['stress','moons','nursery','swarm1024','swarm4096','swarm8192'].includes(report.scenario))reasons.push('No reproducible standard workload');
 else{const expected=deviceScenario(report.scenario);if(report.replay?.version!==7||canonical(report.replay.config)!==canonical(expected.config)||canonical(report.replay.commands)!==canonical(expected.commands))reasons.push('Recorded conditions differ from the standard workload');}
 return {qualified:reasons.length===0,reasons,device:report.deviceModel||'Unidentified',deviceClass:report.deviceClass||'unknown',scenario:report.scenario,revision:report.revision,activeSeconds:report.activeSeconds,fps:report.fps,p95FrameMs:report.p95FrameMs,throughputRatio:report.throughputRatio};
}
export function aggregateDevices(reports,revision,wasmHash){const results=reports.map(r=>qualifyDevice(r,revision,wasmHash));return {schema:1,revision,wasmHash,targets:DEVICE_TARGETS,results,required:['desktop','iphone','ipad'].map(deviceClass=>({deviceClass,status:results.some(r=>r.deviceClass===deviceClass&&r.qualified)?'qualified workloads available':'pending physical evidence'}))};}
