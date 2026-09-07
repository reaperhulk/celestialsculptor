import {spawnSync} from 'node:child_process';import {openSync,closeSync} from 'node:fs';
function run(command,args,output){const fd=output?openSync(output,'w'):null;try{const r=spawnSync(command,args,{stdio:['ignore',fd??'inherit','inherit']});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${command} qualification failed (${r.status})`);}finally{if(fd!==null)closeSync(fd);}}
run('cargo',['run','--release','--locked','-p','celestial-sim','--example','qualify'],'numerical-raw.json');
run(process.env.QUALIFICATION_PYTHON||'python3',['scripts/qualify-numerics.py','numerical-raw.json']);
run('cargo',['run','--release','--locked','-p','celestial-sim','--example','qualify-tree'],'tree-raw.json');
run(process.execPath,['scripts/qualify-tree.mjs','tree-raw.json']);
