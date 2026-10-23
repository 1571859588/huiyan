'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn');
const manifest=require('./core-source-hashes.json');
test('Export preserved 20 mature core functions from production snapshots',()=>{
 for(const [file,expected] of Object.entries(manifest)){
  const text=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),ast=acorn.parse(text,{ecmaVersion:'latest'}),actual={};
  for(const n of ast.body)if(n.type==='FunctionDeclaration'&&expected[n.id.name])actual[n.id.name]=crypto.createHash('sha256').update(text.slice(n.start,n.end).replace(/\r\n/g,'\n')).digest('hex');
  assert.deepEqual(actual,expected,file);
 }
});
