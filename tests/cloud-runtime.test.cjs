'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
// Tests deliberately use no provider credentials and make no paid model calls.
for(const key of Object.keys(process.env))if(/(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(key))delete process.env[key];
for(const provider of ['google','aliyun'])test(`${provider}: fresh server, access boundary, no teaching`,async()=>{
 const root=path.resolve(__dirname,'../providers',provider),app=require(path.join(root,'server.js'));
 const server=app.createHttpServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try {
  let r=await fetch(base+'/api/health');assert.equal(r.status,200);const health=await r.json();assert.equal(health.ok,true);assert.equal(health.teachingAvailable,false);assert.equal(health.geminiConfigured,false);assert.equal(health.bailianConfigured,false);
  r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes('teaching-entry'));assert.match(html,/audio-worklet|app\.js/);
  for(const url of ['/api/teaching/aliyun-config','/teaching/start.html','/api/gemini-browser-config?teaching=1','/api/route','/api/poi']){r=await fetch(base+url);assert.equal(r.status,404,url);}
  r=await fetch(base+'/api/client-access');const access=await r.json();assert.equal(access.nativeAuthorized,false);assert.equal(access.teachingAvailable,false);
  r=await fetch(base+'/api/client-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nativeCredential:'0'.repeat(64)})});assert.equal(r.status,401);
  for(const asset of ['app.js','client-access.js','live-web-search.js','audio-worklet.js','styles.css']){r=await fetch(base+'/'+asset);assert.equal(r.status,200,asset);}
  assert.ok(app.findObjectTestApi.buildFindObjectPrompt);assert.ok(app.activeReminderContractTestApi.parseActiveReminderTaskNormalize);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
