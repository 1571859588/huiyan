'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const name of ['NativeAssistantEntryHarness.cjs','AppLaunchLifecycleHarness.js','LocalScreenReminderHarness.cjs','LocalConditionalLiveHarness.cjs','NativeFindHarness.js']){
 const r=spawnSync(process.execPath,[path.join('ios-native/Tests',name)],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
 if(r.status!==0)process.exit(r.status||1);
}
