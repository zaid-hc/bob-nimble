import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
async function busy(port) { return new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));}); }
if(await busy(3100)||await busy(3002)){console.error('V3 port 3002 or 3100 is already in use. Stop that V3 instance first; no processes were killed.');process.exit(1);}
const backend=spawn(process.execPath,['server.js'],{cwd:path.join(root,'backend'),stdio:'inherit',env:{...process.env,PORT:'3100',HOST:'127.0.0.1'}});
let frontend;let closing=false;
function stop(){if(closing)return;closing=true;frontend?.kill('SIGTERM');backend.kill('SIGTERM');}
backend.on('error',stop);backend.on('exit',()=>{if(!closing)stop();});
for(let n=0;n<40;n++){if(await busy(3100))break;if(n===39){console.error('V3 backend did not become ready.');stop();process.exitCode=1;}await new Promise(r=>setTimeout(r,250));}
if(!closing){frontend=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev'],{cwd:root,stdio:'inherit'});frontend.on('error',stop);frontend.on('exit',stop);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
