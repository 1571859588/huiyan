'use strict';
const MODEL = 'models/gemini-3.8-live-extended-thinking';
const CONTRACT_TOOL_NAME = 'set_active_reminder_contract';
const CONTRACT_TYPES = new Set(['appearance_once', 'result_once', 'change_continuous']);
const CONTRACT_TOOL = {
  name: CONTRACT_TOOL_NAME,
  description: '当且仅当用户要求从现在起等待未来的视觉事实成立后主动通知时调用一次。普通问答、当前画面查询、找东西和持续讲解不得调用。',
  behavior: 'NON_BLOCKING',
  parameters: {
    type: 'OBJECT',
    properties: {
      contractType: {
        type: 'STRING',
        enum: ['appearance_once', 'result_once', 'change_continuous'],
        description: '目标或完整静态条件出现用 appearance_once；等待明确终点或结果形成用 result_once；没有指定终点、只观察任意稳定前后变化用 change_continuous。'
      },
      filterSubject: {
        type: 'STRING',
        description: '需要持续观察的唯一可见主体。只写主体，不写提醒动作。'
      },
      yesCondition: {
        type: 'STRING',
        description: '触发提醒所需的可见事实。出现和结果任务写当前画面可直接判断的条件；变化任务写每帧需要观察的当前状态维度。'
      },
      yesSpeech: {
        type: 'STRING',
        description: '条件明确成立后主动说给用户听的一句简短中文结果。'
      }
    },
    required: ['contractType', 'filterSubject', 'yesCondition', 'yesSpeech']
  }
};
const PROMPT = `你是与视障用户实时视频通话的中文视觉助手。你直接接收连续摄像头画面和麦克风声音，只依据当前可见、可听证据自然交流。
无论环境里出现英文、其他语言、电视声、读屏声或旁人说话，你的全部可听回复都必须使用自然、清晰的简体中文和中国大陆普通话。除非用户本人在当前回合明确要求翻译或改用另一种语言，否则绝对不能切换语言，也不能夹杂英文解释。英文品牌名或专有名词只保留必要名称，其余内容仍用中文。
用户提出从现在起等待未来视觉事实成立后再通知时，必须先调用 set_active_reminder_contract，每条新任务只调用一次，并用新合同替换旧合同。调用前不要说没看到、不要回答当前画面，也不要先说确认或思考过程。
三类合同只能选一种：目标或完整静态条件出现用 appearance_once；等待属性、位置、姿态、动作完成、阈值或其他明确终点形成用 result_once；只有没有指定终点、仅要求任意稳定前后变化时用 change_continuous。
filterSubject 只写唯一可见主体；yesCondition 写触发提醒所需的可见事实；yesSpeech 写条件成立后要主动说出的一句简短中文结果。必须保留用户指定的方向、程度、范围、阈值和关系，不得擅自扩大条件。
收到 accepted 工具响应后，只说一句简短中文确认，然后继续直接观察后续视频帧。本测试没有图片快筛，合同执行完全由你负责：即使用户不再说话，只要后续画面明确满足 yesCondition，也必须主动说出 yesSpeech，不要等待新的语音回合。
appearance_once 和 result_once 成功播报一次后结束该合同；change_continuous 先记住稳定基线，只在出现新的稳定变化时提醒，不得把摄像头轻微抖动当作变化，也不得重复播报同一状态。
没有满足合同条件时保持安静，不逐帧描述，不反复提醒同一件事，不反复说正在观察。用户提问时自然回答，回答后继续执行尚未完成的合同；用户明确取消时停止当前合同。
没有指定关注事项时，仅对画面中明确的新变化或近处明显危险简短提醒。不要推测画外事实，不虚构距离，不承诺安全通过道路。证据不足就直说看不清。不要把电视、旁人或你自己的回声当作用户指令。
这里只测试三类主动提醒合同。没有找东西、持续播报、图片快筛或搜索模块，不得声称开启了这些模块。不要说出分析、推理、草稿、合同字段名或其他内部过程。`;
const $ = id => document.getElementById(id);
let call = null;
function report(c, event, closeCode = 0) {
  const body = { event, ...c.stats, closeCode };
  $('diagnostic').textContent = JSON.stringify({ model: MODEL, thinking: 'LOW', ...body }, null, 2);
}
function send(c, data) {
  if (call === c && c.ready && c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 512000) {
    c.ws.send(JSON.stringify(data)); return true;
  }
  return false;
}
function normalizeContract(args) {
  let value = args;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const contractType = String(value.contractType || '').trim();
  const filterSubject = String(value.filterSubject || '').trim().slice(0, 80);
  const yesCondition = String(value.yesCondition || '').trim().slice(0, 160);
  const yesSpeech = String(value.yesSpeech || '').trim().slice(0, 120);
  if (!CONTRACT_TYPES.has(contractType) || !filterSubject || !yesCondition || !yesSpeech) return null;
  return { contractType, filterSubject, yesCondition, yesSpeech };
}
function handleToolCall(c, message) {
  const calls = message.toolCall?.functionCalls || [];
  if (!calls.length || call !== c || c.ws.readyState !== WebSocket.OPEN) return;
  const responses = [];
  for (const item of calls) {
    c.stats.toolCalls++;
    const contract = item.name === CONTRACT_TOOL_NAME ? normalizeContract(item.args) : null;
    if (contract) {
      c.contract = contract;
      const names = { appearance_once: '目标出现', result_once: '结果达成', change_continuous: '状态变化' };
      $('status').textContent = `三类合同已建立：${names[contract.contractType]}，正在由思考模型直接观察`;
      responses.push({ id: item.id, name: item.name, response: { result: 'accepted', ...contract } });
    } else {
      $('status').textContent = '模型提交的合同无效，本轮没有建立任务';
      responses.push({ id: item.id, name: item.name, response: { result: 'rejected', error: 'invalid_contract' } });
    }
  }
  c.ws.send(JSON.stringify({ type: 'tool_response', functionResponses: responses }));
  $('diagnostic').textContent = JSON.stringify({ ...c.stats, contract: c.contract || null,
    interactionStatus: c.interactionStatus || '', audioState: c.audio.state }, null, 2);
}
function clearAudio(c) {
  for (const node of c.playing) { try { node.stop(); } catch {} }
  c.playing.clear(); c.nextAudio = 0;
}
function finish(message = '通话已结束', event = 'stopped', closeCode = 0) {
  const c = call;
  call = null;
  if (c) {
    c.ready = false; c.abort.abort();
    clearInterval(c.frames); clearTimeout(c.deadline); clearTimeout(c.handshake);
    if (c.processor) { c.processor.onaudioprocess = null; c.processor.disconnect(); }
    c.source?.disconnect(); c.silent?.disconnect();
    c.stream?.getTracks().forEach(t => t.stop());
    clearAudio(c);
    c.ws?.close(); c.audio?.close().catch(() => {});
    report(c, event, closeCode);
  }
  $('video').srcObject = null; $('start').disabled = false; $('stop').disabled = true;
  $('status').textContent = message;
}
function play(c, part) {
  if (!part?.data || !part.mimeType?.startsWith('audio/pcm')) return;
  const raw = atob(part.data), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] || 24000);
  const buffer = c.audio.createBuffer(1, Math.floor(bytes.length / 2), rate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  const node = c.audio.createBufferSource(); node.buffer = buffer; node.connect(c.audio.destination);
  c.nextAudio = Math.max(c.audio.currentTime + .03, c.nextAudio || 0);
  node.start(c.nextAudio); c.nextAudio += buffer.duration;
  c.playing.add(node); node.onended = () => c.playing.delete(node); c.stats.audioOut++;
}
function capture(c) {
  const source = c.audio.createMediaStreamSource(c.stream);
  const processor = c.audio.createScriptProcessor(4096, 1, 1);
  const silent = c.audio.createGain(); silent.gain.value = 0;
  c.source = source; c.processor = processor; c.silent = silent;
  source.connect(processor); processor.connect(silent); silent.connect(c.audio.destination);
  processor.onaudioprocess = e => {
    if (call !== c || !c.ready) return;
    const input = e.inputBuffer.getChannelData(0), ratio = c.audio.sampleRate / 16000;
    const length = Math.floor(input.length / ratio), bytes = new Uint8Array(length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < length; i++) {
      const from = Math.floor(i * ratio), to = Math.max(from + 1, Math.floor((i + 1) * ratio));
      let value = 0; for (let j = from; j < to; j++) value += input[j];
      value = Math.max(-1, Math.min(1, value / (to - from)));
      view.setInt16(i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    if (send(c, { type: 'audio', mimeType: 'audio/pcm;rate=16000',
      data: btoa(String.fromCharCode(...bytes)) })) c.stats.audioIn++;
  };
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const frame = () => {
    const video = $('video');
    if (call !== c || video.readyState < 2 || !video.videoWidth) return;
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (send(c, { type: 'video', mimeType: 'image/jpeg',
      data: canvas.toDataURL('image/jpeg', .65).split(',')[1] })) c.stats.videoIn++;
  };
  frame(); c.frames = setInterval(frame, 1000);
}
async function start() {
  if (call) return;
  const c = { abort: new AbortController(), playing: new Set(), stats: { audioIn: 0, videoIn: 0, audioOut: 0, messages: 0, toolCalls: 0 } };
  call = c; $('start').disabled = true; $('stop').disabled = false;
  $('transcript').textContent = ''; $('status').textContent = '正在打开摄像头和麦克风';
  try {
    c.audio = new (window.AudioContext || window.webkitAudioContext)();
    await c.audio.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } });
    if (call !== c) { stream.getTracks().forEach(t => t.stop()); return; }
    c.stream = stream; $('video').srcObject = stream; await $('video').play();
    if (call !== c) return;
    $('status').textContent = '正在通过绿云服务器连接思考模型';
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    c.ws = new WebSocket(`${protocol}//${location.host}/api/gemini-live/ws?thinkingTest=1`);
    c.handshake = setTimeout(() => { if (call === c) finish('连接超时，请稍后再试；不会自动重连', 'error'); }, 25000);
    c.ws.onopen = () => {
      if (call !== c) return;
      $('status').textContent = '绿云服务器已连接，正在等待思考模型';
    };
    c.ws.onmessage = async e => {
      try {
        const message = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text());
        if (call !== c) return;
        c.stats.messages++;
        if (message.type === 'gemini.error') throw new Error(message.message || '模型返回错误');
        if (message.type === 'gemini.closed') {
          finish(`模型已断开（${message.code || '无代码'}）：${message.reason || '请手动重新开始'}`, 'closed', Number(message.code) || 0);
          return;
        }
        if (message.type === 'gemini.waiting') {
          $('status').textContent = '服务器已连接，思考模型尚未就绪';
          return;
        }
        handleToolCall(c, message);
        if (message.type === 'gemini.ready' && !c.ready) {
          c.ready = true; clearTimeout(c.handshake); capture(c);
          $('status').textContent = '已通过绿云服务器连接。可以说出需要留意的事情'; report(c, 'ready');
          c.deadline = setTimeout(() => { if (call === c) finish('十分钟测试已结束'); }, 600000);
          return;
        }
        if (message.type !== 'gemini.message') return;
        if (message.interrupted) clearAudio(c);
        for (const part of message.audioParts || []) play(c, part);
        if (message.outputText) $('transcript').textContent = ($('transcript').textContent + message.outputText).slice(-3000);
        // Extended thinking: turnComplete ends one utterance, not the interaction.
        const status = message.interactionStatus;
        if (status) c.interactionStatus = status;
        $('diagnostic').textContent = JSON.stringify({ ...c.stats, contract: c.contract || null,
          interactionStatus: c.interactionStatus || '', audioState: c.audio.state }, null, 2);
        if (message.goAway) $('status').textContent = '模型提示本次会话即将结束，结束后可手动重新开始';
      } catch (error) { if (call === c) finish('连接错误：' + error.message, 'error'); }
    };
    c.ws.onerror = () => { if (call === c) finish('绿云服务器连接失败；不会自动重连', 'error'); };
    c.ws.onclose = e => { if (call === c) finish(`服务器连接已断开（${e.code}）：${e.reason || '请手动重新开始'}`, 'closed', e.code); };
  } catch (error) { if (call === c) finish('无法开始：' + error.message, 'error'); }
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => finish());
window.addEventListener('pagehide', () => finish());
