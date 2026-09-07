import {writeFile} from 'node:fs/promises';
import {test,expect} from './fixtures.js';
test.describe.configure({mode:'serial'});
test('tiled WebGPU forces agree with the independent double-precision oracle',async({page},testInfo)=>{
 const software=testInfo.project.name==='gpu-compute',metal=testInfo.project.name==='gpu-metal';
 test.skip(!software&&!(metal&&process.platform==='darwin'),'Dedicated GPU qualification projects');test.setTimeout(90000);
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();
 const report=await page.evaluate(async({fallback})=>{const {runGpuBenchmark}=await import('./gpu-benchmark.js');return runGpuBenchmark({counts:fallback?[63,65,257,1024]:[63,65,257,1024,4096,8192],rounds:3,fallback});},{fallback:software});
 await writeFile(testInfo.outputPath('gpu-comparison.json'),JSON.stringify(report,null,2));
 if(!report.supported&&metal)test.skip(true,'This hosted ARM64 runner exposes no hardware WebGPU adapter');
 expect(report.supported,'The configured WebGPU adapter must execute the shader').toBe(true);expect(report.cases).toHaveLength(software?5:7);
 for(const result of report.cases){expect(result.rmsRelativeError).toBeLessThan(.001);expect(result.p99RelativeError).toBeLessThan(.005);expect(result.gpuRoundTripMs).toBeGreaterThan(0);expect(result.directMs).toBeGreaterThan(0);expect(result.treeMs).toBeGreaterThan(0);expect(result.samples.gpu).toHaveLength(3);}
 expect(report.livePhysicsEnabled).toBe(false);
});

test('GPU-resident integration qualifies moving orbits and moon drift',async({page},testInfo)=>{
 const software=testInfo.project.name==='gpu-compute',metal=testInfo.project.name==='gpu-metal';
 test.skip(!software&&!(metal&&process.platform==='darwin'),'Dedicated GPU qualification projects');test.setTimeout(120000);
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();
 const report=await page.evaluate(async({fallback})=>{const {runGpuOrbitBenchmark}=await import('./gpu-orbit-benchmark.js');return runGpuOrbitBenchmark({counts:fallback?[65,1024]:[65,1024,4096,8192],rounds:3,fallback});},{fallback:software});
 await writeFile(testInfo.outputPath('gpu-orbits.json'),JSON.stringify(report,null,2));
 if(!report.supported&&metal)test.skip(true,'No hardware WebGPU adapter');
 expect(report.supported).toBe(true);expect(report.livePhysicsEnabled).toBe(false);expect(report.batchInvariant).toBe(true);
 for(const result of report.cases){expect(result.positionRms).toBeLessThan(.001);expect(result.velocityRms).toBeLessThan(.001);expect(result.cpuMsPerTick).toBeGreaterThan(0);expect(result.gpuMsPerTick).toBeGreaterThan(0);expect(result.samples.gpu).toHaveLength(3);}
 expect(report.trajectory.positionRms).toBeLessThan(.001);expect(report.trajectory.velocityRms).toBeLessThan(.001);
 for(const phase of report.trajectory.moonPhaseErrorsRadians)expect(phase).toBeLessThan(.01);
 expect(Math.abs(report.trajectory.relativeEnergyDrift)).toBeLessThan(.0001);expect(report.trajectory.momentumResidual).toBeLessThan(.0001);
});

test('mixed precision keeps f64 state and includes transfer overhead',async({page},testInfo)=>{
 const software=testInfo.project.name==='gpu-compute',metal=testInfo.project.name==='gpu-metal';test.skip(!software&&!(metal&&process.platform==='darwin'),'Dedicated GPU qualification projects');test.setTimeout(120000);
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();const report=await page.evaluate(async fallback=>{const {runMixedBenchmark}=await import('./gpu-mixed-probe.js');return runMixedBenchmark({fallback});},software);
 await writeFile(testInfo.outputPath('gpu-mixed.json'),JSON.stringify(report,null,2));if(!report.supported&&metal)test.skip(true,'No hardware adapter');expect(report.supported).toBe(true);expect(report.livePhysicsEnabled).toBe(false);for(const row of report.cases){expect(row.positionRms).toBeLessThan(.001);expect(row.gpuMs).toBeGreaterThan(0);}
});

test('GPU lifetime stops at the first long-run accuracy failure',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='gpu-metal'||process.platform!=='darwin','Long-run candidate evidence uses the hardware adapter');test.setTimeout(600000);
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();const report=await page.evaluate(async()=>{const {runGpuLifetime}=await import('./gpu-lifetime.js');return runGpuLifetime();});await writeFile(testInfo.outputPath('gpu-lifetime.json'),JSON.stringify(report,null,2));if(!report.supported)test.skip(true,'No hardware adapter');expect(report.livePhysicsEnabled).toBe(false);expect(report.completedYears).toBeGreaterThan(0);expect(['rejected','passed requested horizon']).toContain(report.status);
});
