'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'infrastructure/qwen3-vl-4b/runtime.json');
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
assert.equal(runtime.role, 'optional-server-comparison');
assert.equal(runtime.imageMinTokens, 1024);
assert.equal(runtime.llamaServer.batch, 256);
assert.equal(runtime.measured.date, '2026-10-28');
assert.equal(JSON.stringify(runtime).includes('/cache/'), false);
const { loadRuntime, screenBody, ask } = require(path.join(root, 'infrastructure/qwen3-vl-4b/runtime.cjs'));
const envNames = ['QWEN3VL_LLAMA_SERVER', 'QWEN3VL_MODEL', 'QWEN3VL_MMPROJ', 'QWEN3VL_HOST', 'QWEN3VL_PORT'];
const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
function restore() {
  for (const name of envNames) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
}
try {
  for (const name of envNames) delete process.env[name];
  assert.throws(() => loadRuntime(runtimePath), /QWEN3VL_LLAMA_SERVER/);
  process.env.QWEN3VL_LLAMA_SERVER = 'llama-server';
  process.env.QWEN3VL_MODEL = 'Qwen3VL-4B-Instruct-Q4_K_M.gguf';
  process.env.QWEN3VL_MMPROJ = 'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf';
  process.env.QWEN3VL_HOST = '127.0.0.1';
  process.env.QWEN3VL_PORT = '9';
  const loaded = loadRuntime(runtimePath);
  const { argv } = loaded;
  assert.equal(argv[argv.indexOf('--image-min-tokens') + 1], '1024');
  assert.equal(argv[argv.indexOf('-b') + 1], '256');
  assert.equal(argv[argv.indexOf('-m') + 1], 'Qwen3VL-4B-Instruct-Q4_K_M.gguf');
  const body = screenBody(runtime, {
    imageDataUrl: 'data:image/jpeg;base64,QQ==',
    target: '测试目标',
    condition: '当前图中清晰出现测试目标'
  });
  assert.equal(body.max_tokens, 2);
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[1].content[1].text, '主体：测试目标\n核验条件：当前图中清晰出现测试目标\n明确成立只输出Y；不成立或证据不足只输出N。');
  assert.equal(JSON.stringify(body).includes('[SAY]'), false);
  const image = path.join(os.tmpdir(), 'huiyan-qwen3vl-fixture.jpg');
  fs.writeFileSync(image, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  awaitReject(ask(image, '测试目标', '当前图中清晰出现测试目标')).then((first) => {
    assert.ok(first instanceof Error);
    assert.equal(first.message.includes('Y'), false);
    return awaitReject(ask(image, '测试目标', '当前图中清晰出现测试目标'));
  }).then((second) => {
    assert.ok(second instanceof Error);
    restore();
    console.log('PASS: Qwen3-VL-4B stays an optional server comparison and a failed call does not become Y.');
  }).catch((error) => {
    restore();
    console.error(error);
    process.exit(1);
  });
} catch (error) {
  restore();
  throw error;
}

function awaitReject(promise) {
  return promise.then(() => { throw new Error('closed port returned a decision'); }, (error) => error);
}
