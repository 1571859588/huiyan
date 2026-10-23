'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=process.argv[2]||require('node:path').join(__dirname,'../providers/google/public/app.js');
const source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function getBrowserDirectActiveReminderPreparation(');
const end=source.indexOf('\nfunction ',source.indexOf('async function requestBrowserDirectActiveReminderResult(',start));
assert.ok(start>0&&end>start);
let prepares=0,finalizes=0,generates=0,fail=false,resolvePrepare,clock=0;
const reminder={activeTaskSeq:1,browserActiveReminderModel:'fixture-lite',activeScreenTransport:'browser_direct_generate_content',
  browserGeminiAi:{models:{}},browserActiveReminderAiPool:[{models:{generateContent:async()=>{generates++;return{text:'N'};}}}]};
const sandbox={Date:{now:()=>clock},Error,AbortController,window:{setTimeout,clearTimeout},appState:{geminiReminder:reminder},getGeminiActiveReminderTask:()=> 'same task',
  parseImageDataUrlForClient:()=>({data:'fixture',mimeType:'image/jpeg'}),
  apiPost:async(path,body)=>{
    if(path.endsWith('prepare')){prepares++;if(fail)throw Error('503');if(resolvePrepare)await new Promise(resolve=>{resolvePrepare=resolve;});return{model:'fixture-lite',prompt:'compiled contract'};}
    finalizes++;return{shouldAlert:false,browserKeySlot:body.browserKeySlot};
  }};
vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
const input={imageDataUrl:'fixture',task:'same task',promptMode:'deep_multitask',frameCount:1,requestSeq:1};
const call=(signal)=>sandbox.requestBrowserDirectActiveReminderResult(reminder,input,signal);
(async()=>{
  await call();await call();assert.equal(prepares,1);assert.equal(generates,2);assert.equal(finalizes,2);
  reminder.activeTaskSeq++;await call();assert.equal(prepares,2,'same text in a new contract gets a new preparation');
  clock=61000;await call();assert.equal(prepares,3,'bounded config refresh');
  reminder.browserScreenPreparation=null;fail=true;await assert.rejects(call(),/503/);fail=false;await call();assert.equal(prepares,5);
  reminder.browserScreenPreparation=null;resolvePrepare=true;
  const a=call(),b=call();await Promise.resolve();const release=resolvePrepare;resolvePrepare=null;release();await Promise.all([a,b]);assert.equal(prepares,6,'concurrent frames share one pending prepare');
  if(source.slice(start,end).includes('}, signal = null)')) {
    const before=generates;await assert.rejects(call({aborted:true}),/作废/);assert.equal(generates,before,'an expired frame never sends a new model request');
  }
  reminder.browserScreenPreparation=null;resolvePrepare=true;const stale=call();await Promise.resolve();const releaseStale=resolvePrepare;resolvePrepare=null;reminder.activeTaskSeq++;releaseStale();await assert.rejects(stale,/作废/);
  if(source.includes('async function requestBrowserDirectActiveReminderLiveResult(')) {
    const a=source.indexOf('async function requestBrowserDirectActiveReminderLiveResult('),b=source.indexOf('\nfunction ',a);
    sandbox.GREEN_FIND_OBJECT_MAX_IN_FLIGHT=2;sandbox.GEMINI_DIRECT_FIND_REQUEST_TIMEOUT_MS=4000;
    sandbox.setTimeout=setTimeout;sandbox.clearTimeout=clearTimeout;
    sandbox.closeBrowserDirectActiveScreenSession=()=>{};
    const manager={connectionId:'fixture',requestCount:0,keySlot:1};
    manager.session={sendClientContent:()=>{const pending=manager.pending;manager.pending=null;clearTimeout(pending.timer);pending.resolve('N');}};
    sandbox.getBrowserDirectActiveScreenSession=async()=>manager;
    vm.runInContext(source.slice(a,b),sandbox);
    reminder.browserScreenPreparation=null;reminder.activeScreenTransport='browser_direct_live';
    const before=prepares;
    await sandbox.requestBrowserDirectActiveReminderLiveResult(reminder,input);
    await sandbox.requestBrowserDirectActiveReminderLiveResult(reminder,input);
    assert.equal(prepares,before+1,'direct Live screening shares preparation, too');
    await assert.rejects(sandbox.requestBrowserDirectActiveReminderLiveResult(reminder,input,{aborted:true}),/作废/);
  }
  console.log('PASS same contract cache, new contract isolation, refresh, errors, concurrent prepare, aborted/late frame suppression');
})().catch(error=>{console.error(error);process.exitCode=1;});
