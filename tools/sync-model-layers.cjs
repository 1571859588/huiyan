'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'shared/huiyan-model-layers.js'));
for(const provider of ['google','aliyun']){
 const file=path.join(root,'providers',provider,'public/huiyan-model-layers.js');
 if(process.argv.includes('--check'))assert.deepEqual(fs.readFileSync(file),source,file);
 else fs.writeFileSync(file,source);
}
console.log('Both distributed modules match the canonical model-layer source.');
