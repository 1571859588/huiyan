'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const root=process.argv[2]||path.resolve(__dirname,'..');
const provider=process.argv[3]||path.join(root,'providers/aliyun');
const {attach}=require(path.join(provider,'public/local-screen-search.js'));
const {createRealtimeSearchBridge}=require(path.join(root,'providers/aliyun/shared/aliyun-realtime-search.js'));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function declaration(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=source.slice(start),end=/^\}/m.exec(tail);assert.ok(end);return tail.slice(0,end.index+1);}
async function main(){
 let originalCalls=[],stateRequests=0;
 const native={__huiyanSetLocalScreenEnabled(...args){originalCalls.push(args);return 'original';},webkit:{messageHandlers:{nativeLocalScreen:{postMessage(event){assert.equal(event.type,'state');stateRequests++;}}}}};
 const state=attach(native);assert.equal(stateRequests,1);assert.equal(state.enabled(),false);
 for(const voice of ['aliyun','google']){
  assert.equal(native.__huiyanSetLocalScreenEnabled(true,voice),'original');assert.equal(state.enabled(),true);
  native.__huiyanSetLocalScreenEnabled(false,voice);assert.equal(state.enabled(),false);
 }
 assert.equal(originalCalls.length,4);assert.equal(attach({}).enabled(),false,'ordinary browser cannot opt itself in');
 let reload;const reloaded={__huiyanSetLocalScreenEnabled(){},webkit:{messageHandlers:{nativeLocalScreen:{postMessage(){reloaded.__huiyanSetLocalScreenEnabled(true,'aliyun');}}}}};
 reload=attach(reloaded);assert.equal(reload.enabled(),true,'reload reuses actual native state');
 const server=fs.readFileSync(path.join(provider,'server.js'),'utf8');
 const proxy=declaration(server,'createRealtimeProxy');
 class Socket extends EventEmitter{static OPEN=1;static CONNECTING=0;constructor(){super();this.readyState=1;this.sent=[];}send(text){this.sent.push(JSON.parse(String(text)));}close(){this.readyState=3;}}
 const sockets=[];class Upstream extends Socket{constructor(){super();sockets.push(this);}}
 async function session(query,expected){
  let queries=0,resolveSearch;
  const context={URL,console:{log(){}},WebSocket:Upstream,BAILIAN_API_KEY:'test-only',BAILIAN_REALTIME_VOICE:'unchanged',
   resolveRealtimeProxyModel:()=> 'unchanged-model',buildRealtimeWebSocketUrl:()=> 'wss://fixture.invalid',
   safeSend:(socket,event)=>socket.send(JSON.stringify(event)),parseProxyAuthApiKey:()=>'',isAllowedRealtimeClientEvent:()=>true,parseRealtimeEventType:raw=>JSON.parse(raw).type,
   searchHuiyanWeb:()=>{queries++;return new Promise(r=>resolveSearch=r);},createRealtimeSearchBridge};
  vm.createContext(context);vm.runInContext(proxy,context);const browser=new Socket();context.createRealtimeProxy(browser,{url:'/api/ws'+query});
  const upstream=sockets.at(-1);upstream.emit('open');
  browser.emit('message',JSON.stringify({type:'session.update',session:{voice:'unchanged',instructions:'existing rules',tools:[{type:'function',function:{name:'set_active_reminder_contract'}}]}}));
  const settings=upstream.sent.find(e=>e.type==='session.update').session;
  assert.equal(settings.voice,'unchanged');assert.equal(settings.tools.some(t=>t.function.name==='search_web'),expected);assert.equal(settings.tools[0].function.name,'set_active_reminder_contract');assert.equal(queries,0,'registering search never searches by itself');
  if(expected){
   upstream.emit('message',JSON.stringify({type:'response.created',response:{id:'search-turn'}}));
   upstream.emit('message',JSON.stringify({type:'response.function_call_arguments.done',name:'search_web',call_id:'query1',arguments:'{"query":"fixture source"}'}));
   await settle();assert.equal(queries,1);assert.ok(!browser.sent.some(e=>e.name==='search_web'),'search is handled by server, not mistaken for a reminder');
   upstream.emit('message',JSON.stringify({type:'response.done',response:{id:'search-turn',status:'completed'}}));
   resolveSearch({results:[{title:'fixture',snippet:'verified fixture',url:'https://example.org'}]});await settle();
   const result=upstream.sent.find(e=>e.item?.type==='function_call_output');assert.equal(JSON.parse(result.item.output).ok,true);
   assert.equal(upstream.sent.filter(e=>e.type==='response.create').length,1,'one continuation after result');
   upstream.emit('message',JSON.stringify({type:'response.function_call_arguments.done',name:'set_active_reminder_contract',call_id:'contract',arguments:'{}'}));assert.equal(browser.sent.at(-1).name,'set_active_reminder_contract');
  }
  browser.emit('close');
 }
 await session('',false);await session('?modelProfile=flash',true);await session('?localScreenSearch=1',true);
 const app=fs.readFileSync(path.join(provider,'public/app.js'),'utf8');
 const start=declaration(app,'startWebSocketRealtime');
 const gate=start.slice(start.indexOf('  if (window.HuiyanLocalScreenSearch'),start.indexOf('  const socket ='));
 assert.ok(gate);for(const enabled of [false,true]){const url=new URL('wss://example.org/api/ws');vm.runInNewContext(gate,{window:{HuiyanLocalScreenSearch:{enabled:()=>enabled}},socketUrl:url});assert.equal(url.searchParams.has('localScreenSearch'),enabled);}
 const google=app.slice(app.indexOf('async function startGeminiReminderMode('));assert.ok(google.includes('HuiyanWebSearch?.extendLiveConfig(liveConfig)'));
 const bridge=fs.readFileSync(path.join(root,'ios-native/AccessibleVision/LocalScreening/LocalScreenReminderBridge.swift'),'utf8');assert.ok(bridge.includes("url.pathname !== '/api/active-reminder-check'"),'native screening leaves /api/web-search untouched');
 const search=require(path.join(root,'providers/aliyun/public/live-web-search.js'));let replies=0;
 const controller=search.createController({session:{sendToolResponse:()=>replies++},fetchImpl:async()=>({ok:true,json:async()=>({results:[]})})});
 controller.handle({toolCall:{functionCalls:[{id:'google-search',name:'search_web',args:{query:'fixture'}}]}});await settle();assert.equal(replies,1);controller.close();
 console.log('PASS: native local state/reload, local-only socket opt-in, existing entries unchanged, real proxy search round trip, original contract tools, Google/native search passthrough.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
