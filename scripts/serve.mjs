import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path.startsWith('/celestialsculptor/'))path=path.slice('/celestialsculptor'.length);
  if(path.endsWith('/'))path+='index.html';
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(!(await stat(file)).isFile())throw new Error('Not a file');
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':content.length});
  res.end(req.method==='HEAD'?undefined:content);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),'0.0.0.0',()=>console.log('Serving built game on port '+(process.env.PORT||4173)));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
