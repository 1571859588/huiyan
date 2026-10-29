'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const dir = __dirname;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 未设置。请传入自己的 llama-server 与权重路径。`);
  return value;
}

function loadRuntime(file = path.join(dir, 'runtime.json')) {
  const runtime = JSON.parse(fs.readFileSync(file, 'utf8'));
  const server = runtime.llamaServer;
  const bin = requiredEnv('QWEN3VL_LLAMA_SERVER');
  const model = requiredEnv('QWEN3VL_MODEL');
  const mmproj = requiredEnv('QWEN3VL_MMPROJ');
  const host = process.env.QWEN3VL_HOST || server.host;
  const port = Number(process.env.QWEN3VL_PORT || server.port);
  const argv = [
    bin,
    '-m', model,
    '--mmproj', mmproj,
    '-c', String(server.ctx),
    '-b', String(server.batch),
    '-ub', String(server.ubatch),
    '-np', String(server.parallel),
    '-ngl', String(server.gpuLayers),
    '--image-min-tokens', String(runtime.imageMinTokens),
    '--host', host,
    '--port', String(port)
  ];
  return { runtime, bin, model, mmproj, host, port, argv };
}

function taskText(target, condition) {
  return `主体：${target}\n核验条件：${condition}\n明确成立只输出Y；不成立或证据不足只输出N。`;
}

function screenBody(runtime, { imageDataUrl, target, condition }) {
  const prompt = runtime.prompt;
  return {
    messages: [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: taskText(target, condition) }
        ]
      }
    ],
    max_tokens: prompt.maxTokens,
    temperature: prompt.temperature,
    cache_prompt: prompt.cachePrompt
  };
}

function imageDataUrl(file) {
  const bytes = fs.readFileSync(file);
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}

function postJson(host, port, body) {
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host, port, method: 'POST', path: '/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) reject(new Error(`llama-server ${res.statusCode}`));
        else resolve(JSON.parse(text));
      });
    });
    req.setTimeout(2000, () => req.destroy(new Error('llama-server 无响应')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function ask(imageFile, target, condition) {
  const loaded = loadRuntime();
  const body = screenBody(loaded.runtime, { imageDataUrl: imageDataUrl(imageFile), target, condition });
  const started = Date.now();
  const data = await postJson(loaded.host, loaded.port, body);
  const content = (data.choices?.[0]?.message?.content || '').trim();
  const decision = content.startsWith('Y') ? 'Y' : content.startsWith('N') ? 'N' : content;
  return { model: loaded.runtime.id, decision, rawText: content, wallMs: Date.now() - started };
}

async function main(argv) {
  const command = argv[2];
  if (command === 'argv') {
    process.stdout.write(loadRuntime().argv.join('\n') + '\n');
    return;
  }
  if (command === 'ask') {
    const [, , , imageFile, target, condition] = argv;
    if (!imageFile || !target || !condition) throw new Error('用法: node runtime.cjs ask <jpeg> <主体> <核验条件>');
    process.stdout.write(JSON.stringify(await ask(imageFile, target, condition)) + '\n');
    return;
  }
  throw new Error('用法: node runtime.cjs argv | ask <jpeg> <主体> <核验条件>');
}

module.exports = { loadRuntime, screenBody, taskText, ask };

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
