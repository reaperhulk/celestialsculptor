import {spawnSync} from 'node:child_process';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const steps=[['cargo',['fmt','--all','--check']],['cargo',['clippy','--workspace','--all-targets','--locked','--','-D','warnings']],['cargo',['test','--workspace','--release','--locked']],[npm,['run','build']],[npm,['run','check']],[npm,['test']]];
for(const [command,args] of steps){console.log(`\n> ${command} ${args.join(' ')}`);const result=spawnSync(command,args,{stdio:'inherit'});if(result.error||result.status!==0){console.error(result.error?.message||'Verification failed.');process.exit(result.status||1);}}
console.log('\nHeadless verification passed. Browser integration runs separately in GitHub Actions.');
