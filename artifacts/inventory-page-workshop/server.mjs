import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']],['/index.html',['index.html','text/html']],['/style.css',['style.css','text/css']],['/workshop.js',['workshop.js','text/javascript']],['/eggs.svg',['eggs.svg','image/svg+xml']]]);
createServer(async(req,res)=>{const file=files.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end('Not found');return}try{const content=await readFile(new URL(file[0],import.meta.url));res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store'});res.end(content)}catch{res.writeHead(500);res.end('Preview unavailable')}}).listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('Inventory workshop ready'));
