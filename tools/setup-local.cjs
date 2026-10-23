'use strict';
// Generates ONLY new credentials for the user's own deployment; never imports
// credentials, keys or installation material from the original project.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const targets=['google','aliyun'].map(p=>path.join(root,'providers',p,'private-client-access/config.json'));
const native=['AccessibleVision','ScreenBroadcastExtension'].map(p=>path.join(root,'ios-native',p,'NativeAccessCredentials.json'));
if([...targets,...native].some(p=>fs.existsSync(p)))throw new Error('Local enrollment already exists. Preserve it; this command never overwrites it.');
const credential=crypto.randomBytes(32).toString('hex'),secret=crypto.randomBytes(32).toString('hex');
for(const file of targets){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({secret,nativeCredentialHash:crypto.createHash('sha256').update(credential).digest('hex'),revision:1},null,2)+'\n',{mode:0o600});}
for(const file of native)fs.writeFileSync(file,JSON.stringify({nativeCredential:credential})+'\n',{mode:0o600});
console.log('Created new local enrollment for both providers and iOS. Files are ignored by Git; no secrets printed.');
