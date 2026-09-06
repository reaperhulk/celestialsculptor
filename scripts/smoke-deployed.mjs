import {setTimeout} from 'node:timers/promises';
import {verifyPublished} from './published.mjs';
let last;
for(let attempt=0;attempt<10;attempt++){
 try{const result=await verifyPublished(process.env.SITE_URL,process.env.EXPECTED_SHA);console.log(`Published revision ${process.env.EXPECTED_SHA}: ${result.assets} asset hashes verified at ${result.url}`);process.exit(0);}
 catch(error){last=error;if(attempt<9)await setTimeout(3000);}
}
throw last;
