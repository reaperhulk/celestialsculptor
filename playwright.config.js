import {defineConfig} from '@playwright/test';
const chromium={browserName:'chromium',channel:'chromium',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}};
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:true,forbidOnly:Boolean(process.env.CI),retries:process.env.CI?1:0,
 workers:2,timeout:30000,reporter:process.env.CI?[['github'],['html',{open:'never'}]]:'list',
 use:{baseURL:'http://127.0.0.1:4173/celestialsculptor/',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'firefox-engine',testMatch:/engine\.spec\.js/,use:{browserName:'firefox',viewport:{width:1280,height:720}}},{name:'webkit-engine',testMatch:/engine\.spec\.js/,use:{browserName:'webkit',viewport:{width:1280,height:720}}},{name:'desktop',use:{...chromium,viewport:{width:1366,height:768}}},{name:'phone',use:{...chromium,viewport:{width:390,height:844},isMobile:true,hasTouch:true}},{name:'small-phone',use:{...chromium,viewport:{width:320,height:568},isMobile:true,hasTouch:true}},{name:'tablet',use:{...chromium,viewport:{width:1024,height:768},hasTouch:true}},{name:'laptop',use:{...chromium,viewport:{width:1280,height:720}}},{name:'large-desktop',use:{...chromium,viewport:{width:1920,height:1080}}},{name:'landscape-phone',use:{...chromium,viewport:{width:844,height:390},hasTouch:true}}],
 webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173/celestialsculptor/',reuseExistingServer:!process.env.CI,timeout:10000},
});
