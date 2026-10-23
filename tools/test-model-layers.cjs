'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.argv[2]||path.resolve(__dirname,'..');
const modulePath=path.join(root,'shared/huiyan-model-layers.js');
const layers=require(modulePath),source=fs.readFileSync(modulePath);
for(const speech of ['google','aliyun'])for(const application of ['google','aliyun']){
 const p=layers.cloudPlan(speech,application);assert.equal(p.speech.provider,speech);assert.equal(p.application.provider,application);assert.equal(p.screening.provider,application);assert.ok(Object.isFrozen(p));
}
for(const speech of ['google','aliyun'])for(const model of ['MiniCPM-V-4.7-1B','MiniCPM-V-4.7-35B-A3B']){
 const p=layers.localPlan(speech,model);assert.equal(p.speech.provider,speech);assert.equal(p.application.provider,'aliyun');assert.equal(p.screening.provider,'native');assert.equal(p.screening.model,model);assert.equal(p.application.endpoints.localReview,'/api/active-reminder-local-describe');
}
assert.throws(()=>layers.resolve({speechProvider:'absent'}));
assert.equal(layers.resultRules().length,1);assert.ok(layers.resultRules()[0].includes('不得编造位置或距离'));
const rules=layers.readbackRules();rules.length=0;assert.equal(layers.readbackRules().length,3);
layers.registerProvider('fixture',{application:true,endpoints:{cloudCheck:'/api/fixture-check',localReview:'/api/fixture-review'}});
const alternate=layers.resolve({speechProvider:'google',applicationProvider:'fixture'});
assert.equal(layers.endpoint({modelLayers:alternate},'greencloud-gemini','cloudCheck','/fallback'),'/api/fixture-check');
assert.throws(()=>layers.registerProvider('fixture',{}));
assert.throws(()=>layers.registerProvider('unsafe',{application:true,endpoints:{cloudCheck:'https://invalid.test'}}));
function declaration(text,name){const a=text.indexOf('function '+name+'(');assert.ok(a>=0);const tail=text.slice(a),end=/^\}$/m.exec(tail);assert.ok(end);return tail.slice(0,end.index+1);}
for(const provider of ['google','aliyun']){
 const publicRoot=path.join(root,'providers',provider,'public');
 if(!fs.existsSync(publicRoot))continue;
 assert.deepEqual(fs.readFileSync(path.join(publicRoot,'huiyan-model-layers.js')),source,'distributed module matches one canonical source');
 const app=fs.readFileSync(path.join(publicRoot,'app.js'),'utf8');
 const html=fs.readFileSync(path.join(publicRoot,'index.html'),'utf8');
 assert.ok(html.indexOf('/huiyan-model-layers.js')<html.indexOf('/app.js?'));
 const fn=declaration(app,'buildGeminiLiveSystemInstruction');
 const originalContext={buildGeminiUnifiedReplacementRules:()=>['fixture'],GEMINI_REMINDER_CONTRACT_TOOL_NAME:'set_active_reminder_contract'};
 const modularContext={...originalContext,HuiyanModelLayers:layers};
 vm.createContext(originalContext);vm.createContext(modularContext);vm.runInContext(fn,originalContext);vm.runInContext(fn,modularContext);
 for(const a of [false,true])for(const b of [false,true])for(const c of [false,true])assert.equal(modularContext.buildGeminiLiveSystemInstruction(a,b,c),originalContext.buildGeminiLiveSystemInstruction(a,b,c),'module preserves original rules and fallback exactly');
}
console.log('PASS: three independent layers, cloud screen follows application, current local Ali review, adapter swapping without new rules, immutable plans, canonical copies and original speech-rule equivalence.');
