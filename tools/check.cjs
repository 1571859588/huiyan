'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');let count=0;
function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 if(['node_modules','.git'].includes(item.name))continue;
 const file=path.join(dir,item.name);if(item.isDirectory())scan(file);
 else if(/\.(?:js|cjs)$/.test(file)){
  const text=fs.readFileSync(file,'utf8');
  if(!/^\s*(?:import|export) /m.test(text))new vm.Script(text,{filename:file});count++;
 }
}}
scan(root);console.log(`Syntax checked ${count} JavaScript files.`);
