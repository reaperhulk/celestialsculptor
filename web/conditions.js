export function parseSeed(value){
 const seed=Number(value);
 if(String(value).trim()===''||!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('Use a whole-number seed from 0 to 4294967295.');
 return seed;
}
