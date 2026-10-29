'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const { loadRuntime, screenBody } = require(path.join(root, 'infrastructure/qwen3-vl-4b/runtime.cjs'));
const loaded = loadRuntime(path.join(root, 'infrastructure/qwen3-vl-4b/runtime.json'));
const { runtime, argv } = loaded;
assert.equal(runtime.id, 'Qwen3-VL-4B');
assert.equal(runtime.imageMinTokens, 1024);
assert.equal(runtime.prompt.maxTokens, 2);
assert.equal(runtime.prompt.temperature, 0);
assert.ok(argv.includes('--image-min-tokens') && argv[argv.indexOf('--image-min-tokens') + 1] === '1024');
assert.ok(argv.includes('-ngl') && argv[argv.indexOf('-ngl') + 1] === '99');
assert.ok(argv[argv.indexOf('-m') + 1].endsWith('Qwen3VL-4B-Instruct-Q4_K_M.gguf'));
assert.ok(argv[argv.indexOf('--mmproj') + 1].endsWith('mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf'));
for (const file of [loaded.model, loaded.mmproj, loaded.bin]) {
  if (!fs.existsSync(file)) continue;
  const size = fs.statSync(file).size;
  if (file === loaded.model) assert.equal(size, runtime.llamaServer.modelBytes);
  if (file === loaded.mmproj) assert.equal(size, runtime.llamaServer.mmprojBytes);
}
const body = screenBody(runtime, {
  imageDataUrl: 'data:image/jpeg;base64,QQ==',
  target: '电梯屏',
  condition: '顶部黑底屏显示 17'
});
assert.equal(body.temperature, 0);
assert.equal(body.max_tokens, 2);
assert.equal(body.messages[1].content[1].text, '主体：电梯屏\n核验条件：顶部黑底屏显示 17\n明确成立只输出Y；不成立或证据不足只输出N。');
const layers = require(path.join(root, 'shared/huiyan-model-layers.js'));
assert.equal(layers.localModel('Qwen3-VL-4B').runtime, 'infrastructure/qwen3-vl-4b/runtime.json');
const plan = layers.localPlan('aliyun', 'Qwen3-VL-4B');
assert.equal(plan.screening.model, 'Qwen3-VL-4B');
assert.equal(plan.application.provider, 'aliyun');
console.log('PASS: Qwen3-VL-4B server runtime matches the verified llama-server screen.');
