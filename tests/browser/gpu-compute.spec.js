import {writeFile} from 'node:fs/promises';
import {test,expect} from './fixtures.js';
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
