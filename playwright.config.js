import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:true,forbidOnly:Boolean(process.env.CI),retries:process.env.CI?1:0,
 workers:2,timeout:30000,reporter:process.env.CI?[['github'],['html',{open:'never'}]]:'list',
 use:{channel:'chromium',baseURL:'http://127.0.0.1:4173/celestialsculptor/',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 projects:[{name:'desktop',use:{browserName:'chromium',viewport:{width:1366,height:768}}},{name:'phone',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
 webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173/celestialsculptor/',reuseExistingServer:!process.env.CI,timeout:10000},
});
