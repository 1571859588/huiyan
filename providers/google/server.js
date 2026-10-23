'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { GoogleGenAI, Modality, MediaResolution, ThinkingLevel } = require('@google/genai');
const WebSocket = require('ws');
const { createSearchRateLimiter } = require('./shared/rate-limit');
const huiyanWebSearch = require('./public/live-web-search');
const { createHuiyanWebSearchService } = require('./shared/huiyan-web-search-service');


const { createClientAccessPolicy, webRequest } = require('./shared/client-access-policy');
const ROOT = __dirname;
const clientAccess = createClientAccessPolicy({ root: ROOT });
function activeReminderProvider() { return webRequest() ? 'gemini' : ACTIVE_REMINDER_PROVIDER; }

const PUBLIC_DIR = path.join(ROOT, 'public');
const DEBUG_CAPTURE_DIR = path.join(ROOT, 'logs', 'active-reminder-debug');

loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const AMAP_KEY = process.env.AMAP_KEY || '';
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const BAILIAN_BASE_URL = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const BAILIAN_VISION_MODEL = process.env.BAILIAN_VISION_MODEL || 'qwen-vl-plus';
const BAILIAN_ACTIVE_REMINDER_MODEL = process.env.BAILIAN_ACTIVE_REMINDER_MODEL || 'qwen3.6-flash';


const BAILIAN_REALTIME_MODEL = process.env.BAILIAN_REALTIME_MODEL || 'qwen3.5-omni-plus-realtime';
const BAILIAN_REALTIME_REGION = process.env.BAILIAN_REALTIME_REGION === 'intl' ? 'intl' : 'cn';
const BAILIAN_REALTIME_VOICE = process.env.BAILIAN_REALTIME_VOICE || 'Tina';
const BAILIAN_WEBRTC_ENDPOINT = process.env.BAILIAN_WEBRTC_ENDPOINT || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '';
const GEMINI_ACTIVE_REMINDER_BACKUP_KEYS = parseGeminiBackupKeys(process.env.GEMINI_ACTIVE_REMINDER_BACKUP_KEYS || '');
const GEMINI_ACTIVE_REMINDER_API_KEYS = [...new Set([GEMINI_API_KEY, ...GEMINI_ACTIVE_REMINDER_BACKUP_KEYS].filter(Boolean))];
const GEMINI_DIRECT_SCREEN_API_KEYS = GEMINI_ACTIVE_REMINDER_BACKUP_KEYS.filter((key) => key !== GEMINI_API_KEY);
const GEMINI_BASE_URL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
const GEMINI_SHOWCASE_LIVE_MODEL = process.env.GEMINI_SHOWCASE_LIVE_MODEL || 'gemini-3.8-live';
const GEMINI_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE || 'Zephyr';


const GEMINI_ACTIVE_REMINDER_MODEL = process.env.GEMINI_ACTIVE_REMINDER_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_DIRECT_ACTIVE_REMINDER_MODEL = process.env.GEMINI_DIRECT_ACTIVE_REMINDER_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_IMAGE_REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.GEMINI_IMAGE_REQUEST_TIMEOUT_MS || 10000));
const GEMINI_REALTIME_IMAGE_EFFECTIVE_MS = Math.max(1000, Number(process.env.GEMINI_REALTIME_IMAGE_EFFECTIVE_MS || 3500));
const GEMINI_REALTIME_IMAGE_ABORT_MS = Math.max(
  GEMINI_REALTIME_IMAGE_EFFECTIVE_MS + 100,
  Number(process.env.GEMINI_REALTIME_IMAGE_ABORT_MS || 4000)
);
const GEMINI_LIVE_FIND_EXPERIMENT = process.env.GEMINI_LIVE_FIND_EXPERIMENT === '1';
const GEMINI_BROWSER_DIRECT_SCREEN_EXPERIMENT = process.env.GEMINI_BROWSER_DIRECT_SCREEN_EXPERIMENT === '1';
const GEMINI_LIVE_FIND_TIMEOUT_MS = Math.max(2000, Number(process.env.GEMINI_LIVE_FIND_TIMEOUT_MS || 5000));
const GEMINI_LIVE_FIND_RESULT_TOOL_NAME = 'submit_find_object_frame_result';
const GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME = 'submit_find_object_comparison_result';
const GEMINI_LIVE_ACTIVE_REMINDER_RESULT_TOOL_NAME = 'submit_active_reminder_frame_result';
const GEMINI_DIRECT_FIND_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const GEMINI_REMINDER_CONTRACT_TOOL_NAME = 'set_active_reminder_contract';
const GEMINI_FIND_OBJECT_TOOL_NAME = 'set_find_object_target';
const GEMINI_CONTINUOUS_NARRATION_TOOL_NAME = 'set_continuous_narration_focus';
const GEMINI_UNIFIED_MODE_TOOL_NAME = 'select_visual_assistance_mode';
const ACTIVE_REMINDER_PROVIDER = process.env.ACTIVE_REMINDER_PROVIDER === 'gemini' ? 'gemini' : 'bailian';
const APP_VARIANT = process.env.APP_VARIANT || 'greencloud-gemini';
const GEMINI_BROWSER_DIRECT = process.env.GEMINI_BROWSER_DIRECT !== '0';
const FIND_DEPTH_ASSIST_URL = String(process.env.FIND_DEPTH_ASSIST_URL || '').trim();
const FIND_DEPTH_ASSIST_TIMEOUT_MS = Math.max(500, Number(process.env.FIND_DEPTH_ASSIST_TIMEOUT_MS || 5000));
const FIND_DEPTH_FAR_THRESHOLD_M = Math.max(0.5, Number(process.env.FIND_DEPTH_FAR_THRESHOLD_M || 1.5));
const FIND_DEPTH_NEAR_CONFIRM_FRAMES = Math.max(1, Number(process.env.FIND_DEPTH_NEAR_CONFIRM_FRAMES || 2));
const FIND_DEPTH_FAR_RELEASE_MARGIN_M = Math.max(0.1, Number(process.env.FIND_DEPTH_FAR_RELEASE_MARGIN_M || 0.25));
const FIND_DEPTH_MODEL_NEAR_OVERRIDE_FRAMES = 2;
const FIND_OBJECT_DEPTH_ASSIST_ENABLED = process.env.FIND_OBJECT_DEPTH_ASSIST_ENABLED !== '0';
const AMAP_MIN_INTERVAL_MS = Number(process.env.AMAP_MIN_INTERVAL_MS || 450);
const DEPLOY_MARKER = 'manual-ws-20260624-1';
const ACTIVE_REMINDER_DEBUG_CAPTURE = process.env.ACTIVE_REMINDER_DEBUG_CAPTURE === '1';



const searchHuiyanWeb = createHuiyanWebSearchService();

const beginHuiyanWebSearchRequest = createSearchRateLimiter({ maxRequests: 60 });






let amapQueue;
const routeJobs = new Map();
const ROUTE_JOB_TTL_MS = 15 * 60 * 1000;
const ROUTE_JOB_MAX_ACTIVE = 8;
const geminiActiveReminderKeyCooldowns = new Map();
let geminiActiveReminderKeyIndex = 0;
const findDepthSessionStates = new Map();
const findObjectLiveSessions = new Map();
const geminiDirectFindTokenRateLimits = new Map();
const FIND_OBJECT_LIVE_SESSION_IDLE_MS = 2 * 60 * 1000;
const realtimeImageMetrics = {
  timeoutEffectiveCount: 0,
  abortCount: 0,
  staleDropCount: 0
};

if (process.argv.includes('--check')) {
  const requiredFiles = [
    'server.js',
    'public/index.html',
    'public/app.js',
    'public/styles.css',
    'README.md',
    'docs/workflow.md'
  ];
  const result = {
    ok: true,
    node: process.version,
    root: ROOT,
    requiredFiles: requiredFiles.map((file) => ({
      file,
      exists: fs.existsSync(path.join(ROOT, file))
    })),
    amapConfigured: Boolean(AMAP_KEY),
    bailianConfigured: Boolean(BAILIAN_API_KEY),
    geminiConfigured: Boolean(GEMINI_API_KEY),
    realtimeWebSocketConfigured: Boolean(BAILIAN_API_KEY),
    realtimeWebRtcConfigured: Boolean(BAILIAN_API_KEY && BAILIAN_WEBRTC_ENDPOINT),
    deployMarker: DEPLOY_MARKER
  };
  result.ok = result.requiredFiles.every((item) => item.exists);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function handleHttpRequest(req, res) {
  return clientAccess.run(req, () => handleScopedHttpRequest(req, res));
}

async function handleScopedHttpRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname.startsWith('/teaching')) throw httpError(404, 'Not included in this release.');

    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl);
      return;
    }

    await serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || '服务器内部错误'
    });
  }
}

function handleApiRequest(req, res) {
  return clientAccess.run(req, () => handleScopedApiRequest(req, res));
}

async function handleScopedApiRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    await handleApi(req, res, requestUrl);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || '服务器内部错误'
    });
  }
}

function createHttpServer() {
  const server = http.createServer(handleHttpRequest);
  const browserRealtimeServer = createBrowserRealtimeServer();
  const geminiLiveServer = createGeminiLiveServer();


  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname.startsWith('/api/teaching') || requestUrl.searchParams.has('teaching') || !clientAccess.socketAllowed(req, requestUrl)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    if (requestUrl.pathname === '/api/gemini-live/ws') {
      geminiLiveServer.handleUpgrade(req, socket, head, (browserSocket) => {
        geminiLiveServer.emit('connection', browserSocket, req);
      });
      return;
    }
    if (requestUrl.pathname !== '/api/realtime/ws' && requestUrl.pathname !== '/api/ws') {
      socket.destroy();
      return;
    }

    browserRealtimeServer.handleUpgrade(req, socket, head, (browserSocket) => {
      browserRealtimeServer.emit('connection', browserSocket, req);
    });
  });

  return server;
}

function createBrowserRealtimeServer() {
  const browserRealtimeServer = new WebSocket.Server({ noServer: true, maxPayload: 900 * 1024 });
  browserRealtimeServer.on('connection', (browserSocket) => {
    createRealtimeProxy(browserSocket);
  });
  return browserRealtimeServer;
}

function createGeminiLiveServer() {
  const geminiLiveServer = new WebSocket.Server({ noServer: true, maxPayload: 900 * 1024 });
  geminiLiveServer.on('connection', (browserSocket, req) => {
    createGeminiLiveProxy(browserSocket, req);
  });
  return geminiLiveServer;
}

function startServer() {
  const server = createHttpServer();
  server.listen(PORT, HOST, () => {
    console.log(`Accessible navigation prototype is running on http://${HOST}:${PORT}`);
  });
  return server;
}

function handleWebSocketUpgrade(req, socket, head = Buffer.alloc(0)) {
  if (!clientAccess.socketAllowed(req, new URL(req.url, 'http://localhost'))) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const browserRealtimeServer = createBrowserRealtimeServer();
  browserRealtimeServer.handleUpgrade(req, socket, head, (browserSocket) => {
    browserRealtimeServer.emit('connection', browserSocket, req);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = handleHttpRequest;
module.exports.createHttpServer = createHttpServer;
module.exports.createBrowserRealtimeServer = createBrowserRealtimeServer;
module.exports.createRealtimeProxy = createRealtimeProxy;
module.exports.handleApiRequest = handleApiRequest;
module.exports.handleHttpRequest = handleHttpRequest;
module.exports.handleWebSocketUpgrade = handleWebSocketUpgrade;
module.exports.startServer = startServer;
module.exports.activeReminderContractTestApi = {
  buildActiveReminderTaskNormalizePrompt,
  buildNormalizedTaskText,
  parseActiveReminderTaskNormalize
};
module.exports.unifiedVisualTaskTestApi = {
  buildUnifiedVisualTaskClassifyPrompt,
  parseUnifiedVisualTaskClassify,
  isUnifiedVisualTaskContextValid,
  buildUnifiedVisualModuleInstructionPrompt,
  parseUnifiedVisualModuleInstruction,
  isUnifiedVisualModuleContextValid
};
module.exports.findObjectTestApi = {
  buildFindObjectPrompt,
  parseFindObjectResult,
  buildFindObjectComparisonPrompt,
  parseFindObjectComparisonResult,
  sampleFindDepthGrid,
  applyFindDepthAssist
};
module.exports.continuousDepthTestApi = {
  summarizeContinuousDepthGrid
};
module.exports.geminiKeyPoolTestApi = {
  parseGeminiBackupKeys,
  isGeminiKeyRetryStatus,
  isGeminiKeyRetryResponse,
  geminiKeyCooldownMs,
  orderGeminiDirectScreenKeyCandidates
};
module.exports.navigationReplayTestApi = {
  buildAccessibleNavigationResult
};

async function handleApi(req, res, requestUrl) {
  if (requestUrl.pathname.startsWith('/api/teaching') || requestUrl.searchParams.has('teaching') || /^\/api\/(?:route|poi|navigation)/.test(requestUrl.pathname)) throw httpError(404, 'This feature is outside the open-source Huiyan release.');
  if (await clientAccess.handle(req, res, requestUrl, { readJsonBody, sendJson })) return;
  clientAccess.assertHttp(req, requestUrl);



  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(),
      'Cache-Control': 'no-store'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {
      ...clientAccess.capabilities(req),
      ok: true,
      amapConfigured: Boolean(AMAP_KEY),
      bailianConfigured: Boolean(BAILIAN_API_KEY),
      amapRequestsAreSerial: true,
      amapMinIntervalMs: AMAP_MIN_INTERVAL_MS,
      bailianVisionModel: BAILIAN_VISION_MODEL,
      bailianActiveReminderModel: BAILIAN_ACTIVE_REMINDER_MODEL,
      activeReminderProvider: activeReminderProvider(),
      activeReminderModel: activeReminderModelName(),
      geminiDirectActiveReminderModel: GEMINI_DIRECT_ACTIVE_REMINDER_MODEL,
      findDepthAssistConfigured: Boolean(FIND_DEPTH_ASSIST_URL),
      findObjectDepthAssistEnabled: FIND_OBJECT_DEPTH_ASSIST_ENABLED,
      geminiConfigured: Boolean(GEMINI_API_KEY),
      geminiLiveModel: GEMINI_SHOWCASE_LIVE_MODEL,
      geminiDirectLiveModel: GEMINI_LIVE_MODEL,
      geminiLiveVoice: GEMINI_LIVE_VOICE,
      geminiLiveFindExperiment: GEMINI_LIVE_FIND_EXPERIMENT,
      geminiDirectFindExperiment: GEMINI_LIVE_FIND_EXPERIMENT,
      geminiBrowserDirectScreenExperiment: (
        GEMINI_BROWSER_DIRECT_SCREEN_EXPERIMENT
        && GEMINI_LIVE_FIND_EXPERIMENT
      ),
      appVariant: APP_VARIANT,
      realtimeWebSocketConfigured: Boolean(BAILIAN_API_KEY),
      realtimeWebRtcConfigured: Boolean(BAILIAN_WEBRTC_ENDPOINT),
      realtimeModel: BAILIAN_REALTIME_MODEL,
      realtimeRegion: BAILIAN_REALTIME_REGION,
      realtimeVoice: BAILIAN_REALTIME_VOICE,
      deployMarker: DEPLOY_MARKER,
      clientApiKeySupported: true,
      note: '高德 Key 只在后端使用。百炼 Key 可由后端环境变量提供，也可由测试手机临时发送给代理。'
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/gemini-health') {
    const result = await runGeminiHealthCheck();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/gemini-browser-config') {
    const directScreenExperimentRequested = clientAccess.profile(req) === 'native' && requestUrl.searchParams.get('directScreen') === '1';
    if (
      directScreenExperimentRequested
      && (
        APP_VARIANT !== 'greencloud-gemini'
        || !GEMINI_BROWSER_DIRECT_SCREEN_EXPERIMENT
        || !GEMINI_LIVE_FIND_EXPERIMENT
      )
    ) {
      throw httpError(404, '当前版本没有开放完整手机直连入口。');
    }
    let browserDirectEnabled = GEMINI_BROWSER_DIRECT || directScreenExperimentRequested;



    if (clientAccess.profile(req) !== 'native') browserDirectEnabled = false;


    sendJson(res, 200, {
      ok: true,
      configured: Boolean(GEMINI_API_KEY),
      transport: browserDirectEnabled ? 'browser-direct' : 'server-proxy',
      apiKey: browserDirectEnabled ? (GEMINI_API_KEY) : '',

      activeReminderApiKeys: directScreenExperimentRequested
        ? GEMINI_DIRECT_SCREEN_API_KEYS
        : [],
      model: directScreenExperimentRequested
        ? GEMINI_LIVE_MODEL
        : GEMINI_SHOWCASE_LIVE_MODEL,
      activeReminderModel: directScreenExperimentRequested
        ? GEMINI_DIRECT_ACTIVE_REMINDER_MODEL
        : GEMINI_ACTIVE_REMINDER_MODEL,
      imageRequestTimeoutMs: GEMINI_IMAGE_REQUEST_TIMEOUT_MS,
      voice: GEMINI_LIVE_VOICE,
      apiVersion: 'v1beta',
      unifiedSystemInstruction: buildGeminiProxyUnifiedSystemInstruction(),
      unifiedFunctionDeclarations: [buildGeminiProxyUnifiedModeToolDeclaration()],

      });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/realtime/config') {
    sendJson(res, 200, {
      ok: true,
      webSocketConfigured: Boolean(BAILIAN_API_KEY),
      webRtcConfigured: Boolean(BAILIAN_WEBRTC_ENDPOINT),
      serverApiKeyConfigured: Boolean(BAILIAN_API_KEY),
      clientApiKeySupported: true,
      model: BAILIAN_REALTIME_MODEL,
      region: BAILIAN_REALTIME_REGION,
      voice: BAILIAN_REALTIME_VOICE,
      deployMarker: DEPLOY_MARKER,
      webSocketPath: '/api/ws',
      webRtcSdpPath: '/api/realtime/sdp'
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/realtime/sdp') {
    const offerSdp = await readTextBody(req, 1024 * 1024);
    const answerSdp = await exchangeWebRtcSdp(offerSdp, getClientDashScopeKey(req), getClientBailianEndpoint(req));
    res.writeHead(200, {
      'Content-Type': 'application/sdp; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(answerSdp);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/poi') {
    const keyword = (requestUrl.searchParams.get('keyword') || '').trim();
    const city = (requestUrl.searchParams.get('city') || '上海').trim();
    if (!keyword) {
      throw httpError(400, '请先输入要搜索的地点。');
    }
    const data = await callAmap('/v3/place/text', {
      keywords: keyword,
      city,
      citylimit: 'true',
      offset: '10',
      page: '1',
      extensions: 'all'
    });
    sendJson(res, 200, {
      ok: true,
      provider: 'amap',
      city,
      keyword,
      pois: Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : []
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/route') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await buildRouteResponse(body));
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/route-job') {
    const body = await readJsonBody(req);
    pruneRouteJobs();
    const activeCount = [...routeJobs.values()].filter((job) => job.status === 'pending').length;
    if (activeCount >= ROUTE_JOB_MAX_ACTIVE) {
      throw httpError(429, '当前路线规划任务较多，请稍后再试。');
    }
    validateRouteRequest(body);
    const jobId = randomUUID();
    const job = {
      id: jobId,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      result: null,
      error: null
    };
    routeJobs.set(jobId, job);
    buildRouteResponse(body).then((result) => {
      job.status = 'complete';
      job.result = result;
      job.updatedAt = Date.now();
    }).catch((error) => {
      job.status = 'error';
      job.error = {
        statusCode: Number(error?.statusCode || 500),
        message: error?.message || '路线规划失败。'
      };
      job.updatedAt = Date.now();
    });
    sendJson(res, 202, { ok: true, jobId, status: job.status });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/route-job') {
    pruneRouteJobs();
    const jobId = String(requestUrl.searchParams.get('id') || '').trim();
    const job = routeJobs.get(jobId);
    if (!job) {
      throw httpError(404, '路线规划任务不存在或已经过期。');
    }
    if (job.status === 'error') {
      sendJson(res, job.error?.statusCode || 500, {
        ok: false,
        jobId,
        status: 'error',
        error: job.error?.message || '路线规划失败。'
      });
      return;
    }
    sendJson(res, 200, job.status === 'complete'
      ? { ok: true, jobId, status: 'complete', result: job.result }
      : { ok: true, jobId, status: 'pending' });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/vision-check') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runVisionCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/active-reminder-check') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runActiveReminderCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/active-reminder-direct-prepare') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = prepareBrowserDirectActiveReminderCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/active-reminder-direct-finalize') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = finalizeBrowserDirectActiveReminderCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (requestUrl.pathname === '/api/native-find-config' && req.method === 'GET') {
    let enabled = false;
    try { enabled = JSON.parse(fs.readFileSync(path.join(ROOT, 'native-find-enabled.json'), 'utf8')).enabled === true; } catch (_) {}
    sendJson(res, 200, { version: 1, enabled });
    return;
  }
  if (requestUrl.pathname === '/api/native-find-check' && req.method === 'POST') {
    let enabled = false;
    try { enabled = JSON.parse(fs.readFileSync(path.join(ROOT, 'native-find-enabled.json'), 'utf8')).enabled === true; } catch (_) {}
    if (!enabled) throw httpError(404, '原生雷达找物试验已关闭。');
    const body = await readJsonBody(req, 3 * 1024 * 1024);
    const result = await require('./native-find-endpoint.cjs').check(body, { callModel: callActiveReminderModel, error: httpError });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-check') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runFindObjectCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/web-search') {
    const release = beginHuiyanWebSearchRequest(req);
    try {
      const body = await readJsonBody(req, 4096);
      const began = Date.now();
      const result = await searchHuiyanWeb(body);
      console.log(`[huiyan-web-search] results=${result.results.length}; cache=${result.cacheHit}; ms=${Date.now() - began}`);
      sendJson(res, 200, result);
    } finally {
      release();
    }
    return;
  }





  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-direct-prepare') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = prepareBrowserDirectFindCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-live-warm') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await warmFindObjectLiveSession(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-live-check') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runFindObjectLiveCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-live-close') {
    const body = await readJsonBody(req, 128 * 1024);
    closeFindObjectLiveSessions(body?.reminderSessionId, 'client_close');
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/gemini-direct-find-token') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await createGeminiDirectFindToken(req, body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/gemini-direct-active-reminder-token') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await createGeminiDirectFindToken(req, {
      ...body,
      screenMode: 'active_reminder'
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/find-object-direct-finalize') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await finalizeBrowserDirectFindResult(body);
    sendJson(res, 200, result);
    return;
  }

  if (
    req.method === 'POST'
    && requestUrl.pathname === '/api/continuous-narration-depth'
    && APP_VARIANT === 'greencloud-gemini'
  ) {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runContinuousNarrationDepthCheck(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/active-reminder-task-normalize') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await runActiveReminderTaskNormalize(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/unified-visual-task-classify') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await runUnifiedVisualTaskClassify(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/unified-visual-module-instruction') {
    const body = await readJsonBody(req, 128 * 1024);
    const result = await runUnifiedVisualModuleInstruction(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/speed-vision-answer') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runSpeedVisionAnswer(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/client-log') {
    const body = await readJsonBody(req, 64 * 1024);
    logClientDiagnostic(body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/debug-audio') {
    const body = await readRawBody(req, 12 * 1024 * 1024);
    const result = saveDebugAudio(req, body);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  throw httpError(404, '没有这个接口。');
}

function validateRouteRequest(body) {
  const origin = normalizeCoordinate(body?.origin);
  const destination = normalizeCoordinate(body?.destination);
  if (!origin || !destination) {
    throw httpError(400, '路线规划需要高德坐标，格式是 经度,纬度。请先用地点搜索选择起点和终点。');
  }
  return { origin, destination };
}

async function buildRouteResponse(body) {
  const mode = body.mode === 'walking' ? 'walking' : 'transit';
  const { origin, destination } = validateRouteRequest(body);
  const city = (body.city || '上海').trim();
  const destinationCity = (body.destinationCity || city).trim();
  const destinationPoi = await resolveDestinationPoiRoadAnchor(body.destinationPoi, destination);
  const data = mode === 'walking'
    ? await callAmap('/v3/direction/walking', { origin, destination })
    : await callAmap('/v3/direction/transit/integrated', {
      origin,
      destination,
      city,
      destinationcity: destinationCity,
      extensions: 'all',
      strategy: '0'
    });
  const summary = mode === 'walking'
    ? await buildWalkingSummary(data, { origin, destination, city, originPoi: body.originPoi, destinationPoi })
    : await buildTransitSummary(data, { origin, destination, city, destinationCity, originPoi: body.originPoi, destinationPoi });
  return {
    ok: true,
    provider: 'amap',
    mode,
    request: { origin, destination, city, destinationCity },
    ...summary
  };
}

async function resolveDestinationPoiRoadAnchor(destinationPoi, destinationLocation) {
  if (!destinationPoi) {
    return null;
  }
  let poi = { ...destinationPoi };
  if (isTransitStopPoi(poi)) {
    return poi;
  }
  const suppliedAddressRoad = extractAddressRoadName(poi.address || '');
  if (suppliedAddressRoad) {
    return { ...poi, knownAddressRoad: suppliedAddressRoad, addressEvidenceSource: 'amap_poi_address' };
  }

  const poiId = normalizeTextValue(poi.id);
  if (poiId) {
    try {
      const detail = await callAmap('/v3/place/detail', { id: poiId, extensions: 'all' });
      const detailedPoi = Array.isArray(detail.pois) && detail.pois.length ? simplifyPoi(detail.pois[0]) : null;
      const detailAddressRoad = extractAddressRoadName(detailedPoi?.address || '');
      if (detailedPoi && detailAddressRoad) {
        return {
          ...poi,
          ...detailedPoi,
          id: normalizeTextValue(poi.id) || detailedPoi.id,
          type: normalizeTextValue(poi.type) || detailedPoi.type,
          name: normalizeTextValue(poi.name) || detailedPoi.name,
          location: normalizeCoordinate(poi.location) || detailedPoi.location,
          entrLocation: normalizeCoordinate(poi.entrLocation) || detailedPoi.entrLocation || '',
          knownAddressRoad: detailAddressRoad,
          addressEvidenceSource: 'amap_poi_detail'
        };
      }
    } catch {
      // Continue to the coordinate evidence round when POI detail is unavailable.
    }
  }

  const location = normalizeCoordinate(destinationLocation) || getPoiNavigationCoordinate(poi);
  if (!location) {
    return poi;
  }
  const poiName = normalizeTextValue(poi.name);
  if (poiName) {
    try {
      const around = await callAmap('/v3/place/around', {
        location,
        keywords: poiName,
        radius: '300',
        offset: '20',
        page: '1',
        extensions: 'all'
      });
      const candidates = (Array.isArray(around.pois) ? around.pois : [])
        .map(simplifyPoi)
        .filter((candidate) => samePoiName(candidate.name, poiName));
      const matchedPoi = candidates.find((candidate) => extractAddressRoadName(candidate.address || ''));
      const aroundAddressRoad = extractAddressRoadName(matchedPoi?.address || '');
      if (matchedPoi && aroundAddressRoad) {
        return {
          ...poi,
          ...matchedPoi,
          id: normalizeTextValue(poi.id) || matchedPoi.id,
          type: normalizeTextValue(poi.type) || matchedPoi.type,
          name: poiName,
          location: normalizeCoordinate(poi.location) || matchedPoi.location,
          entrLocation: normalizeCoordinate(poi.entrLocation) || matchedPoi.entrLocation || '',
          knownAddressRoad: aroundAddressRoad,
          addressEvidenceSource: 'amap_poi_around'
        };
      }
    } catch {
      // Continue to nearby-road material when POI search has no exact address match.
    }
  }
  try {
    const data = await callAmap('/v3/geocode/regeo', {
      location,
      extensions: 'all',
      radius: '100'
    });
    const roads = Array.isArray(data.regeocode?.roads) ? data.regeocode.roads : [];
    const nearestRoad = roads
      .map((road) => ({ name: normalizeTextValue(road?.name), distance: Number(road?.distance) }))
      .filter((road) => road.name && Number.isFinite(road.distance) && road.distance <= 45)
      .sort((left, right) => left.distance - right.distance)[0];
    const nearbyRoadAnchor = nearestRoad?.name || '';
    if (nearbyRoadAnchor) {
      poi = {
        ...poi,
        nearbyRoadAnchor,
        nearbyRoadEvidenceSource: 'amap_destination_regeo'
      };
    }
  } catch {
    // Keep the original POI; the execution audit will reject an unresolved anchor.
  }
  return poi;
}

function samePoiName(left, right) {
  const normalize = (value) => normalizeTextValue(value)
    .replace(/[()（）\s·・]/g, '')
    .replace(/出入口|入口|出口/g, '');
  const leftName = normalize(left);
  const rightName = normalize(right);
  return Boolean(leftName && rightName && (leftName === rightName || leftName.includes(rightName) || rightName.includes(leftName)));
}

function pruneRouteJobs(now = Date.now()) {
  for (const [jobId, job] of routeJobs.entries()) {
    if (job.status !== 'pending' && now - job.updatedAt > ROUTE_JOB_TTL_MS) {
      routeJobs.delete(jobId);
    }
  }
}

async function callAmap(endpoint, params) {
  if (!AMAP_KEY) {
    throw httpError(500, '还没有配置 AMAP_KEY。请复制 .env.example 为 .env，并填入高德 Web 服务 Key。');
  }

  const url = new URL(`https://restapi.amap.com${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: AMAP_KEY })) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return amapQueue.run(async () => {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 15000);
    const data = await response.json();

    if (!response.ok) {
      throw httpError(response.status, `高德接口 HTTP 错误：${response.status}`);
    }
    if (data.status && data.status !== '1') {
      throw httpError(502, `高德接口返回失败：${data.info || data.infocode || '未知错误'}`);
    }

    return data;
  });
}

async function exchangeWebRtcSdp(offerSdp, clientApiKey = '', clientEndpoint = '') {
  const apiKey = clientApiKey || BAILIAN_API_KEY;
  const endpoint = clientEndpoint || BAILIAN_WEBRTC_ENDPOINT;
  if (!apiKey) {
    throw httpError(500, '还没有配置 BAILIAN_API_KEY 或 DASHSCOPE_API_KEY。');
  }
  if (!endpoint) {
    throw httpError(500, '还没有配置 BAILIAN_WEBRTC_ENDPOINT。百炼 WebRTC 接入需要官方白名单 Endpoint。');
  }
  if (!offerSdp || !offerSdp.includes('v=0')) {
    throw httpError(400, '没有收到有效的 WebRTC offer SDP。');
  }

  const url = buildWebRtcUrl(endpoint);
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/sdp'
    },
    body: offerSdp
  }, 30000);

  const answer = await response.text();
  if (!response.ok) {
    throw httpError(response.status, `百炼 WebRTC SDP 交换失败：${answer || response.status}`);
  }
  return answer;
}

async function runGeminiHealthCheck() {
  const startedAt = Date.now();
  if (!GEMINI_API_KEY) {
    console.log('[gemini_reminder.health] configured=no');
    return {
      ok: true,
      provider: 'gemini',
      configured: false,
      model: GEMINI_LIVE_MODEL,
      voice: GEMINI_LIVE_VOICE,
      latencyMs: 0,
      message: 'GEMINI_API_KEY 未配置。'
    };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: 'v1beta' } });
  const response = await fetchWithTimeout(`${GEMINI_BASE_URL}/models?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  }, 10000);
  if (!response.ok) {
    const detail = await response.text();
    throw httpError(response.status, `Gemini 健康检查失败：${detail.slice(0, 160) || response.status}`);
  }
  const latencyMs = Date.now() - startedAt;
  console.log(`[gemini_reminder.health] configured=yes; latencyMs=${latencyMs}; liveModel=${GEMINI_LIVE_MODEL}; sdk=${Boolean(ai)}`);
  return {
    ok: true,
    provider: 'gemini',
    configured: true,
    model: GEMINI_LIVE_MODEL,
    voice: GEMINI_LIVE_VOICE,
    latencyMs
  };
}

function buildGeminiProxyContractToolDeclaration() {
  return {
    name: GEMINI_REMINDER_CONTRACT_TOOL_NAME,
    description: '当且仅当用户要求建立或替换视觉主动提醒任务时调用一次。把用户意图直接下发为可执行合同；普通问答、当前画面查询和系统播报不得调用。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        contractType: {
          type: 'string',
          enum: ['appearance_once', 'appearance_new_instances', 'result_once', 'change_continuous'],
          description: '只能单选一个完整合同。寻找当前已经具备描述条件的静态目标用 appearance_once；明确要求不同新实例继续提醒用 appearance_new_instances；等待属性、阈值、完成状态、位置、姿态、关系或动作结果形成用 result_once；只有无方向、无终点的任意前后变化用 change_continuous。'
        },
        filterSubject: {
          type: 'string',
          description: '唯一、明确写出快筛持续观察的视觉主体。只写可追踪主体，不写提醒动作，不扩大或缩小用户指定范围。'
        },
        yesCondition: {
          type: 'string',
          description: '唯一、明确写出什么可观察事实成立时应用层才能判为 YES。出现和结果任务只写当前图片可回答的单选命题；结果任务只写最终结果。变化任务只写每帧稳定提取的当前状态维度，前后比较由应用层完成。'
        },
        yesSpeech: {
          type: 'string',
          description: '应用层判为 YES 后可以原样播报的一句简短肯定结果。只能陈述条件已成立，不得增加新事实或流程话术。'
        }
      },
      required: ['contractType', 'filterSubject', 'yesCondition', 'yesSpeech'],
      additionalProperties: false
    }
  };
}

function buildGeminiProxyFindObjectToolDeclaration() {
  return {
    name: GEMINI_FIND_OBJECT_TOOL_NAME,
    description: '设置或取消找物目标；应用层询问是否摸到后，把用户的明确回答下发为完成或继续。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'cancel', 'complete', 'resume'],
          description: '开始或更换目标用 start；取消用 cancel；应用层询问后用户明确说摸到了用 complete，明确说没有摸到用 resume。'
        },
        target: {
          type: 'string',
          description: 'action=start 时原样保留用户指定的唯一具体物体；其他 action 必须为空字符串。'
        }
      },
      required: ['action', 'target'],
      additionalProperties: false
    }
  };
}

function buildGeminiProxyContinuousNarrationToolDeclaration() {
  return {
    name: GEMINI_CONTINUOUS_NARRATION_TOOL_NAME,
    description: '任务尚未建立时设置持续播报的唯一关注重点。建立后关闭上行麦克风，只能由页面停止按钮退出，不得再调用本工具。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'cancel'],
          description: '任务尚未建立时用 set 设置播报重点；cancel 仅兼容建任务前的取消，运行中禁止调用。'
        },
        focus: {
          type: 'string',
          description: 'action=set 时原样概括用户唯一指定的播报重点；cancel 时必须为空字符串。'
        }
      },
      required: ['action', 'focus'],
      additionalProperties: false
    }
  };
}

function buildGeminiProxyUnifiedModeToolDeclaration(visualAssistantBaseExperiment = false) {
  return {
    name: GEMINI_UNIFIED_MODE_TOOL_NAME,
    description: visualAssistantBaseExperiment
      ? '视觉助手底座只用这个函数进入找东西或持续播报。找东西只接受原话以“帮我找”或“给我找”开头，持续播报只接受原话以“持续播报”开头；其他表达不得调用本函数。普通问答和主动提醒合同不得调用本函数。'
      : '统一入口只用这个函数分发三种持续任务。主动提醒直接交给原主动提醒入口；找东西和持续播报先建立待确认候选，用户明确回答后再交给原入口。“问一下”或“问一问”是一次性普通问答，禁止调用本函数。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['route_active_reminder', 'propose_find_object', 'propose_continuous_narration', 'confirm', 'reject', 'cancel_current'],
          description: '主动提醒用 route_active_reminder；首次找东西或持续播报只能 propose；用户明确肯定刚才的确认句后用 confirm；明确否定候选用 reject；统一入口进入的主动提醒需要叫停时用 cancel_current。'
        },
        subject: {
          type: 'string',
          description: '只用于生成找东西或持续播报的待确认问句；route_active_reminder、confirm、reject 或 cancel_current 时必须为空字符串。应用不会把 subject 当作执行目标。'
        }
      },
      required: ['action', 'subject'],
      additionalProperties: false
    }
  };
}

function buildGeminiProxyUnifiedSystemInstruction() {
  return [
    '你是视障者的统一入口分发助手。统一入口有四种机械模式：主动提醒、找东西、持续播报，以及以“问一下”或“问一问”开头的一次性普通问答。前三种相当于按下旧入口按钮，分发以后由原独立模块重新读取用户完整原话并自行提炼目标和执行；普通问答只回答一次，不建立任务。',
    '会话刚连接时必须完全保持安静，不问候、不自我介绍、不提示用户说话；只有用户先说出第一条完整指令后才处理。',
    '固定口令优先级最高：找东西只认整句话以“帮我找”或“给我找”开头并带有具体目标；持续播报只认整句话以“持续播报”开头。除此以外的同义说法不得进入这两个专用模块，只能按普通问答或主动提醒处理。',
    '所有回复和内部播报都必须使用自然、清晰的中国大陆普通话，发音平稳，语速适中；除用户原话中的英文专有名称外不得夹杂英语。',
    '主动提醒是静默等待后只在指定目标出现、唯一结果达成或无终点的新变化发生时说结果；找东西是引导用户靠近并用手触摸具体物体；持续播报是按用户重点定期描述最新画面。',
    '等待指定目标或结果成立后再告知，归主动提醒。询问当前画面、物体位置、种类、属性或现状，归普通问答。没有严格开场白时，不得根据语义猜成找东西或持续播报。',
    '用户以“问一下”或“问一问”开头时，这是一次性普通问答：禁止调用任何函数，只结合本回合最新画面简短回答一次；回答后保持在最初分发状态，不保存问题、不持续观察、不启动计时器。',
    '收到以“[ONE_SHOT_QUESTION]”开头的内部请求时，只回答标记后的本次用户问题一次，不读出标记，不调用任何函数，不建立或切换任务；忽略此前普通问答的内容，不把上一次问题或答案当成本次上下文。',
    '没有使用四种固定口令的普通问答、闲聊和不完整噪声不调用函数。',
    '如果不能确定是普通问答还是主动提醒，按普通问答处理；不得猜成找东西或持续播报，不得声称专用任务已经开始。',
    `明确属于主动提醒时，只调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=route_active_reminder，subject 为空。函数调用后保持安静，不签合同、不确认目标、不描述当前画面；原主动提醒入口会重新处理用户原话并自然确认。`,
    `只有原话以“帮我找”或“给我找”开头并带有具体目标时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_find_object；subject 保留唯一具体目标及所有限定。`,
    `只有原话以“持续播报”开头时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_continuous_narration；subject 尽量逐字保留完整要求，尤其保留距离和间隔。`,
    `只有用户对最近确认句明确回答“是、对、可以、开始”等肯定意思时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=confirm，subject 为空；明确否定或取消时调用 reject；含糊或答非所问不得确认。`,
    '找东西或持续播报 propose 返回后只能问是否开始，禁止说“正在、已经开始、找到后”或描述结果。confirm 返回后保持安静，原独立模块会重新读取原始指令并说自己的开始确认；reject 返回后只说明取消。',
    '所有待确认问句都必须从助手视角说给用户听：用户原话中的第一人称在问句里自然改成第二人称，但不得改变目标、限定条件或任务范围。应用保存和转交的仍是用户完整原话。',
    '你绝不能调用主动提醒合同、找东西目标或持续播报重点工具，绝不能替原模块提炼或写入执行目标；你只调用统一分发函数。',
    '听到自己的播报、读屏残音、语气词或环境噪声时保持安静，不得改变任务。',
    '不得向用户提函数、合同、快筛、分类器、系统流程、内部模式或入口切换。'
  ].join('\n');
}

function buildGeminiProxyUnifiedReplacementRules(currentMode, visualAssistantBaseExperiment = false) {
  const stopRule = currentMode === '主动提醒'
    ? `用户明确说“结束主动提醒”“停止主动提醒”或“结束当前任务”时，只调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=cancel_current；返回 accepted 后只说“主动提醒已结束。”。`
    : currentMode === '持续播报'
      ? '持续播报建立后关闭上行麦克风，只能通过页面停止按钮结束并返回最初状态；不得按语音或自行调用 cancel。'
      : `找东西按原模块在确认接触目标后自动结束并返回最初分发状态；运行中只在用户整句话恰好是单字“停”时使用当前找东西工具 action=cancel，其他用户语音全部忽略。`;
  if (visualAssistantBaseExperiment && currentMode === '主动提醒') {
    return [
      '当前是视觉助手默认底座：普通问答和主动提醒按本入口原规则共存。普通问答直接回答一次，不清空正在运行的主动提醒合同。新的主动提醒合同仍按原规则原子替换旧合同。',
      '任何时刻只允许一个专用任务执行，不得并行，也不得把任务排队。',
      `只有原话以“帮我找”或“给我找”开头并带有具体目标时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_find_object；只有原话以“持续播报”开头时，才调用 action=propose_continuous_narration。`,
      '函数返回 handoff_started 时保持安静，应用会原子清空主动提醒并进入原专用模块；原专用模型继续按成熟流程提炼任务并念开始确认句。',
      '其他疑似找东西或持续播报的表达不得调用 propose，必须继续按普通问答或主动提醒处理。',
      '没有明确属于两个专用任务时，继续按普通问答或主动提醒处理，不得为了切换而猜测。环境噪声、自己的声音和不完整话语不得触发切换。',
      stopRule
    ];
  }
  return [
    '当前会话由统一入口进入，但任何时刻只允许一个任务执行，不得并行，也不得把新任务排队到旧任务后面。',
    currentMode === '持续播报'
      ? '当前持续播报一旦开始就关闭上行麦克风，所有语音转写均忽略；只由页面停止按钮退出，不回答、不修改重点、不调用工具。'
      : `当前唯一执行模块是${currentMode}。用户修改当前模块内部目标时继续使用当前模块原工具。`,
    '当前模块运行期间禁止直接切换到另一个顶层模块，也禁止执行以“问一下”或“问一问”开头的一次性普通问答，更禁止把任何新任务排在旧任务后面。用户直接提出其他模块或一次性普通问答请求时，只说“请先结束当前任务。”，不得调用新模块工具，也不得回答新问题。',
    stopRule,
    '当前任务结束后回到最初静默分发状态。用户需要在下一条独立语音中再说新任务，不得把结束和新任务合并为一次切换。'
  ];
}

function buildGeminiProxyFindObjectSystemInstruction(
  allowUnifiedReplacement = false,
  visualAssistantBaseExperiment = false
) {
  return [
    '你是视障者的找东西语音助手。这个入口与普通主动提醒合同完全隔离。',
    '你的任务只有两件：准确取得用户要找的物体；逐字播报应用层发来的找物引导。',
    `用户明确说出要找的物体时，必须调用 ${GEMINI_FIND_OBJECT_TOOL_NAME}，action=start，target 只写用户指定的物体，不增加属性、位置、类别或其他物体。`,
    '目标尚未建立时，用户更换说法可以重新调用 start。目标建立后只在用户整句话恰好是单字“停”时调用 action=cancel；其他语音、环境谈话、自己的播报和读屏残音全部忽略，不回答、不更换目标，也不得切换任务。',
    '只有应用层刚刚逐字询问“摸到了吗”之后，用户明确回答已经摸到，才调用 action=complete；用户明确回答没有摸到，才调用 action=resume。这两个 action 的 target 必须为空。没有收到该询问时绝对不能调用 complete 或 resume。',
    'complete 被接受后只说“寻找结束。”；resume 被接受后只说“继续寻找。”，不要增加解释。',
    '用户只说“进入找东西模式”但没有说目标时，不调用函数，只问“你要找什么？”。',
    '函数返回 accepted 后只确认一句“开始找某物，请慢慢移动镜头。”，不要描述当前画面，也不要自行给方向。',
    '收到以“[SAY]”开头的内部引导时，只逐字说出标记后的文字，不得增加、改写或解释，绝对不要读出标记。',
    '找物方向、遮挡和是否需要询问确认只由独立视觉快筛决定。你不能自行宣布找到、摸到或完成。',
    '不要建立目标出现、结果达成、状态变化等主动提醒合同，不要提合同、函数、系统、流程或任务完成。',
    '听到读屏残音、自己的声音、语气词或不完整噪声时保持安静。',
    '目标尚未建立时，用户问普通问题可简短回答；目标建立后按上述专用状态规则忽略。',
    ...(visualAssistantBaseExperiment ? [
      '当前由视觉助手底座进入找东西专用状态。目标建立后只认用户整句话恰好为单字“停”，此时调用 cancel；其他所有用户语音一律忽略，不得回答普通问题、不得更换目标、不得切换其他任务。视觉流程确认接触目标时仍自动结束并返回视觉助手底座。'
    ] : []),
    ...(allowUnifiedReplacement ? buildGeminiProxyUnifiedReplacementRules('找东西') : [])
  ].join('\n');
}

function buildGeminiProxyContinuousNarrationSystemInstruction(
  allowUnifiedReplacement = false,
  visualAssistantBaseExperiment = false
) {
  return [
    '你是视障者的持续画面播报助手。这个入口与主动提醒和找东西完全隔离。',
    '收到以“[SAY]”开头的内部开场问句时，只逐字说出标记后的文字，不得调用函数，不得描述画面，也不得读出标记。',
    `只有用户在开场问句之后明确说出希望持续播报的唯一重点时，才调用 ${GEMINI_CONTINUOUS_NARRATION_TOOL_NAME}，action=set，focus 简短保留用户指定范围。函数调用是建立重点的唯一方式，禁止只口头答应而不调用函数。用户没有说清重点时，只问“你需要我关注什么？”，不得自行使用当前画面整体或猜测任务。`,
    '播报重点建立后，应用会关闭上行麦克风，退出只由页面停止按钮处理；不得自行调用 cancel，不得修改重点，也不得再次调用 set。',
    '函数返回 accepted 后，只用一句短句确认开始持续播报当前重点或持续播报已停止，不要立即描述画面。',
    '只有收到以“[NARRATE]”开头的内部请求时，才根据最新摄像头画面播报一次。内部请求会写出当前固定重点，必须只围绕该重点，不得扩大范围或切换目标。',
    "每轮只说一句约二十个汉字的中文，只保留最重要的一件事。有可靠目标距离时，把方位和大约几米放在句首，例如“前方约两米有一张桌子”；省略“距离”二字，不把最近障碍距离当成目标距离。没有可靠距离就省略米数，不猜测，不重复重点，不寒暄。",
    '除用户直接说话、函数确认和“[NARRATE]”内部请求外保持安静。听到自己的播报、读屏残音、语气词或环境噪声时不得回应，也不得改变播报重点。',
    '不要建立主动提醒合同，不要自行发出找东西方向，不要提函数、系统、快筛、流程或任务完成。',
    ...(visualAssistantBaseExperiment ? [
      '当前由视觉助手底座进入持续播报专用状态。播报开始后关闭上行麦克风，所有语音转写均忽略，只由页面停止按钮退出，不回答、不调用函数。'
    ] : []),
    ...(allowUnifiedReplacement ? buildGeminiProxyUnifiedReplacementRules('持续播报') : [])
  ].join('\n');
}

function buildGeminiProxySystemInstruction(
  functionContractMode = false,
  allowUnifiedReplacement = false,
  visualAssistantBaseExperiment = false
) {
  return [
    'Always respond in natural Mainland Mandarin Chinese. Except for proper nouns from the user, do not mix in English. Output only the final words intended for the user; never output analysis, reasoning, steps, drafts, or separators.',
    '你是视障者的视频通话助手，负责普通问答和把系统确认过的主动提醒结果自然说给用户听。',
    '默认保持安静；只有用户明确说话提问，或者收到以“[SAY]”开头的内部播报指令时，才开口。',
    '收到以“[SAY]”开头的内部播报指令时，只逐字说出标记后的内容，不得增加、改写或解释。',
    '绝对不要读出“[SAY]”标记，也不要在播报前后加主动提醒、提醒结果、提醒完成、任务完成或播报完成等流程话术。',
    '没有收到系统主动提醒结果时，不要自行发出提醒，也不要补充结果里没有写明的事实。',
    '用户设置主动提醒任务时，只自然确认一句；之后等待后台快筛结果，不要自己主动判断。',
    '确认任务时区分三类：目标出现；明确终点达成；没有指定终点的任意前后变化。用户给出唯一终点时必须按结果达成确认。',
    '可听确认句保持自然口语，可以沿用用户的动作或结果表达，只要清楚确认何时提醒；不要朗读后台合同或技术词。',
    '听到不完整短噪声、读屏残音或系统播报时保持安静。',
    '用户正常提问时，可以结合当前实时视频和最近上下文简短回答。',
    '不要寒暄，不要主动称呼用户；不确定就说不确定。',
    ...(functionContractMode ? [
      'After an accepted tool response, speak exactly one short Chinese confirmation sentence stating when to remind the user. Never repeat the same meaning, never give a generic confirmation followed by a specific confirmation, and stop immediately after that one sentence.',
      '当前入口由你直接下发主动提醒合同，不再让另一个模型重新理解你的确认句。',
      `用户要求建立或替换视觉主动提醒任务时，必须先调用 ${GEMINI_REMINDER_CONTRACT_TOOL_NAME}，每个用户任务只调用一次。即使用户重复上一条任务，也必须重新调用，因为每次任务指令都要原子替换当前合同。`,
      'contractType 必须只做一次完整单选：寻找当前已经具备描述条件的完整静态目标选 appearance_once；明确要求不同新实例继续提醒选 appearance_new_instances；等待某个结果形成选 result_once；只有没有终点的任意变化选 change_continuous。',
      'appearance_once 是目标出现任务的默认值。只有用户明确表达每个、每次、新的、不同实例或继续提醒时才允许选 appearance_new_instances。',
      'result_once 的必要条件是用户在等待结果形成，包括状态达到、动作完成、方向性变化或阈值到达。',
      'change_continuous 只允许用户明确要求没有方向、没有终点的任意前后变化。只要用户说出了变化后要达到的状态、位置、属性或关系，就必须选择 result_once。',
      'filterSubject 必须是画面中可持续追踪的唯一主体；yesCondition 必须是必要且充分的可观察命题；yesSpeech 必须只陈述该命题已经成立。三项必须形成闭环。',
      '出现和结果任务的 yesCondition 必须能被当前图片直接回答为成立或不成立。变化任务不得让快筛凭单帧猜变化，只写每帧需要稳定输出的当前状态维度。',
      '用户用过程或动作表达但实际等待唯一结果时，合同必须锁定可观察的最终结果，不能写过程、趋势或中间状态。',
      '必须原样保留用户的程度、方向、阈值、范围和比较关系；接近、达到、超过、低于、部分、全部等不能互相替换，也不能把接近某结果升级成已经达到该结果。',
      '不得加入用户没有要求的主体、范围、阈值或播报内容，也不得用更宽泛的目标替换用户指定目标。',
      '所有合同文字字段必须跟随用户当前使用的语言。',
      'yesSpeech 只能说成立的结果本身，不得加流程或警示口号。',
      '用户表达清楚时直接下发合同，不要让用户复述、选择分类或再次确认。只有主体或提醒条件确实缺失时才问一个简短问题。',
      '函数返回 accepted 后，再根据刚刚提交的合同用一句自然口语确认何时提醒。确认句不能改变主体、条件、次数范围或播报内容。',
      '普通问答、当前画面查询、主动提醒结果播报以及闲聊不得调用合同函数。'
    ] : []),
    ...(allowUnifiedReplacement
      ? buildGeminiProxyUnifiedReplacementRules('主动提醒', visualAssistantBaseExperiment)
      : [])
  ].join('\n');
}

function buildGeminiThinkingTestContractToolDeclaration() {
  return {
    name: GEMINI_REMINDER_CONTRACT_TOOL_NAME,
    description: '当且仅当用户要求从现在起等待未来的视觉事实成立后主动通知时调用一次。普通问答、当前画面查询、找东西和持续讲解不得调用。',
    behavior: 'NON_BLOCKING',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        contractType: {
          type: 'string',
          enum: ['appearance_once', 'result_once', 'change_continuous'],
          description: '目标或完整静态条件出现用 appearance_once；等待明确终点或结果形成用 result_once；没有指定终点、只观察任意稳定前后变化用 change_continuous。'
        },
        filterSubject: {
          type: 'string',
          description: '需要持续观察的唯一可见主体。只写主体，不写提醒动作。'
        },
        yesCondition: {
          type: 'string',
          description: '触发提醒所需的可见事实。出现和结果任务写当前画面可直接判断的条件；变化任务写每帧需要观察的当前状态维度。'
        },
        yesSpeech: {
          type: 'string',
          description: '条件明确成立后主动说给用户听的一句简短中文结果。'
        }
      },
      required: ['contractType', 'filterSubject', 'yesCondition', 'yesSpeech'],
      additionalProperties: false
    }
  };
}

function buildGeminiThinkingTestSystemInstruction() {
  return [
    '你是与视障用户实时视频通话的中文视觉助手。你直接接收连续摄像头画面和麦克风声音，只依据当前可见、可听证据自然交流。',
    '无论环境里出现英文、其他语言、电视声、读屏声或旁人说话，你的全部可听回复都必须使用自然、清晰的简体中文和中国大陆普通话。除非用户本人在当前回合明确要求翻译或改用另一种语言，否则绝对不能切换语言，也不能夹杂英文解释。',
    `用户提出从现在起等待未来视觉事实成立后再通知时，必须先调用 ${GEMINI_REMINDER_CONTRACT_TOOL_NAME}，每条新任务只调用一次，并用新合同替换旧合同。调用前不要说没看到、不要回答当前画面，也不要先说确认或思考过程。`,
    '三类合同只能选一种：目标或完整静态条件出现用 appearance_once；等待属性、位置、姿态、动作完成、阈值或其他明确终点形成用 result_once；只有没有指定终点、仅要求任意稳定前后变化时用 change_continuous。',
    'filterSubject 只写唯一可见主体；yesCondition 写触发提醒所需的可见事实；yesSpeech 写条件成立后要主动说出的一句简短中文结果。必须保留用户指定的方向、程度、范围、阈值和关系，不得擅自扩大条件。',
    '收到 accepted 工具响应后，只说一句简短中文确认并立即结束该确认回合。随后继续观察服务器送来的每一个新视频帧。新视频帧本身就是新的观察事件，不需要等待用户再次说话。',
    '只要后续画面明确满足 yesCondition，必须主动开启一个新的语音输出回合并说出 yesSpeech。不得等待新的语音输入、文本输入、工具调用或用户追问。',
    'appearance_once 和 result_once 成功播报一次后结束该合同；change_continuous 先记住稳定基线，只在出现新的稳定变化时提醒，不得把摄像头轻微抖动当作变化，也不得重复播报同一状态。',
    '没有满足合同条件时保持安静，不逐帧描述，不反复提醒同一件事，不反复说正在观察。用户提问时自然回答，回答后继续执行尚未完成的合同；用户明确取消时停止当前合同。',
    '没有指定关注事项时，仅对画面中明确的新变化或近处明显危险简短提醒。不要推测画外事实，不虚构距离，不承诺安全通过道路。证据不足就直说看不清。不要把电视、旁人或你自己的回声当作用户指令。',
    '这里只测试三类主动提醒合同。没有找东西、持续播报、图片快筛或搜索模块，不得声称开启了这些模块。不要说出分析、推理、草稿、合同字段名或其他内部过程。'
  ].join('\n');
}



function createGeminiLiveProxy(browserSocket, req = null) {
  const requestUrl = new URL(req?.url || '/api/gemini-live/ws', 'http://localhost');


  const liveApiKey = GEMINI_API_KEY;
  const thinkingTestMode = requestUrl.searchParams.get('thinkingTest') === '1';
  const functionContractMode = requestUrl.searchParams.get('contract') === '1';
  const findObjectMode = requestUrl.searchParams.get('find') === '1';
  const continuousNarrationMode = requestUrl.searchParams.get('continuous') === '1';
  const unifiedAssistantMode = requestUrl.searchParams.get('unified') === '1';
  const allowUnifiedTaskReplacement = requestUrl.searchParams.get('replace') === '1'
    && !unifiedAssistantMode;
  const visualAssistantBaseExperiment = requestUrl.searchParams.get('visualBase') === '1'
    && allowUnifiedTaskReplacement;
  const connectionId = Math.random().toString(36).slice(2, 8);
  const liveModel = thinkingTestMode
    ? 'gemini-3.8-live-extended-thinking'
    : GEMINI_SHOWCASE_LIVE_MODEL;
  const startedAt = Date.now();
  let session = null;
  let sessionReady = false;
  let upstreamOpen = false;
  let closed = false;
  let clientEventCount = 0;
  let upstreamMessageCount = 0;
  let clientAudioCount = 0;
  let clientVideoCount = 0;
  let clientToolResponseCount = 0;
  let outputTurnCount = 0;
  let testContractAccepted = false;
  let testContractType = '';

  console.log(`[gemini-live:${connectionId}] browser connected; serverKey=${GEMINI_API_KEY ? 'yes' : 'no'}; mode=${thinkingTestMode ? 'thinking-test' : 'standard'}`);

  const closeBoth = () => {
    if (closed) {
      return;
    }
    closed = true;
    console.log(`[gemini-live:${connectionId}] closed after ${Date.now() - startedAt}ms; clientEvents=${clientEventCount}; audioIn=${clientAudioCount}; videoIn=${clientVideoCount}; toolResponses=${clientToolResponseCount}; upstreamMessages=${upstreamMessageCount}; outputTurns=${outputTurnCount}; contractAccepted=${testContractAccepted ? 'yes' : 'no'}; contractType=${testContractType || 'none'}`);
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close();
    }
    try {
      session?.close?.();
    } catch {
      // The Gemini SDK may have already closed the session.
    }
  };

  if (!liveApiKey) {
    safeSend(browserSocket, {
      type: 'gemini.error',
      message: '服务器没有配置 GEMINI_API_KEY，Gemini 主动提醒实验暂时不能启动。'
    });
    closeBoth();
    return;
  }

  const ai = new GoogleGenAI({ apiKey: liveApiKey, httpOptions: { apiVersion: 'v1beta' } });
  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: GEMINI_LIVE_VOICE
        }
      }
    },
    systemInstruction: thinkingTestMode
      ? buildGeminiThinkingTestSystemInstruction()
      : unifiedAssistantMode
      ? buildGeminiProxyUnifiedSystemInstruction()
      : findObjectMode
      ? buildGeminiProxyFindObjectSystemInstruction(false, visualAssistantBaseExperiment)
      : continuousNarrationMode
        ? buildGeminiProxyContinuousNarrationSystemInstruction(false, visualAssistantBaseExperiment)
        : buildGeminiProxySystemInstruction(
          functionContractMode,
          allowUnifiedTaskReplacement,
          visualAssistantBaseExperiment
        )
  };
  if (thinkingTestMode) {
    liveConfig.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW
    };
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiThinkingTestContractToolDeclaration()]
    }];
  } else if (unifiedAssistantMode) {
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiProxyUnifiedModeToolDeclaration()]
    }];
  } else if (findObjectMode) {
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiProxyFindObjectToolDeclaration()]
    }];
  } else if (continuousNarrationMode) {
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiProxyContinuousNarrationToolDeclaration()]
    }];
  } else if (functionContractMode) {
    liveConfig.tools = [{
      functionDeclarations: [
        { ...buildGeminiProxyContractToolDeclaration(), behavior: 'BLOCKING' },
        ...(allowUnifiedTaskReplacement
          ? [buildGeminiProxyUnifiedModeToolDeclaration(visualAssistantBaseExperiment)]
          : [])
      ]
    }];
  }
  if (!findObjectMode && !continuousNarrationMode && !thinkingTestMode) huiyanWebSearch.extendLiveConfig(liveConfig);
  ai.live.connect({
    model: liveModel,
    config: liveConfig,
    callbacks: {
      onopen: () => {
        upstreamOpen = true;
        console.log(`[gemini-live:${connectionId}] upstream ready`);
        if (session) {
          sessionReady = true;
          safeSend(browserSocket, {
            type: 'gemini.ready',
            model: liveModel,
            voice: GEMINI_LIVE_VOICE
          });
        }
      },
      onmessage: (message) => {
        upstreamMessageCount += 1;
        const audioParts = extractGeminiAudioParts(message);
        const text = message.text || '';
        const interactionStatus = message.interactionStatus
          || message.serverContent?.interactionStatus
          || '';
        const toolNames = Array.isArray(message.toolCall?.functionCalls)
          ? message.toolCall.functionCalls.map((item) => String(item?.name || '')).filter(Boolean)
          : [];
        if (thinkingTestMode && toolNames.length) {
          console.log(`[gemini-live:${connectionId}] thinking-test toolCall=${toolNames.join(',')}; videoIn=${clientVideoCount}; upstreamMessages=${upstreamMessageCount}`);
        }
        if (thinkingTestMode && message.serverContent?.turnComplete) {
          outputTurnCount += 1;
          console.log(`[gemini-live:${connectionId}] thinking-test turnComplete=${outputTurnCount}; contractAccepted=${testContractAccepted ? 'yes' : 'no'}; videoIn=${clientVideoCount}; interactionStatus=${interactionStatus || 'none'}`);
        }
        if (upstreamMessageCount === 1 || upstreamMessageCount % 20 === 0 || text || audioParts.length) {
          console.log(`[gemini-live:${connectionId}] upstream message #${upstreamMessageCount}; audioParts=${audioParts.length}; text=${thinkingTestMode ? '[hidden]' : text.slice(0, 40)}`);
        }
        safeSend(browserSocket, {
          type: 'gemini.message',
          text,
          inputText: extractGeminiTranscriptionText(message.serverContent?.inputTranscription),
          outputText: extractGeminiTranscriptionText(message.serverContent?.outputTranscription),
          audioParts,
          turnComplete: Boolean(message.serverContent?.turnComplete),
          interrupted: Boolean(message.serverContent?.interrupted),
          interactionStatus,
          goAway: message.goAway || null,
          toolCall: message.toolCall || null,
          toolCallCancellation: message.toolCallCancellation || null
        });
      },
      onerror: (event) => {
        const message = event?.message || event?.error?.message || String(event || 'unknown');
        console.log(`[gemini-live:${connectionId}] upstream error: ${message}`);
        safeSend(browserSocket, {
          type: 'gemini.error',
          message
        });
      },
      onclose: (event) => {
        console.log(`[gemini-live:${connectionId}] upstream closed; code=${event?.code ?? ''}; reason=${event?.reason ?? ''}`);
        safeSend(browserSocket, {
          type: 'gemini.closed',
          code: event?.code ?? '',
          reason: event?.reason ?? ''
        });
        closeBoth();
      }
    }
  }).then((connectedSession) => {
    session = connectedSession;
    if (upstreamOpen) {
      sessionReady = true;
      safeSend(browserSocket, {
        type: 'gemini.ready',
        model: liveModel,
        voice: GEMINI_LIVE_VOICE
      });
    }
  }).catch((error) => {
    console.log(`[gemini-live:${connectionId}] connect failed: ${error.message}`);
    safeSend(browserSocket, {
      type: 'gemini.error',
      message: `Gemini Live 连接失败：${error.message}`
    });
    closeBoth();
  });

  browserSocket.on('message', (message) => {
    clientEventCount += 1;
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      safeSend(browserSocket, { type: 'gemini.error', message: 'Gemini 实验收到无法解析的客户端消息。' });
      return;
    }
    if (!session || !sessionReady) {
      safeSend(browserSocket, { type: 'gemini.waiting', message: 'Gemini Live 还没有接通。' });
      return;
    }
    try {
      if (data.type === 'audio' && data.data) {
        clientAudioCount += 1;
        session.sendRealtimeInput({
          audio: { data: data.data, mimeType: data.mimeType || 'audio/pcm;rate=16000' }
        });
      } else if (data.type === 'video' && data.data) {
        clientVideoCount += 1;
        if (thinkingTestMode && (clientVideoCount === 1 || clientVideoCount % 10 === 0)) {
          console.log(`[gemini-live:${connectionId}] thinking-test videoIn=${clientVideoCount}; audioIn=${clientAudioCount}; contractAccepted=${testContractAccepted ? 'yes' : 'no'}; outputTurns=${outputTurnCount}`);
        }
        session.sendRealtimeInput({
          video: { data: data.data, mimeType: data.mimeType || 'image/jpeg' }
        });
      } else if (data.type === 'say' && data.text) {
        const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        console.log(`[gemini-live:${connectionId}] say; text=${text.slice(0, 80)}`);
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: `[SAY]${text}` }] }],
          turnComplete: true
        });
      } else if (data.type === 'tool_response' && Array.isArray(data.functionResponses)) {
        clientToolResponseCount += data.functionResponses.length;
        if (thinkingTestMode) {
          for (const item of data.functionResponses) {
            if (item?.name !== GEMINI_REMINDER_CONTRACT_TOOL_NAME) {
              continue;
            }
            const result = String(item?.response?.result || '');
            const contractType = String(item?.response?.contractType || '');
            if (result === 'accepted') {
              testContractAccepted = true;
              testContractType = ['appearance_once', 'result_once', 'change_continuous'].includes(contractType)
                ? contractType
                : 'unknown';
            }
            console.log(`[gemini-live:${connectionId}] thinking-test toolResponse=${result || 'unknown'}; contractType=${contractType || 'none'}; videoIn=${clientVideoCount}`);
          }
        }
        session.sendToolResponse({ functionResponses: data.functionResponses });
      } else if (data.type === 'ask' && data.text) {
        const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        const parts = [];
        const inlineImage = normalizeGeminiLiveInlineImage(data.imageData);
        if (inlineImage) {
          parts.push({ inlineData: inlineImage });
        }
        parts.push({ text });
        console.log(`[gemini-live:${connectionId}] ask; text=${text.slice(0, 80)}`);
        session.sendClientContent({
          turns: [{ role: 'user', parts }],
          turnComplete: true
        });
      }
    } catch (error) {
      safeSend(browserSocket, {
        type: 'gemini.error',
        message: error.message
      });
    }
  });

  browserSocket.on('error', () => closeBoth());
  browserSocket.on('close', () => closeBoth());
}

function normalizeGeminiLiveInlineImage(value) {
  const mimeType = String(value?.mimeType || '').toLowerCase();
  const data = String(value?.data || '');
  if (!/^image\/(?:jpeg|jpg|png|webp)$/.test(mimeType)) {
    return null;
  }
  if (!data || data.length > 800 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
    return null;
  }
  return { mimeType, data };
}

function extractGeminiAudioParts(message) {
  const parts = message?.serverContent?.modelTurn?.parts;
  if (!Array.isArray(parts)) {
    return [];
  }
  return parts
    .map((part) => part?.inlineData)
    .filter((inlineData) => inlineData?.data && (!inlineData.mimeType || inlineData.mimeType.startsWith('audio/')))
    .map((inlineData) => ({
      data: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/pcm;rate=24000'
    }));
}

function extractGeminiTranscriptionText(transcription) {
  const text = transcription?.text;
  return typeof text === 'string' ? text : '';
}

function createRealtimeProxy(browserSocket) {
  const upstreamUrl = buildRealtimeWebSocketUrl();
  const pendingMessages = [];
  const connectionId = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  let apiKey = BAILIAN_API_KEY;
  let upstream = null;
  let upstreamOpen = false;
  let closed = false;
  let clientEventCount = 0;
  let upstreamMessageCount = 0;

  console.log(`[realtime:${connectionId}] browser connected; serverKey=${apiKey ? 'yes' : 'no'}`);

  const closeBoth = () => {
    if (closed) {
      return;
    }
    closed = true;
    console.log(`[realtime:${connectionId}] closed after ${Date.now() - startedAt}ms; clientEvents=${clientEventCount}; upstreamMessages=${upstreamMessageCount}`);
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close();
    }
    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
      upstream.close();
    }
  };

  const openUpstream = () => {
    if (closed || upstream || !apiKey) {
      return;
    }

    const upstreamStartedAt = Date.now();
    console.log(`[realtime:${connectionId}] opening upstream; pending=${pendingMessages.length}`);

    upstream = new WebSocket(upstreamUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      perMessageDeflate: false,
      maxPayload: 8 * 1024 * 1024
    });

    upstream.on('open', () => {
      upstreamOpen = true;
      console.log(`[realtime:${connectionId}] upstream ready in ${Date.now() - upstreamStartedAt}ms; pending=${pendingMessages.length}`);
      safeSend(browserSocket, {
        type: 'proxy.ready',
        model: BAILIAN_REALTIME_MODEL,
        voice: BAILIAN_REALTIME_VOICE,
        transport: 'websocket'
      });
      while (pendingMessages.length > 0 && upstream.readyState === WebSocket.OPEN) {
        upstream.send(pendingMessages.shift());
      }
    });

    upstream.on('message', (message) => {
      upstreamMessageCount += 1;
      if (upstreamMessageCount === 1 || upstreamMessageCount % 50 === 0) {
        const type = parseRealtimeEventType(message.toString()) || 'unknown';
        console.log(`[realtime:${connectionId}] upstream message #${upstreamMessageCount}; type=${type}`);
      }
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(message.toString());
      }
    });

    upstream.on('error', (error) => {
      console.log(`[realtime:${connectionId}] upstream error: ${error.message}`);
      safeSend(browserSocket, {
        type: 'proxy.error',
        message: `百炼实时连接错误：${error.message}`
      });
    });

    upstream.on('close', (code, reason) => {
      console.log(`[realtime:${connectionId}] upstream closed; code=${code}; reason=${reason.toString()}`);
      safeSend(browserSocket, {
        type: 'proxy.closed',
        code,
        reason: reason.toString()
      });
      closeBoth();
    });
  };

  if (apiKey) {
    openUpstream();
  } else {
    safeSend(browserSocket, {
      type: 'proxy.need_key',
      message: '服务端没有百炼 Key。请在手机页面填写并保存百炼 DashScope Key，然后重新开始实时慧眼。'
    });
  }

  browserSocket.on('message', (message) => {
    const text = message.toString();
    const authApiKey = parseProxyAuthApiKey(text);
    if (authApiKey) {
      apiKey = authApiKey;
      console.log(`[realtime:${connectionId}] client key received; length=${authApiKey.length}`);
      openUpstream();
      return;
    }

    if (!isAllowedRealtimeClientEvent(text)) {
      console.log(`[realtime:${connectionId}] blocked client event`);
      safeSend(browserSocket, {
        type: 'proxy.error',
        message: '收到不允许转发的实时事件。'
      });
      return;
    }
    clientEventCount += 1;
    const eventType = parseRealtimeEventType(text) || 'unknown';
    const shouldLogEvent =
      clientEventCount === 1 ||
      clientEventCount % 50 === 0 ||
      !eventType.endsWith('.append');
    if (shouldLogEvent) {
      console.log(`[realtime:${connectionId}] client event #${clientEventCount}; type=${eventType}; upstreamOpen=${upstreamOpen}`);
    }
    if (!apiKey) {
      safeSend(browserSocket, {
        type: 'proxy.need_key',
        message: '缺少百炼 Key，实时事件还没有转发。'
      });
      return;
    }
    if (upstreamOpen && upstream?.readyState === WebSocket.OPEN) {
      upstream.send(text);
    } else {
      pendingMessages.push(text);
    }
  });

  browserSocket.on('error', () => closeBoth());
  browserSocket.on('close', () => closeBoth());
}

function getClientDashScopeKey(req) {
  const value = req.headers['x-client-dashscope-key'];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function getClientBailianEndpoint(req) {
  const value = req.headers['x-client-bailian-endpoint'];
  const endpoint = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  if (!endpoint) {
    return '';
  }
  return normalizeBailianEndpoint(endpoint);
}

function normalizeBailianEndpoint(endpoint) {
  const candidate = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `https://${endpoint}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw httpError(400, '百炼 WebRTC Endpoint 格式不正确。');
  }
  if (url.protocol !== 'https:') {
    throw httpError(400, '百炼 WebRTC Endpoint 必须使用 HTTPS。');
  }
  if (!url.hostname.endsWith('.maas.aliyuncs.com')) {
    throw httpError(400, '百炼 WebRTC Endpoint 必须是阿里云 maas.aliyuncs.com 域名。');
  }
  url.hostname = normalizeBailianWebRtcHostname(url.hostname);
  return `${url.hostname}${url.pathname && url.pathname !== '/' ? url.pathname : ''}`;
}

function normalizeBailianWebRtcHostname(hostname) {
  // Aliyun support confirmed the WebRTC workspace endpoint may omit the earlier "llm-" prefix.
  return hostname.startsWith('llm-ws-') ? hostname.replace(/^llm-/, '') : hostname;
}

function parseProxyAuthApiKey(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return '';
  }
  if (data?.type !== 'proxy.auth') {
    return '';
  }
  return typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
}

function parseRealtimeEventType(text) {
  try {
    const data = JSON.parse(text);
    return typeof data?.type === 'string' ? data.type : '';
  } catch {
    return '';
  }
}

function isAllowedRealtimeClientEvent(text) {
  if (text.length > 850 * 1024) {
    return false;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }

  const allowedTypes = new Set([
    'session.update',
    'input_audio_buffer.append',
    'input_audio_buffer.clear',
    'input_audio_buffer.commit',
    'input_image_buffer.append',
    'response.create',
    'response.cancel',
    'conversation.item.create',
    'conversation.item.truncate'
  ]);
  return data && allowedTypes.has(data.type);
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function buildRealtimeWebSocketUrl() {
  const base = BAILIAN_REALTIME_REGION === 'intl'
    ? 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
    : 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
  const url = new URL(base);
  url.searchParams.set('model', BAILIAN_REALTIME_MODEL);
  return url.toString();
}

function buildWebRtcUrl(endpoint = BAILIAN_WEBRTC_ENDPOINT) {
  const trimmed = endpoint.trim();
  const endpointUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(endpointUrl);
  url.hostname = normalizeBailianWebRtcHostname(url.hostname);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/v1/webrtc/realtime';
  }
  url.searchParams.set('model', BAILIAN_REALTIME_MODEL);
  return url.toString();
}

async function runVisionCheck(body) {
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const question = String(body.question || '请确认我是否已经到达目标附近，并告诉我下一步怎么走。').trim();
  const navigationState = body.navigationState || {};

  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '没有收到有效图片。请先打开摄像头并拍一帧。');
  }

  const prompt = [
    '只根据用户问题、当前图片和可用上下文回答。',
    '不能编造看不见的内容。',
    '请重点判断：是否看到目标、看到的是站牌/门牌/入口/路口/无关物体、目标大概在前方/左前方/右前方/身后、下一步应该停下/继续走/慢慢扫视/转身/询问路人。',
    '如果地图和图片冲突，必须明确说“冲突”，不要强行给确定结论。',
    '回答要短，适合直接语音播报。',
    '请优先输出 JSON，字段为 seen、target_type、direction、action、confidence、reason。',
    '',
    `用户问题：${question}`,
    '',
    Object.keys(navigationState || {}).length
      ? `导航状态：${JSON.stringify(navigationState, null, 2)}`
      : '当前没有导航状态。'
  ].join('\n');

  if (!BAILIAN_API_KEY) {
    return {
      ok: true,
      provider: 'demo',
      configured: false,
      spokenText: '演示模式：还没有配置百炼 Key。真实测试时，我会结合当前图片和导航状态判断是否看到站牌、门牌或入口。',
      rawText: '演示模式：未调用模型。',
      parsed: {
        seen: 'unknown',
        target_type: '未调用模型',
        direction: 'unknown',
        action: '配置百炼 Key 后再测试摄像头确认。',
        confidence: 0,
        reason: 'BAILIAN_API_KEY 或 DASHSCOPE_API_KEY 未配置。'
      }
    };
  }

  const response = await fetchWithTimeout(`${BAILIAN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: BAILIAN_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: '不要猜测，不要给危险过街指令；没有明确证据就说不确定。'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0.1
    })
  }, 30000);

  const data = await response.json();
  if (!response.ok) {
    throw httpError(response.status, `百炼接口 HTTP 错误：${data.error?.message || response.status}`);
  }

  const rawText = data.choices?.[0]?.message?.content || '';
  const parsed = tryParseJsonObject(rawText);
  const spokenText = parsed
    ? formatVisionSpeech(parsed)
    : rawText.replace(/\s+/g, ' ').trim();

  return {
    ok: true,
    provider: 'bailian',
    configured: true,
    model: BAILIAN_VISION_MODEL,
    spokenText,
    rawText,
    parsed
  };
}

function activeReminderConfigured() {
  return activeReminderProvider() === 'gemini'
    ? GEMINI_ACTIVE_REMINDER_API_KEYS.length > 0
    : Boolean(BAILIAN_API_KEY);
}

function activeReminderModelName() {
  return activeReminderProvider() === 'gemini'
    ? GEMINI_ACTIVE_REMINDER_MODEL
    : BAILIAN_ACTIVE_REMINDER_MODEL;
}

async function callActiveReminderModel({
  prompt,
  imageDataUrl = '',
  imageDataUrls = [],
  jsonMode = true,
  maxOutputTokens = 160,
  timeoutMs = 10000,
  realtimeImageTask = '',
  realtimeRequestId = '',
  capturedAt = 0,
  clientRequestSentAt = 0,
  inFlightCount = 0
}) {
  const images = [imageDataUrl, ...(Array.isArray(imageDataUrls) ? imageDataUrls : [])]
    .filter((value) => typeof value === 'string' && value.startsWith('data:image/'));
  if (activeReminderProvider() === 'gemini') {
    return callGeminiGenerateContent({
      prompt,
      imageDataUrls: images,
      jsonMode,
      maxOutputTokens,
      timeoutMs,
      realtimeImageTask,
      realtimeRequestId,
      capturedAt,
      clientRequestSentAt,
      inFlightCount
    });
  }

  const content = [{ type: 'text', text: prompt }];
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: image } });
  }
  const response = await fetchWithTimeout(`${BAILIAN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: BAILIAN_ACTIVE_REMINDER_MODEL,
      messages: [
        {
          role: 'system',
          content: jsonMode
            ? '只输出一个 JSON 对象，不要输出 JSON 以外的文字。'
            : '严格按用户要求的最短格式输出，不要解释。'
        },
        { role: 'user', content }
      ],
      temperature: 0,
      max_tokens: maxOutputTokens,
      enable_thinking: false
    })
  }, timeoutMs);
  const data = await response.json();
  if (!response.ok) {
    throw httpError(response.status, `主动提醒模型 HTTP 错误：${data.error?.message || response.status}`);
  }
  return String(data.choices?.[0]?.message?.content || '').trim();
}

async function callGeminiGenerateContent({
  prompt,
  imageDataUrl = '',
  imageDataUrls = [],
  jsonMode = true,
  maxOutputTokens = 160,
  timeoutMs = 10000,
  realtimeImageTask = '',
  realtimeRequestId = '',
  capturedAt = 0,
  clientRequestSentAt = 0,
  inFlightCount = 0
}) {
  const parts = [{ text: prompt }];
  const images = [imageDataUrl, ...(Array.isArray(imageDataUrls) ? imageDataUrls : [])]
    .filter((value) => typeof value === 'string' && value.startsWith('data:image/'));
  for (const imageData of images) {
    const image = parseServerImageDataUrl(imageData);
    if (!image) {
      throw httpError(400, 'Gemini 快筛没有收到有效图片。');
    }
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }
  const generationConfig = {
    temperature: 0,
    maxOutputTokens
  };
  if (images.length) {
    generationConfig.thinkingConfig = /^gemini-3\.5-/i.test(GEMINI_ACTIVE_REMINDER_MODEL)
      ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 };
  }
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig
  });
  const keyCandidates = images.length
    ? getGeminiActiveReminderKeyCandidates()
    : [{ key: GEMINI_API_KEY, index: 0 }].filter((item) => item.key);
  const realtimeImage = images.length > 0
    && ['active_reminder', 'find_object', 'other_realtime'].includes(realtimeImageTask);
  const requestTimeoutMs = realtimeImage
    ? GEMINI_REALTIME_IMAGE_ABORT_MS
    : images.length
      ? Math.max(timeoutMs, GEMINI_IMAGE_REQUEST_TIMEOUT_MS, 25000)
    : timeoutMs;
  let lastError = null;
  for (const candidate of keyCandidates) {
    const endpoint = `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_ACTIVE_REMINDER_MODEL)}:generateContent?key=${encodeURIComponent(candidate.key)}`;
    const requestSentAt = Date.now();
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      }, requestTimeoutMs);
      const data = await response.json().catch(() => ({}));
      const resultReceivedAt = Date.now();
      if (!response.ok) {
        const error = httpError(response.status, `Gemini 快筛 HTTP 错误：${data.error?.message || response.status}`);
        if (images.length && isGeminiKeyRetryResponse(response.status, data) && keyCandidates.length > 1) {
          markGeminiActiveReminderKeyUnavailable(candidate.index, response.status);
          lastError = error;
          continue;
        }
        throw error;
      }
      if (images.length) {
        geminiActiveReminderKeyIndex = candidate.index;
        geminiActiveReminderKeyCooldowns.delete(candidate.index);
      }
      if (realtimeImage) {
        const latencyMs = resultReceivedAt - requestSentAt;
        const effectiveExpired = latencyMs > GEMINI_REALTIME_IMAGE_EFFECTIVE_MS;
        const resultAgeMs = Number(capturedAt || 0) > 0
          ? resultReceivedAt - Number(capturedAt)
          : latencyMs;
        const reminderGrace = realtimeImageTask === 'active_reminder';
        const staleDropped = reminderGrace
          ? latencyMs > GEMINI_REALTIME_IMAGE_ABORT_MS
          : resultAgeMs > GEMINI_REALTIME_IMAGE_EFFECTIVE_MS;
        if (effectiveExpired) {
          realtimeImageMetrics.timeoutEffectiveCount += 1;
        }
        if (staleDropped) {
          realtimeImageMetrics.staleDropCount += 1;
        }
        console.log(`[realtime-image] task=${realtimeImageTask}; provider=gemini; model=${GEMINI_ACTIVE_REMINDER_MODEL}; requestId=${String(realtimeRequestId || '').slice(0, 100)}; capturedAt=${Number(capturedAt || 0)}; clientRequestSentAt=${Number(clientRequestSentAt || 0)}; requestSentAt=${requestSentAt}; resultReceivedAt=${resultReceivedAt}; latencyMs=${latencyMs}; effectiveExpired=${effectiveExpired ? 'yes' : 'no'}; aborted=no; staleDropped=${staleDropped ? 'yes' : 'no'}; inFlightCount=${Math.max(0, Number(inFlightCount || 0))}; dropReason=${staleDropped ? 'stale_result' : effectiveExpired ? (reminderGrace ? 'late_result_forwarded' : 'timeout_effective') : ''}; realtime_image_timeout_effective_count=${realtimeImageMetrics.timeoutEffectiveCount}; realtime_image_abort_count=${realtimeImageMetrics.abortCount}; realtime_image_stale_drop_count=${realtimeImageMetrics.staleDropCount}`);
        if (staleDropped || (effectiveExpired && !reminderGrace)) {
          const error = httpError(408, '实时图片结果已经过时，已丢弃。');
          error.realtimeImageStale = true;
          throw error;
        }
      }
      return (data.candidates?.[0]?.content?.parts || [])
        .map((part) => String(part?.text || ''))
        .join('')
        .trim();
    } catch (error) {
      if (error?.realtimeImageStale) {
        throw error;
      }
      if (realtimeImage) {
        const resultReceivedAt = Date.now();
        const latencyMs = resultReceivedAt - requestSentAt;
        const aborted = error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''));
        const effectiveExpired = latencyMs >= GEMINI_REALTIME_IMAGE_EFFECTIVE_MS;
        if (effectiveExpired) {
          realtimeImageMetrics.timeoutEffectiveCount += 1;
        }
        if (aborted) {
          realtimeImageMetrics.abortCount += 1;
        }
        console.log(`[realtime-image] task=${realtimeImageTask}; provider=gemini; model=${GEMINI_ACTIVE_REMINDER_MODEL}; requestId=${String(realtimeRequestId || '').slice(0, 100)}; capturedAt=${Number(capturedAt || 0)}; clientRequestSentAt=${Number(clientRequestSentAt || 0)}; requestSentAt=${requestSentAt}; resultReceivedAt=${resultReceivedAt}; latencyMs=${latencyMs}; effectiveExpired=${effectiveExpired ? 'yes' : 'no'}; aborted=${aborted ? 'yes' : 'no'}; staleDropped=no; inFlightCount=${Math.max(0, Number(inFlightCount || 0))}; dropReason=${aborted ? 'timeout_abort' : effectiveExpired ? 'timeout_effective' : 'request_error'}; realtime_image_timeout_effective_count=${realtimeImageMetrics.timeoutEffectiveCount}; realtime_image_abort_count=${realtimeImageMetrics.abortCount}; realtime_image_stale_drop_count=${realtimeImageMetrics.staleDropCount}`);
      }
      if (error?.statusCode || !images.length || keyCandidates.length <= 1) {
        throw error;
      }
      throw error;
    }
  }
  throw lastError || httpError(503, 'Gemini 图片快筛暂时不可用。');
}

function parseGeminiBackupKeys(value) {
  return [...new Set(String(value || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function isGeminiKeyRetryStatus(status) {
  return [401, 403, 429].includes(Number(status));
}

function isGeminiKeyRetryResponse(status, data = {}) {
  if (isGeminiKeyRetryStatus(status)) {
    return true;
  }
  const message = String(data?.error?.message || '');
  return Number(status) === 400 && /api key.*(?:not valid|invalid)|invalid api key/i.test(message);
}

function geminiKeyCooldownMs(status) {
  const code = Number(status);
  if (code === 401 || code === 403) {
    return 5 * 60 * 1000;
  }
  if (code === 429) {
    return 65 * 1000;
  }
  return 15 * 1000;
}

function getGeminiActiveReminderKeyCandidates() {
  const keys = GEMINI_ACTIVE_REMINDER_API_KEYS;
  if (!keys.length) {
    return [];
  }
  const now = Date.now();
  const candidates = [];
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (geminiActiveReminderKeyIndex + offset) % keys.length;
    if ((geminiActiveReminderKeyCooldowns.get(index) || 0) <= now) {
      candidates.push({ key: keys[index], index });
    }
  }
  if (candidates.length) {
    return candidates;
  }
  const index = [...geminiActiveReminderKeyCooldowns.entries()]
    .sort((a, b) => a[1] - b[1])[0]?.[0] ?? geminiActiveReminderKeyIndex;
  return [{ key: keys[index], index }];
}

function orderGeminiDirectScreenKeyCandidates(availableCandidates, excludeKeySlot = 0, screenLane = 1) {
  const available = Array.isArray(availableCandidates) ? availableCandidates.filter(Boolean) : [];
  const excluded = Math.max(0, Number(excludeKeySlot || 0));
  const lane = Math.max(1, Math.min(2, Number(screenLane || 1)));
  const backupCandidates = available.filter((candidate) => candidate.index > 0);
  if (backupCandidates.length >= 2) {
    const withoutExcluded = backupCandidates.filter(
      (candidate) => candidate.index + 1 !== excluded
    );
    const pool = withoutExcluded.length ? withoutExcluded : backupCandidates;
    const offset = (lane - 1) % pool.length;
    return [pool[offset]];
  }
  if (lane === 2) {
    return [];
  }
  const withoutExcluded = backupCandidates.filter(
    (candidate) => candidate.index + 1 !== excluded
  );
  return withoutExcluded.slice(0, 1);
}

function markGeminiActiveReminderKeyUnavailable(index, status) {
  geminiActiveReminderKeyCooldowns.set(index, Date.now() + geminiKeyCooldownMs(status));
  if (GEMINI_ACTIVE_REMINDER_API_KEYS.length > 1) {
    geminiActiveReminderKeyIndex = (index + 1) % GEMINI_ACTIVE_REMINDER_API_KEYS.length;
  }
  console.warn(`[gemini-fast-screen] keySlot=${index + 1}; coolingDown=yes; status=${Number(status) || 'network'}`);
}

function parseServerImageDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], data: match[2] };
}

function medianNumber(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleFindDepthGrid(depthResult, targetX, targetY) {
  const gridWidth = Number(depthResult?.gridWidth || 0);
  const gridHeight = Number(depthResult?.gridHeight || 0);
  const grid = depthResult?.grid;
  if (
    !Number.isInteger(gridWidth)
    || !Number.isInteger(gridHeight)
    || gridWidth < 8
    || gridHeight < 8
    || gridWidth > 128
    || gridHeight > 128
    || !Array.isArray(grid)
    || grid.length !== gridWidth * gridHeight
    || !Number.isFinite(targetX)
    || !Number.isFinite(targetY)
    || targetX < 0
    || targetX > 1
    || targetY < 0
    || targetY > 1
  ) {
    return null;
  }
  const centerX = Math.round(targetX * (gridWidth - 1));
  const centerY = Math.round(targetY * (gridHeight - 1));
  const samples = [];
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const x = Math.max(0, Math.min(gridWidth - 1, centerX + offsetX));
      const y = Math.max(0, Math.min(gridHeight - 1, centerY + offsetY));
      const value = Number(grid[(y * gridWidth) + x]);
      if (Number.isFinite(value) && value > 0.05 && value < 100) {
        samples.push(value);
      }
    }
  }
  const depthM = medianNumber(samples);
  if (!Number.isFinite(depthM) || samples.length < 5) {
    return null;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)];
  const high = sorted[Math.ceil((sorted.length - 1) * 0.9)];
  const relativeSpread = Math.max(0, high - low) / Math.max(depthM, 0.1);
  return {
    depthM,
    relativeSpread,
    confidence: Math.max(0, Math.min(1, 1 - relativeSpread)),
    sampleCount: samples.length
  };
}

function updateFindDepthSessionState({
  reminderSessionId,
  target,
  frameCount,
  depthM,
  nearCandidate,
  modelNearCandidate
}) {
  const safeSessionId = String(reminderSessionId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  const safeTarget = String(target || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!safeSessionId || !safeTarget || !Number.isFinite(depthM)) {
    return { smoothedDepthM: depthM, trend: 'unknown', sampleCount: 1 };
  }
  const now = Date.now();
  if (findDepthSessionStates.size > 100) {
    for (const [key, state] of findDepthSessionStates.entries()) {
      if (now - Number(state.updatedAt || 0) > 15 * 60 * 1000) {
        findDepthSessionStates.delete(key);
      }
    }
  }
  const key = `${safeSessionId}:${safeTarget}`;
  const previous = findDepthSessionStates.get(key);
  const numericFrame = Number(frameCount || 0);
  if (previous && numericFrame > 0 && numericFrame <= Number(previous.frameCount || 0)) {
    return {
      smoothedDepthM: Number(previous.smoothedDepthM || depthM),
      trend: previous.trend || 'unknown',
      sampleCount: previous.samples?.length || 1,
      nearPhaseLatched: Boolean(previous.nearPhaseLatched),
      nearConfirmCount: Number(previous.nearConfirmCount || 0),
      modelNearConfirmCount: Number(previous.modelNearConfirmCount || 0)
    };
  }
  const samples = [...(previous?.samples || []), depthM].slice(-3);
  const smoothedDepthM = medianNumber(samples) ?? depthM;
  const previousSmoothed = Number(previous?.smoothedDepthM);
  const delta = Number.isFinite(previousSmoothed) ? smoothedDepthM - previousSmoothed : 0;
  const trend = !previous
    ? 'unknown'
    : delta <= -0.08
      ? 'approaching'
      : delta >= 0.08
        ? 'moving_away'
        : 'stable';
  const farReleaseThresholdM = FIND_DEPTH_FAR_THRESHOLD_M + FIND_DEPTH_FAR_RELEASE_MARGIN_M;
  let nearPhaseLatched = Boolean(previous?.nearPhaseLatched);
  let nearConfirmCount = Number(previous?.nearConfirmCount || 0);
  const modelNearConfirmCount = modelNearCandidate
    ? Number(previous?.modelNearConfirmCount || 0) + 1
    : 0;
  if (nearPhaseLatched) {
    if (smoothedDepthM >= farReleaseThresholdM) {
      nearPhaseLatched = false;
      nearConfirmCount = 0;
    }
  } else if (nearCandidate && smoothedDepthM < FIND_DEPTH_FAR_THRESHOLD_M) {
    nearConfirmCount += 1;
    if (nearConfirmCount >= FIND_DEPTH_NEAR_CONFIRM_FRAMES) {
      nearPhaseLatched = true;
    }
  } else {
    nearConfirmCount = 0;
  }
  findDepthSessionStates.set(key, {
    samples,
    smoothedDepthM,
    trend,
    nearPhaseLatched,
    nearConfirmCount,
    modelNearConfirmCount,
    frameCount: numericFrame,
    updatedAt: now
  });
  return {
    smoothedDepthM,
    trend,
    sampleCount: samples.length,
    nearPhaseLatched,
    nearConfirmCount,
    modelNearConfirmCount
  };
}

function applyFindDepthAssist(parsed, depthResult, context = {}) {
  const metadata = {
    configured: Boolean(FIND_DEPTH_ASSIST_URL),
    available: Boolean(depthResult?.ok),
    used: false,
    decision: depthResult?.ok ? 'not_applicable' : 'unavailable',
    latencyMs: Number(depthResult?.latencyMs || 0),
    modelLatencyMs: Number(depthResult?.modelLatencyMs || 0),
    targetDepthM: null,
    smoothedDepthM: null,
    trend: 'unknown',
    confidence: 0,
    farThresholdM: FIND_DEPTH_FAR_THRESHOLD_M,
    farReleaseThresholdM: FIND_DEPTH_FAR_THRESHOLD_M + FIND_DEPTH_FAR_RELEASE_MARGIN_M,
    nearPhaseLatched: false,
    nearConfirmCount: 0,
    modelNearConfirmCount: 0,
    modelNearOverrideFrames: FIND_DEPTH_MODEL_NEAR_OVERRIDE_FRAMES,
    modelNearOverride: false
  };
  if (context.nativeHandStage === true) {
    const status = parsed?.status || 'uncertain';
    const move = { walk_left: 'move_left', walk_right: 'move_right', walk_forward: 'move_forward' }[status];
    return { result: move ? { ...parsed, status: parsed.hand === 'visible' ? move : parsed.hand === 'missing' ? 'hand_missing' : 'uncertain' } : parsed, metadata: { ...metadata, decision: 'native_hand_preserved' } };
  }
  if (!parsed || !depthResult?.ok) {
    return { result: parsed, metadata };
  }
  const sample = sampleFindDepthGrid(depthResult, parsed.targetX, parsed.targetY);
  if (!sample) {
    metadata.decision = 'target_position_unusable';
    return { result: parsed, metadata };
  }
  const state = updateFindDepthSessionState({
    reminderSessionId: context.reminderSessionId,
    target: context.target,
    frameCount: context.frameCount,
    depthM: sample.depthM,
    nearCandidate: parsed.visible === 'yes'
      && parsed.hand === 'missing'
      && sample.confidence >= 0.55,
    modelNearCandidate: parsed.status === 'hand_missing'
      && parsed.visible === 'yes'
      && parsed.hand === 'missing'
      && sample.confidence >= 0.55
  });
  metadata.used = true;
  metadata.targetDepthM = Number(sample.depthM.toFixed(3));
  metadata.smoothedDepthM = Number(state.smoothedDepthM.toFixed(3));
  metadata.trend = state.trend;
  metadata.confidence = Number(sample.confidence.toFixed(3));
  metadata.nearPhaseLatched = Boolean(state.nearPhaseLatched);
  metadata.nearConfirmCount = Number(state.nearConfirmCount || 0);
  metadata.modelNearConfirmCount = Number(state.modelNearConfirmCount || 0);
  metadata.decision = 'observed';
  if (
    parsed.visible === 'yes'
    && parsed.hand === 'missing'
    && sample.confidence >= 0.55
  ) {
    const depthNearEnough = state.nearPhaseLatched
      || state.smoothedDepthM < FIND_DEPTH_FAR_THRESHOLD_M;
    const modelNearOverride = parsed.status === 'hand_missing'
      && state.modelNearConfirmCount >= FIND_DEPTH_MODEL_NEAR_OVERRIDE_FRAMES;
    const nearEnough = depthNearEnough || modelNearOverride;
    const replacementStatus = nearEnough
      ? 'hand_missing'
      : ({ left: 'walk_left', center: 'walk_forward', right: 'walk_right' }[parsed.zone] || 'uncertain');
    metadata.modelNearOverride = Boolean(modelNearOverride && !depthNearEnough);
    metadata.decision = metadata.modelNearOverride
      ? 'model_near_consensus_override'
      : nearEnough
        ? 'depth_hand_phase'
        : 'depth_use_approach';
    return {
      result: { ...parsed, status: replacementStatus },
      metadata
    };
  }
  return { result: parsed, metadata };
}

async function runFindDepthAssist(imageDataUrl) {
  if (!FIND_DEPTH_ASSIST_URL) {
    return { ok: false, error: 'not_configured', latencyMs: 0 };
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIND_DEPTH_ASSIST_TIMEOUT_MS);
  try {
    const response = await fetch(FIND_DEPTH_ASSIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(String(data?.error || `HTTP ${response.status}`).slice(0, 160));
    }
    return {
      ok: true,
      gridWidth: Number(data.gridWidth || 0),
      gridHeight: Number(data.gridHeight || 0),
      grid: data.grid,
      modelLatencyMs: Number(data.latencyMs || 0),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error).slice(0, 160),
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function percentileNumber(values, fraction) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0.05 && value < 100)
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return null;
  }
  const safeFraction = Math.max(0, Math.min(1, Number(fraction || 0)));
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * safeFraction));
  return sorted[index];
}

function summarizeContinuousDepthGrid(depthResult) {
  const gridWidth = Number(depthResult?.gridWidth || 0);
  const gridHeight = Number(depthResult?.gridHeight || 0);
  const grid = depthResult?.grid;
  if (
    !Number.isInteger(gridWidth)
    || !Number.isInteger(gridHeight)
    || gridWidth < 8
    || gridHeight < 8
    || gridWidth > 128
    || gridHeight > 128
    || !Array.isArray(grid)
    || grid.length !== gridWidth * gridHeight
  ) {
    return null;
  }
  const rowNames = ['upper', 'middle', 'lower'];
  const columnNames = ['left', 'center', 'right'];
  const zones = [];
  for (let row = 0; row < 3; row += 1) {
    const startY = Math.floor((row * gridHeight) / 3);
    const endY = Math.floor(((row + 1) * gridHeight) / 3);
    for (let column = 0; column < 3; column += 1) {
      const startX = Math.floor((column * gridWidth) / 3);
      const endX = Math.floor(((column + 1) * gridWidth) / 3);
      const values = [];
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          values.push(Number(grid[(y * gridWidth) + x]));
        }
      }
      const representativeM = percentileNumber(values, 0.25);
      if (!Number.isFinite(representativeM)) {
        return null;
      }
      zones.push({
        row: rowNames[row],
        column: columnNames[column],
        approximateMeters: Number(representativeM.toFixed(1))
      });
    }
  }
  const overallNearM = percentileNumber(grid.map(Number), 0.1);
  if (!Number.isFinite(overallNearM)) {
    return null;
  }
  return {
    layout: '3x3',
    method: 'regional_25th_percentile',
    approximate: true,
    overallNearM: Number(overallNearM.toFixed(1)),
    zones
  };
}

async function runContinuousNarrationDepthCheck(body) {
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '持续播报测距缺少有效图片。');
  }
  const depthResult = await runFindDepthAssist(imageDataUrl);
  if (!depthResult.ok) {
    console.log(`[continuous-depth] available=no; reason=${depthResult.error || 'unavailable'}; latencyMs=${depthResult.latencyMs || 0}`);
    return {
      ok: true,
      available: false,
      approximate: true,
      latencyMs: Number(depthResult.latencyMs || 0)
    };
  }
  const summary = summarizeContinuousDepthGrid(depthResult);
  if (!summary) {
    console.log(`[continuous-depth] available=no; reason=invalid_grid; latencyMs=${depthResult.latencyMs || 0}`);
    return {
      ok: true,
      available: false,
      approximate: true,
      latencyMs: Number(depthResult.latencyMs || 0)
    };
  }
  console.log(`[continuous-depth] available=yes; overallNearM=${summary.overallNearM}; latencyMs=${depthResult.latencyMs || 0}`);
  return {
    ok: true,
    available: true,
    approximate: true,
    unit: 'meter',
    summary,
    latencyMs: Number(depthResult.latencyMs || 0),
    modelLatencyMs: Number(depthResult.modelLatencyMs || 0)
  };
}

function buildFindObjectPrompt(target, options = {}) {
  const subjectLocked = Boolean(options.subjectLocked);
  const nativeHandStage = Boolean(options.nativeHandStage);
  const referenceTargetX = Number(options.referenceTargetX);
  const referenceTargetY = Number(options.referenceTargetY);
  const referenceCoordinate = Number.isFinite(referenceTargetX) && Number.isFinite(referenceTargetY)
    ? `${referenceTargetX.toFixed(3)},${referenceTargetY.toFixed(3)}`
    : '未提供';
  return [
    subjectLocked
      ? '你是给视障者引导走近并用手触摸目标物的逐帧主体跟随判断器。'
      : '你是给视障者引导走近并用手触摸目标物的单帧视觉判断器。',
    `本轮唯一目标物：${target}。`,
    ...(subjectLocked
      ? [
        `第一张图片是上一帧锁定参考图，红色圆圈和十字标出的主体中心约为归一化坐标 ${referenceCoordinate}；第二张图片才是当前图。`,
        '从现在起只跟随参考图红色标记处已经锁定的那个具体主体，即使最初锁定并不完美也不得改认其他相似物体。必须结合相邻画面的连续移动、外观和周围参照物，在当前图中寻找同一个主体。',
        '当前图中出现其他同类或外观相似物体时，它们都不是目标。锁定主体暂时找不到时输出 target_missing 或 uncertain，绝不能改选另一个物体。所有方向、手部和接触判断只根据第二张当前图。'
      ]
      : []),
    '图片来自竖直握持手机的后置摄像头：手机顶部朝上，屏幕朝向用户，镜头朝向目标区域，画面不做镜像翻转。',
    '本版本只做二维平面方向，不判断真实高度和立体深度。画面左、右对应用户左、右；画面上方靠手机顶部，统一定义为用户前方；画面下方靠手机充电口，统一定义为用户后方。',
    subjectLocked
      ? '参考图只用于确认同一主体；状态和动作只根据第二张当前图，不猜测画面外内容。'
      : '只根据当前图片判断目标物和用户的手，不使用历史图片，不猜测画面外内容。',
    ...(activeReminderProvider() === 'bailian' && !subjectLocked
      ? ['判断目标是否出现时，不要受周围其他物体干扰。只要画面中存在与目标外观形态高度相似的物体，就判断目标可见；只有完全没有这类物体时才判断目标缺失。']
      : []),
    '只输出一个 JSON 对象，字段固定为 status、confidence、location、zone、visible、hand、view、supportBase、foregroundFloor、targetX 和 targetY，十一个字段都不得省略。',
    'status 只能单选：target_missing、walk_left、walk_right、walk_forward、hand_missing、move_left、move_right、move_forward、move_backward、contact、uncertain。',
    'visible 只能输出 yes、no 或 uncertain，表示目标物是否清楚可见。hand 只能输出 visible、missing 或 uncertain，表示是否清楚看到真实的人手。',
    'view 只能输出 wide_scene、close_support 或 uncertain。wide_scene 表示画面还能看到较完整环境、较大面积地面、完整承载物，或者用户与目标之间仍有明显距离和行走空间。只要承载目标的物体从承载表面到主体底部基本完整可见，并且前方还有大片地面，必须输出 wide_scene；目标本身清楚或显得较大也不能改变这一条。',
    'close_support 表示镜头已经真正贴近目标，目标所在的承载表面成为主要近景，承载物底部与前方大片地面不再同时完整可见，用户与目标之间几乎看不到中间路程。只看到完整承载物而不是贴近承载表面，不能输出 close_support。若承载物前方的地面仍约占整张图片四分之一或更多，必须输出 wide_scene；只有前方地面已明显少于四分之一，才可能输出 close_support。两者边界不清楚时输出 uncertain。',
    'supportBase 只能输出 visible、hidden、not_applicable 或 uncertain。承载目标的物体主体下沿或底部清楚出现在画面中时输出 visible；这些部分因镜头已经贴近承载表面而在画面外时输出 hidden；目标没有承载物时输出 not_applicable。',
    'foregroundFloor 只能输出 large、small、none 或 uncertain，只记录镜头与目标承载物之间清楚可见的前方地面面积。约占整张图片四分之一或更多输出 large；明显少于四分之一输出 small；完全没有输出 none。不要把床面、桌面、柜面或墙面算作前方地面。',
    '判断顺序：目标不清楚时 visible 输出 no 或 uncertain。目标清楚时，先根据整个场景、地面透视、家具远近和承载物位置判断 view，再判断 zone 和手。',
    '目标被镜头拉近、画面中显得大或看得清楚，不等于用户已经伸手可及。如果目标仍位于远处承载物或环境边缘，必须进入走近判断，不得直接选 hand_missing。',
    '只要画面中还能看到用户与目标之间的大段地面、通行空间、较完整环境，或者完整承载物及其前方大片地面，view 必须输出 wide_scene，表示目标还不在伸手范围，必须进入走近或 uncertain。只有明显近距离俯拍，且目标所在的承载表面已成为主要近景时，view 才能输出 close_support，才可能选 hand_missing。',
    '只要 visible=yes、view=wide_scene，就按画面横向左、中、右三分区输出走近指令：目标中心在左三分之一必须选 walk_left，在右三分之一必须选 walk_right，只有在中间三分之一才能选 walk_forward。不得对明显位于左侧或右侧的目标输出 walk_forward。',
    'walk_left 和 walk_right 表示镜头继续朝向目标，身体谨慎向左或向右挪一点，不是转身；walk_forward 只表示谨慎向前走一步。禁止根据目标大小猜测距离；目标是否可见、远近或目标分区不确定时必须选 uncertain。',
    '只有 visible=yes、view=close_support、hand=missing 时才选 hand_missing。目标和手都清楚时，以手指或手掌最靠近目标的位置为手的位置。',
    '只有清楚看到真实的人类手指、手掌或手背，才能选 move_left、move_right、move_forward、move_backward 或 contact。宠物、毛发、衣袖、身体、影子和普通物体都不是手；只看到这些时必须按“手没有出现”继续判断远近。',
    '只要清楚看到目标，location 就用最多 12 个中文字返回目标所在的承载物或最稳定参照物，并自带简短空间关系词。不要写目标名称，不要增加面向用户的完整句式，不要猜测看不清的参照物。',
    '只要清楚看到目标，zone 就必须根据目标中心所在的画面横向三分区输出 left、center 或 right；没看到目标才输出 unknown。zone 只记录图像位置，不考虑走路线路。',
    '只要 visible=yes，targetX 和 targetY 必须分别输出目标物中心在整张图片中的横向、纵向归一化坐标，左上角为 0,0，右下角为 1,1，数值范围都是 0 到 1。它们只用于在独立深度图中定位目标，不用于判断方向、距离或动作。visible 不是 yes 时，targetX 和 targetY 都输出 -1。',
    '没看到目标或无法可靠说明参照物时，location 输出空字符串。',
    '比较目标中心与手的最近点在图片中的二维差值。左右差更明显时：目标在手左边选 move_left，在手右边选 move_right。',
    '前后差更明显时：目标在手的画面上方选 move_forward，表示手往手机顶部方向移动；目标在手的画面下方选 move_backward，表示手往手机充电口方向移动。',
    '不要输出 move_up、move_down 或任何立体方向；两个轴差异不明确时选 uncertain。',
    ...(nativeHandStage
      ? [
        '苹果雷达已经确认用户进入伸手范围，本轮不可退回走近阶段。禁止输出 walk_left、walk_right 或 walk_forward，也不要再根据 wide_scene、承载物或地面判断人体距离。',
        '目标可见但手未出现时输出 hand_missing；目标和手都可见时，只比较手与目标的关系，输出 move_left、move_right、move_forward、move_backward、contact 或 uncertain。'
      ]
      : []),
    '只有画面明确显示手已经接触、覆盖或紧贴目标物时才选 contact；仅仅靠近、方向对准或因遮挡无法确认，不能选 contact。',
    '方向不可靠或画面模糊但又不能明确归入缺失状态时选 uncertain。',
    'confidence 是 0 到 1 的数字，表示本次单选判断的把握。',
    '禁止输出解释、建议、播报文字或 JSON 以外的内容。'
  ].join('\n');
}

function parseFindObjectResult(rawText, options = {}) {
  const nativeHandStage = Boolean(options.nativeHandStage);
  const parsed = tryParseJsonObject(rawText);
  const allowed = new Set([
    'target_missing',
    'walk_left',
    'walk_right',
    'walk_forward',
    'hand_missing',
    'move_left',
    'move_right',
    'move_forward',
    'move_backward',
    'contact',
    'uncertain'
  ]);
  const rawStatus = String(parsed?.status || '').trim();
  const confidence = Number(parsed?.confidence);
  if (!allowed.has(rawStatus) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }
  const location = String(parsed?.location || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?;,;；]+$/g, '')
    .trim()
    .slice(0, 24);
  const zone = String(parsed?.zone || '').trim();
  const visible = String(parsed?.visible || '').trim();
  const hand = String(parsed?.hand || '').trim();
  const view = String(parsed?.view || '').trim();
  const supportBase = String(parsed?.supportBase || '').trim();
  const foregroundFloor = String(parsed?.foregroundFloor || '').trim();
  const rawTargetX = typeof parsed?.targetX === 'number' ? parsed.targetX : Number.NaN;
  const rawTargetY = typeof parsed?.targetY === 'number' ? parsed.targetY : Number.NaN;
  const targetX = Number.isFinite(rawTargetX) && rawTargetX >= 0 && rawTargetX <= 1
    ? rawTargetX
    : null;
  const targetY = Number.isFinite(rawTargetY) && rawTargetY >= 0 && rawTargetY <= 1
    ? rawTargetY
    : null;
  if (
    !['left', 'center', 'right', 'unknown'].includes(zone)
    || !['yes', 'no', 'uncertain'].includes(visible)
    || !['visible', 'missing', 'uncertain'].includes(hand)
    || !['wide_scene', 'close_support', 'uncertain'].includes(view)
    || !['visible', 'hidden', 'not_applicable', 'uncertain'].includes(supportBase)
    || !['large', 'small', 'none', 'uncertain'].includes(foregroundFloor)
  ) {
    return null;
  }

  let status = 'uncertain';
  const effectiveView = foregroundFloor === 'large' ? 'wide_scene' : view;
  if (nativeHandStage) {
    if (visible === 'no') {
      status = 'target_missing';
    } else if (visible === 'yes' && hand === 'missing') {
      status = 'hand_missing';
    } else if (visible === 'yes' && hand === 'visible') {
      status = ({
        walk_left: 'move_left',
        walk_right: 'move_right',
        walk_forward: 'move_forward'
      }[rawStatus]) || (
        ['move_left', 'move_right', 'move_forward', 'move_backward', 'contact', 'uncertain'].includes(rawStatus)
          ? rawStatus
          : 'uncertain'
      );
    }
  } else if (visible === 'no') {
    status = 'target_missing';
  } else if (visible === 'yes' && effectiveView === 'wide_scene') {
    status = {
      left: 'walk_left',
      center: 'walk_forward',
      right: 'walk_right'
    }[zone] || 'uncertain';
  } else if (
    visible === 'yes'
    && effectiveView === 'close_support'
    && ['small', 'none'].includes(foregroundFloor)
  ) {
    if (hand === 'missing') {
      status = 'hand_missing';
    } else if (
      hand === 'visible'
      && ['move_left', 'move_right', 'move_forward', 'move_backward', 'contact', 'uncertain'].includes(rawStatus)
    ) {
      status = rawStatus;
    }
  }
  return {
    status,
    confidence,
    location,
    zone,
    visible,
    hand,
    view,
    supportBase,
    foregroundFloor,
    targetX,
    targetY
  };
}

function buildFindObjectComparisonPrompt(target) {
  return [
    '你是给视障者找东西的双帧遮挡判断器。',
    `本轮唯一目标物：${target}。`,
    '第1张图片是刚才目标清楚可见时保存的锁定参考图；第2张图片是当前图。两张图都来自竖直握持手机的后置摄像头，画面不镜像。',
    '只比较相机视角、稳定背景、目标原位置和当前手的位置，不猜测画面外事实。',
    '只输出一个 JSON 对象，字段固定为 status 和 confidence。',
    'status 只能单选：target_visible、occluded_by_hand、reacquire、uncertain。',
    '当前图仍能明确看到同一个目标物，选 target_visible。',
    '只有当前图明确看见真实的手指、手掌或手背，并且这只手覆盖参考图中目标原来的位置，同时稳定背景和取景基本没变，才选 occluded_by_hand；这只表示视觉遮挡，不能擅自断言已经摸到。',
    '人的影子、手机影子、身体轮廓、脚、鞋、黑色物体或普通暗区都不是手；当前图没有明确看见真实手部时，绝对不能选 occluded_by_hand。',
    '只要没有真实手部遮挡证据，并且地面接缝、家具边缘、画面边界或整体取景发生位移，或者参考图中的目标原位置已经不能继续可靠追踪，选 reacquire。轻微转动、裁切、目标跑出边缘以及目标不再位于原位置都统一选 reacquire，不再猜测究竟是镜头移动还是目标自身移动。',
    '图片过暗、模糊、遮挡关系或相机移动无法可靠区分时，选 uncertain。',
    'confidence 是 0 到 1 的数字。禁止输出方向、目标名称、解释、建议、播报文字或 JSON 以外的内容。'
  ].join('\n');
}

function parseFindObjectComparisonResult(rawText) {
  const parsed = tryParseJsonObject(rawText);
  const allowed = new Set([
    'target_visible',
    'occluded_by_hand',
    'reacquire',
    'uncertain'
  ]);
  const status = String(parsed?.status || '').trim();
  const confidence = Number(parsed?.confidence);
  if (!allowed.has(status) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }
  return { status, confidence };
}

function normalizeFindObjectLiveSessionId(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
}

function findObjectLiveSessionKey(reminderSessionId, comparisonMode = false) {
  return `${reminderSessionId}:${comparisonMode ? 'comparison' : 'single'}`;
}

function assertFindObjectLiveExperimentAvailable() {
  if (
    APP_VARIANT !== 'greencloud-gemini'
    || !GEMINI_LIVE_FIND_EXPERIMENT
  ) {
    throw httpError(404, '当前版本没有开放 Live 长连接找东西实验。');
  }
  if (!GEMINI_ACTIVE_REMINDER_API_KEYS.length) {
    throw httpError(503, 'Gemini API Key 未配置，Live 长连接找东西实验暂时不可用。');
  }
}

function geminiDirectFindClientAddress(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || 'unknown');
}

function assertGeminiDirectFindTokenRate(req, now = Date.now()) {
  const key = geminiDirectFindClientAddress(req);
  const windowMs = 10 * 60 * 1000;
  const previous = Array.isArray(geminiDirectFindTokenRateLimits.get(key))
    ? geminiDirectFindTokenRateLimits.get(key).filter((value) => now - value < windowMs)
    : [];
  if (previous.length >= 12) {
    throw httpError(429, '手机直连实验令牌请求过于频繁，请稍后再试。');
  }
  previous.push(now);
  geminiDirectFindTokenRateLimits.set(key, previous);
  if (geminiDirectFindTokenRateLimits.size > 200) {
    for (const [address, values] of geminiDirectFindTokenRateLimits.entries()) {
      const active = values.filter((value) => now - value < windowMs);
      if (active.length) {
        geminiDirectFindTokenRateLimits.set(address, active);
      } else {
        geminiDirectFindTokenRateLimits.delete(address);
      }
    }
  }
}

async function requestGeminiDirectFindToken(apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const now = Date.now();
    const response = await fetch(GEMINI_DIRECT_FIND_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + (15 * 60 * 1000)).toISOString(),
        newSessionExpireTime: new Date(now + (60 * 1000)).toISOString()
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!response.ok || !data?.name) {
      const error = httpError(response.status || 502, data?.error?.message || 'Gemini 没有签发手机直连短期令牌。');
      error.retryable = isGeminiKeyRetryStatus(response.status);
      throw error;
    }
    return data.name;
  } finally {
    clearTimeout(timeout);
  }
}

async function createGeminiDirectFindToken(req, body) {
  const activeReminderMode = body?.screenMode === 'active_reminder';
  if (activeReminderMode) {
    assertBrowserDirectScreenExperimentAvailable();
  } else {
    assertFindObjectLiveExperimentAvailable();
  }
  assertGeminiDirectFindTokenRate(req);
  const reminderSessionId = normalizeFindObjectLiveSessionId(body?.reminderSessionId);
  const comparisonMode = !activeReminderMode && Boolean(body?.comparisonMode);
  const excludeKeySlot = Math.max(0, Number(body?.excludeKeySlot || 0));
  const screenLane = Math.max(1, Math.min(2, Number(body?.screenLane || 1)));
  if (!reminderSessionId) {
    throw httpError(400, '手机直连图片实验缺少会话编号。');
  }
  const availableCandidates = getGeminiActiveReminderKeyCandidates();
  const candidates = orderGeminiDirectScreenKeyCandidates(
    availableCandidates,
    excludeKeySlot,
    screenLane
  );
  let lastError = null;
  for (const selected of candidates) {
    try {
      const token = await requestGeminiDirectFindToken(selected.key);
      console.log(`[direct-screen-token] issued=yes; mode=${activeReminderMode ? 'active_reminder' : comparisonMode ? 'find_comparison' : 'find_single'}; lane=${screenLane}; keySlot=${selected.index + 1}`);
      return {
        ok: true,
        token,
        model: GEMINI_LIVE_MODEL,
        apiVersion: 'v1alpha',
        comparisonMode,
        screenMode: activeReminderMode ? 'active_reminder' : 'find_object',
        screenLane,
        keySlot: selected.index + 1,
        systemInstruction: activeReminderMode
          ? buildActiveReminderLiveSystemInstruction()
          : buildFindObjectLiveSystemInstruction(comparisonMode),
        functionDeclaration: activeReminderMode
          ? buildActiveReminderLiveResultToolDeclaration()
          : buildFindObjectLiveResultToolDeclaration(comparisonMode),
        expiresInSeconds: 900,
        newSessionExpiresInSeconds: 60
      };
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError' || error?.retryable) {
        markGeminiActiveReminderKeyUnavailable(selected.index, error?.statusCode || 503);
        continue;
      }
      break;
    }
  }
  console.warn(`[direct-screen-token] issued=no; mode=${activeReminderMode ? 'active_reminder' : 'find_object'}; reason=${lastError?.message || 'unknown'}`);
  throw httpError(503, '手机直连短期令牌暂时无法签发。');
}

function isAppleLidarOnlyFindRequest(body, comparisonMode = false) {
  return !comparisonMode
    && APP_VARIANT === 'greencloud-gemini'
    && String(body?.nativeFindDepthPolicy || '') === 'apple_lidar_only_v1';
}

async function finalizeBrowserDirectFindResult(body) {
  assertBrowserDirectScreenExperimentAvailable();
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const comparisonMode = Boolean(body?.comparisonMode);
  const nativeHandStage = body?.nativeFindHandStage === true;
  const target = String(body?.target || '').replace(/\s+/g, ' ').trim();
  const frameCount = Number(body?.frameCount || 0);
  const referenceFrameCount = Number(body?.referenceFrameCount || 0);
  const reminderSessionId = normalizeFindObjectLiveSessionId(body?.reminderSessionId);
  const modelLatencyMs = Math.max(0, Number(body?.modelLatencyMs || 0));
  const screenLane = Math.max(1, Math.min(2, Number(body?.screenLane || 1)));
  const browserKeySlot = Math.max(0, Number(body?.browserKeySlot || 0));
  const liveTransport = body?.transport === 'browser-direct-live';
  const provider = liveTransport ? 'gemini-browser-direct-live' : 'gemini-browser-direct';
  const model = liveTransport ? GEMINI_LIVE_MODEL : GEMINI_DIRECT_ACTIVE_REMINDER_MODEL;
  const transport = liveTransport ? 'browser-direct-live' : 'browser-direct-generate-content';
  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '手机直连找东西实验没有收到有效图片。');
  }
  if (!target || target.length > 80 || /[；;\r\n]/.test(target)) {
    throw httpError(400, '手机直连找东西目标缺失或格式无效。');
  }
  if (!reminderSessionId) {
    throw httpError(400, '手机直连找东西实验缺少会话编号。');
  }
  const serialized = typeof body?.modelResult === 'string'
    ? body.modelResult
    : JSON.stringify(body?.modelResult || {});
  const modelParsed = comparisonMode
    ? parseFindObjectComparisonResult(serialized)
    : parseFindObjectResult(serialized, { nativeHandStage });
  if (!modelParsed) {
    throw httpError(422, '手机直连模型返回了无效找物结果。');
  }
  if (comparisonMode) {
    return {
      ok: true,
      provider,
      model,
      transport,
      frameCount,
      referenceFrameCount,
      comparisonMode: true,
      screenLane,
      browserKeySlot,
      ...modelParsed,
      depthAssist: null,
      latencyMs: modelLatencyMs,
      debugFrame: ''
    };
  }
  const startedAt = Date.now();
  const appleLidarOnly = isAppleLidarOnlyFindRequest(body, comparisonMode);
  const serverDepthEnabled = FIND_OBJECT_DEPTH_ASSIST_ENABLED && !appleLidarOnly;
  const depthResult = serverDepthEnabled
    ? await runFindDepthAssist(imageDataUrl)
    : { ok: false, error: appleLidarOnly ? 'apple_lidar_only' : 'disabled_for_find_object', latencyMs: 0 };
  const depthApplied = serverDepthEnabled
    ? applyFindDepthAssist(modelParsed, depthResult, {
      nativeHandStage,
      reminderSessionId,
      target,
      frameCount
    })
    : { result: modelParsed, metadata: null };
  const parsed = depthApplied.result;
  const depthAssist = depthApplied.metadata;
  const serverLatencyMs = Date.now() - startedAt;
  const latencyMs = modelLatencyMs + serverLatencyMs;
  const debugFrame = saveFindObjectFrame({
    imageDataUrl,
    frameCount,
    reminderSessionId,
    target,
    status: parsed.status,
    confidence: parsed.confidence,
    latencyMs,
    provider,
    model
  });
  console.log(`[find-object-direct] frame=${frameCount}; transport=${transport}; lane=${screenLane}; keySlot=${browserKeySlot}; target=${target.slice(0, 30)}; status=${parsed.status}; rawStatus=${modelParsed.status}; confidence=${parsed.confidence.toFixed(2)}; modelLatencyMs=${modelLatencyMs}; serverLatencyMs=${serverLatencyMs}; depthDecision=${appleLidarOnly ? 'apple_lidar_only' : depthAssist?.decision || ''}; targetDepthM=${depthAssist?.targetDepthM ?? ''}; smoothedDepthM=${depthAssist?.smoothedDepthM ?? ''}; modelNearCount=${depthAssist?.modelNearConfirmCount ?? ''}; modelNearOverride=${depthAssist?.modelNearOverride ? 'yes' : 'no'}; depthLatencyMs=${depthAssist?.latencyMs ?? ''}; debugFrame=${debugFrame || ''}`);
  return {
    ok: true,
    provider,
    model,
    transport,
    frameCount,
    referenceFrameCount: 0,
    comparisonMode: false,
    screenLane,
    browserKeySlot,
    ...parsed,
    depthAssist,
    serverDepthSkipped: appleLidarOnly,
    latencyMs,
    modelLatencyMs,
    serverLatencyMs,
    debugFrame: debugFrame || ''
  };
}

function buildFindObjectLiveSystemInstruction(comparisonMode = false) {
  const targetMarker = '以每轮请求中“目标：”后面的唯一目标为准';
  return [
    comparisonMode
      ? buildFindObjectComparisonPrompt(targetMarker)
      : buildFindObjectPrompt(targetMarker),
    '这是独立的逐帧筛图连接，不负责对话、播报或记忆。',
    comparisonMode
      ? '每轮请求会在同一用户回合中依次提供锁定参考图、当前图和文字要求；只比较该回合的两张图，忽略更早回合的所有图片。'
      : '每轮请求会在同一用户回合中提供一张最新图片和文字要求；只判断该回合的这一张图片，忽略更早回合的所有图片。',
    '每个用户回合必须只提交一次本模式指定的结果函数，不得引用或修正上一轮答案。',
    comparisonMode
      ? `必须调用 ${GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME} 提交 status 和 confidence；不得输出文字或语音。`
      : `必须调用 ${GEMINI_LIVE_FIND_RESULT_TOOL_NAME} 提交十一个既定字段；不得输出文字或语音。`
  ].join('\n');
}

function buildFindObjectLiveResultToolDeclaration(comparisonMode = false) {
  if (comparisonMode) {
    return {
      name: GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME,
      description: '提交本回合参考图与当前图的唯一遮挡比较结果。每回合必须调用且只能调用一次。',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['target_visible', 'occluded_by_hand', 'reacquire', 'uncertain']
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1
          }
        },
        required: ['status', 'confidence'],
        additionalProperties: false
      }
    };
  }
  return {
    name: GEMINI_LIVE_FIND_RESULT_TOOL_NAME,
    description: '提交本回合最新单帧图片的唯一找东西判断结果。每回合必须调用且只能调用一次。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [
            'target_missing',
            'walk_left',
            'walk_right',
            'walk_forward',
            'hand_missing',
            'move_left',
            'move_right',
            'move_forward',
            'move_backward',
            'contact',
            'uncertain'
          ]
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1
        },
        location: { type: 'string' },
        zone: {
          type: 'string',
          enum: ['left', 'center', 'right', 'unknown']
        },
        visible: {
          type: 'string',
          enum: ['yes', 'no', 'uncertain']
        },
        hand: {
          type: 'string',
          enum: ['visible', 'missing', 'uncertain']
        },
        view: {
          type: 'string',
          enum: ['wide_scene', 'close_support', 'uncertain']
        },
        supportBase: {
          type: 'string',
          enum: ['visible', 'hidden', 'not_applicable', 'uncertain']
        },
        foregroundFloor: {
          type: 'string',
          enum: ['large', 'small', 'none', 'uncertain']
        },
        targetX: {
          type: 'number',
          minimum: -1,
          maximum: 1
        },
        targetY: {
          type: 'number',
          minimum: -1,
          maximum: 1
        }
      },
      required: [
        'status',
        'confidence',
        'location',
        'zone',
        'visible',
        'hand',
        'view',
        'supportBase',
        'foregroundFloor',
        'targetX',
        'targetY'
      ],
      additionalProperties: false
    }
  };
}

function prepareBrowserDirectFindCheck(body) {
  assertBrowserDirectScreenExperimentAvailable();
  const target = String(body?.target || '').replace(/\s+/g, ' ').trim();
  const comparisonMode = Boolean(body?.comparisonMode);
  const nativeHandStage = body?.nativeFindHandStage === true;
  if (!target || target.length > 80 || /[；;\r\n]/.test(target)) {
    throw httpError(400, '手机直连找东西目标缺失或格式无效。');
  }
  return {
    ok: true,
    model: GEMINI_DIRECT_ACTIVE_REMINDER_MODEL,
    prompt: comparisonMode
      ? buildFindObjectComparisonPrompt(target)
      : buildFindObjectPrompt(target, { nativeHandStage }),
    comparisonMode,
    maxOutputTokens: comparisonMode ? 64 : 192,
    timeoutMs: GEMINI_IMAGE_REQUEST_TIMEOUT_MS
  };
}

function buildActiveReminderLiveSystemInstruction() {
  return [
    '这是独立的逐帧主动提醒筛图连接，不负责对话、确认句或播报。',
    '每轮请求会在同一用户回合中提供一张最新图片和该帧完整判断规则；只判断本回合这一张图片，忽略更早回合的图片和结果。',
    '每轮文字规则虽然要求输出JSON，但你必须把规则要求的字段作为函数参数提交，不得输出文字、JSON文本或语音。',
    'observationValid在画面足以可靠观察合同主体和状态时为true；目标未出现、出画、遮挡、模糊、看不清或证据不足时为false。第三类状态变化必须严格服从本轮规则，不得把暂时看不到当成新状态。',
    `每个用户回合必须只调用一次 ${GEMINI_LIVE_ACTIVE_REMINDER_RESULT_TOOL_NAME}，不得引用、补充或修正上一轮结果。`
  ].join('\n');
}

function buildActiveReminderLiveResultToolDeclaration() {
  return {
    name: GEMINI_LIVE_ACTIVE_REMINDER_RESULT_TOOL_NAME,
    description: '提交本回合最新单帧图片的唯一主动提醒快筛结果。每回合必须调用且只能调用一次。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['NO_HIT', 'HIT', 'PROGRESS', 'UNCERTAIN']
        },
        currentState: { type: 'string' },
        observation: { type: 'string' },
        speakable: { type: 'boolean' },
        resultReached: { type: 'boolean' },
        resultText: { type: 'string' },
        instanceKey: { type: 'string' },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1
        },
        observationValid: { type: 'boolean' }
      },
      required: [
        'state',
        'currentState',
        'observation',
        'speakable',
        'resultReached',
        'resultText',
        'instanceKey',
        'confidence',
        'observationValid'
      ],
      additionalProperties: false
    }
  };
}

function failFindObjectLiveSession(manager, error, reason = 'session_failed') {
  if (!manager || manager.closed) {
    return;
  }
  manager.closed = true;
  clearTimeout(manager.connectTimer);
  const failure = error instanceof Error ? error : new Error(String(error || 'Live 图片连接已断开。'));
  if (!manager.readySettled) {
    manager.readySettled = true;
    manager.rejectReady(failure);
  }
  if (manager.pending) {
    clearTimeout(manager.pending.timer);
    manager.pending.reject(failure);
    manager.pending = null;
  }
  findObjectLiveSessions.delete(manager.key);
  try {
    manager.session?.close?.();
  } catch {
    // The SDK may have already closed the connection.
  }
  console.warn(`[find-object-live:${manager.connectionId}] closed; reason=${reason}; message=${failure.message}`);
}

function createFindObjectLiveSession(reminderSessionId, comparisonMode = false) {
  const candidates = getGeminiActiveReminderKeyCandidates();
  const selected = candidates[0];
  if (!selected?.key) {
    throw httpError(503, 'Gemini API Key 未配置。');
  }
  const key = findObjectLiveSessionKey(reminderSessionId, comparisonMode);
  const connectionId = `${comparisonMode ? 'cmp' : 'one'}-${Math.random().toString(36).slice(2, 8)}`;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const manager = {
    key,
    connectionId,
    reminderSessionId,
    comparisonMode,
    keyIndex: selected.index,
    session: null,
    opened: false,
    closed: false,
    readySettled: false,
    resolveReady,
    rejectReady,
    readyPromise,
    connectTimer: null,
    pending: null,
    requestCount: 0,
    createdAt: Date.now(),
    lastUsedAt: Date.now()
  };
  findObjectLiveSessions.set(key, manager);

  const markReady = () => {
    if (
      manager.closed
      || manager.readySettled
      || !manager.opened
      || !manager.session
    ) {
      return;
    }
    manager.readySettled = true;
    clearTimeout(manager.connectTimer);
    manager.resolveReady(manager);
    console.log(`[find-object-live:${connectionId}] ready; mode=${comparisonMode ? 'comparison' : 'single'}; keySlot=${selected.index + 1}; connectLatencyMs=${Date.now() - manager.createdAt}`);
  };

  const ai = new GoogleGenAI({
    apiKey: selected.key,
    httpOptions: { apiVersion: 'v1beta' }
  });
  manager.connectTimer = setTimeout(() => {
    markGeminiActiveReminderKeyUnavailable(selected.index, 504);
    failFindObjectLiveSession(manager, new Error('Live 图片连接建立超时。'), 'connect_timeout');
  }, 10000);

  ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      ...(!/^gemini-3\.8-live$/i.test(GEMINI_LIVE_MODEL)
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
        : {}),
      systemInstruction: buildFindObjectLiveSystemInstruction(comparisonMode),
      tools: [{
        functionDeclarations: [buildFindObjectLiveResultToolDeclaration(comparisonMode)]
      }]
    },
    callbacks: {
      onopen: () => {
        manager.opened = true;
        markReady();
      },
      onmessage: (message) => {
        const pending = manager.pending;
        if (!pending) {
          return;
        }
        const expectedToolName = manager.comparisonMode
          ? GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME
          : GEMINI_LIVE_FIND_RESULT_TOOL_NAME;
        const functionCalls = Array.isArray(message?.toolCall?.functionCalls)
          ? message.toolCall.functionCalls
          : [];
        const resultCall = functionCalls.find((call) => call?.name === expectedToolName);
        if (resultCall && !pending.resultText) {
          pending.resultText = typeof resultCall.args === 'string'
            ? resultCall.args
            : JSON.stringify(resultCall.args || {});
          try {
            manager.session.sendToolResponse({
              functionResponses: [{
                id: resultCall.id,
                name: resultCall.name,
                response: { accepted: true }
              }]
            });
          } catch (error) {
            clearTimeout(pending.timer);
            manager.pending = null;
            pending.reject(error);
            return;
          }
        }
        if (message?.serverContent?.interrupted) {
          clearTimeout(pending.timer);
          manager.pending = null;
          pending.reject(new Error('Live 图片判断被中断。'));
          return;
        }
        if (message?.serverContent?.turnComplete) {
          clearTimeout(pending.timer);
          manager.pending = null;
          if (pending.resultText) {
            pending.resolve(pending.resultText);
          } else {
            pending.reject(new Error('Live 图片判断没有提交结果函数。'));
          }
        }
      },
      onerror: (event) => {
        const message = event?.message || event?.error?.message || String(event || 'Live 图片连接错误。');
        markGeminiActiveReminderKeyUnavailable(selected.index, 503);
        failFindObjectLiveSession(manager, new Error(message), 'upstream_error');
      },
      onclose: (event) => {
        if (manager.closed) {
          return;
        }
        markGeminiActiveReminderKeyUnavailable(selected.index, Number(event?.code) || 503);
        failFindObjectLiveSession(
          manager,
          new Error(`Live 图片连接已关闭${event?.reason ? `：${event.reason}` : '。'}`),
          'upstream_close'
        );
      }
    }
  }).then((session) => {
    manager.session = session;
    markReady();
  }).catch((error) => {
    markGeminiActiveReminderKeyUnavailable(selected.index, 503);
    failFindObjectLiveSession(manager, error, 'connect_failed');
  });

  return manager;
}

async function getFindObjectLiveSession(reminderSessionId, comparisonMode = false) {
  pruneFindObjectLiveSessions();
  const key = findObjectLiveSessionKey(reminderSessionId, comparisonMode);
  let manager = findObjectLiveSessions.get(key);
  if (!manager || manager.closed) {
    manager = createFindObjectLiveSession(reminderSessionId, comparisonMode);
  }
  await manager.readyPromise;
  manager.lastUsedAt = Date.now();
  return manager;
}

function closeFindObjectLiveSessions(reminderSessionIdValue, reason = 'closed') {
  const reminderSessionId = normalizeFindObjectLiveSessionId(reminderSessionIdValue);
  if (!reminderSessionId) {
    return 0;
  }
  let closedCount = 0;
  for (const manager of [...findObjectLiveSessions.values()]) {
    if (manager.reminderSessionId !== reminderSessionId) {
      continue;
    }
    closedCount += 1;
    failFindObjectLiveSession(manager, new Error('Live 图片实验会话已结束。'), reason);
  }
  return closedCount;
}

function pruneFindObjectLiveSessions(now = Date.now()) {
  for (const manager of [...findObjectLiveSessions.values()]) {
    if (now - manager.lastUsedAt > FIND_OBJECT_LIVE_SESSION_IDLE_MS) {
      failFindObjectLiveSession(manager, new Error('Live 图片实验会话空闲超时。'), 'idle_timeout');
    }
  }
}

async function requestFindObjectLiveResult(manager, {
  imageDataUrl,
  referenceImageDataUrl = '',
  target,
  frameCount,
  nativeHandStage = false
}) {
  if (manager.pending) {
    throw httpError(409, '上一张 Live 图片仍在判断，本帧未发送。');
  }
  const currentImage = parseServerImageDataUrl(imageDataUrl);
  const referenceImage = referenceImageDataUrl
    ? parseServerImageDataUrl(referenceImageDataUrl)
    : null;
  if (!currentImage || (manager.comparisonMode && !referenceImage)) {
    throw httpError(400, 'Live 找东西实验没有收到有效图片。');
  }
  manager.requestCount += 1;
  manager.lastUsedAt = Date.now();
  const requestLabel = `${manager.connectionId}-${manager.requestCount}-${frameCount}`;
  const responsePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (manager.pending?.requestLabel !== requestLabel) {
        return;
      }
      const timeoutError = httpError(504, `Live 图片判断超过 ${GEMINI_LIVE_FIND_TIMEOUT_MS} 毫秒。`);
      manager.pending = null;
      reject(timeoutError);
      failFindObjectLiveSession(manager, timeoutError, 'request_timeout');
    }, GEMINI_LIVE_FIND_TIMEOUT_MS);
    manager.pending = {
      requestLabel,
      resultText: '',
      resolve,
      reject,
      timer
    };
  });

  try {
    if (manager.comparisonMode) {
      manager.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [
            { inlineData: referenceImage },
            { inlineData: currentImage },
            { text: `[SCREEN ${requestLabel}]\n目标：${target}\n第1张是锁定参考图，第2张是当前图。只比较本回合这两张图并输出 JSON。` }
          ]
        }],
        turnComplete: true
      });
    } else {
      manager.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [
            { inlineData: currentImage },
            {
              text: `[SCREEN ${requestLabel}]\n目标：${target}\n${nativeHandStage ? '苹果雷达已确认进入伸手阶段。只判断手相对目标的方向或是否接触，禁止输出任何 walk 状态。\n' : ''}只判断本回合这一张最新图片并提交结果函数。`
            }
          ]
        }],
        turnComplete: true
      });
    }
  } catch (error) {
    if (manager.pending?.requestLabel === requestLabel) {
      clearTimeout(manager.pending.timer);
      manager.pending = null;
    }
    throw error;
  }
  return responsePromise;
}

async function warmFindObjectLiveSession(body) {
  assertFindObjectLiveExperimentAvailable();
  const reminderSessionId = normalizeFindObjectLiveSessionId(body?.reminderSessionId);
  if (!reminderSessionId) {
    throw httpError(400, 'Live 找东西实验缺少会话编号。');
  }
  const startedAt = Date.now();
  const manager = await getFindObjectLiveSession(reminderSessionId, false);
  return {
    ok: true,
    model: GEMINI_LIVE_MODEL,
    reminderSessionId,
    connectionId: manager.connectionId,
    latencyMs: Date.now() - startedAt
  };
}

async function runFindObjectLiveCheck(body) {
  assertFindObjectLiveExperimentAvailable();
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const referenceImageDataUrl = typeof body?.referenceImageDataUrl === 'string' ? body.referenceImageDataUrl : '';
  const comparisonMode = Boolean(body?.comparisonMode);
  const target = String(body?.target || '').replace(/\s+/g, ' ').trim();
  const frameCount = Number(body?.frameCount || 0);
  const referenceFrameCount = Number(body?.referenceFrameCount || 0);
  const reminderSessionId = normalizeFindObjectLiveSessionId(body?.reminderSessionId);
  const nativeHandStage = body?.nativeFindHandStage === true;
  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, 'Live 找东西模式没有收到有效图片。');
  }
  if (!target || target.length > 80 || /[；;\r\n]/.test(target)) {
    throw httpError(400, 'Live 找东西目标缺失或格式无效。');
  }
  if (!reminderSessionId) {
    throw httpError(400, 'Live 找东西实验缺少会话编号。');
  }
  if (comparisonMode && !referenceImageDataUrl.startsWith('data:image/')) {
    throw httpError(400, 'Live 找东西遮挡比较没有收到有效参考图片。');
  }

  const startedAt = Date.now();
  const appleLidarOnly = isAppleLidarOnlyFindRequest(body, comparisonMode);
  const serverDepthEnabled = FIND_OBJECT_DEPTH_ASSIST_ENABLED && !appleLidarOnly;
  const depthPromise = comparisonMode || !serverDepthEnabled
    ? Promise.resolve({ ok: false, error: 'comparison_mode', latencyMs: 0 })
    : runFindDepthAssist(imageDataUrl);
  const manager = await getFindObjectLiveSession(reminderSessionId, comparisonMode);
  const [modelText, depthResult] = await Promise.all([
    requestFindObjectLiveResult(manager, {
      imageDataUrl,
      referenceImageDataUrl,
      target,
      frameCount,
      nativeHandStage
    }),
    depthPromise
  ]);
  const modelParsed = comparisonMode
    ? parseFindObjectComparisonResult(modelText)
    : parseFindObjectResult(modelText, { nativeHandStage });
  if (!modelParsed) {
    throw httpError(
      422,
      comparisonMode
        ? 'Live 找东西遮挡比较返回了无效单选结果。'
        : 'Live 找东西模型返回了无效单选结果。'
    );
  }
  const depthApplied = comparisonMode || !serverDepthEnabled
    ? { result: modelParsed, metadata: null }
    : applyFindDepthAssist(modelParsed, depthResult, {
      nativeHandStage,
      reminderSessionId,
      target,
      frameCount
    });
  const parsed = depthApplied.result;
  const depthAssist = depthApplied.metadata;
  const latencyMs = Date.now() - startedAt;
  const debugFrame = saveFindObjectFrame({
    imageDataUrl,
    frameCount,
    reminderSessionId,
    target,
    status: parsed.status,
    confidence: parsed.confidence,
    latencyMs,
    provider: 'gemini-live-persistent',
    model: GEMINI_LIVE_MODEL
  });
  console.log(`[find-object-live] frame=${frameCount}; referenceFrame=${comparisonMode ? referenceFrameCount : 0}; mode=${comparisonMode ? 'comparison' : 'single'}; target=${target.slice(0, 30)}; status=${parsed.status}; rawStatus=${modelParsed.status}; confidence=${parsed.confidence.toFixed(2)}; latencyMs=${latencyMs}; connectionId=${manager.connectionId}; requestCount=${manager.requestCount}; depthDecision=${appleLidarOnly ? 'apple_lidar_only' : depthAssist?.decision || ''}; targetDepthM=${depthAssist?.targetDepthM ?? ''}; smoothedDepthM=${depthAssist?.smoothedDepthM ?? ''}; modelNearCount=${depthAssist?.modelNearConfirmCount ?? ''}; modelNearOverride=${depthAssist?.modelNearOverride ? 'yes' : 'no'}; depthLatencyMs=${depthAssist?.latencyMs ?? ''}; debugFrame=${debugFrame || ''}`);
  return {
    ok: true,
    provider: 'gemini-live-persistent',
    model: GEMINI_LIVE_MODEL,
    transport: 'persistent-live',
    frameCount,
    referenceFrameCount: comparisonMode ? referenceFrameCount : 0,
    comparisonMode,
    ...parsed,
    depthAssist,
    serverDepthSkipped: appleLidarOnly,
    latencyMs,
    debugFrame: debugFrame || ''
  };
}

async function runFindObjectCheck(body) {
  if (APP_VARIANT !== 'greencloud-gemini' && APP_VARIANT !== 'aliyun') {
    throw httpError(404, '当前版本没有开放找东西实验。');
  }
  if (!activeReminderConfigured()) {
    throw httpError(503, '图片快筛模型未配置，找东西实验暂时不可用。');
  }
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const referenceImageDataUrl = typeof body.referenceImageDataUrl === 'string' ? body.referenceImageDataUrl : '';
  const comparisonMode = Boolean(body.comparisonMode);
  const subjectLocked = APP_VARIANT === 'aliyun' && Boolean(body.subjectLocked) && !comparisonMode;
  const referenceTargetX = Number(body.referenceTargetX);
  const referenceTargetY = Number(body.referenceTargetY);
  const target = String(body.target || '').replace(/\s+/g, ' ').trim();
  const frameCount = Number(body.frameCount || 0);
  const referenceFrameCount = Number(body.referenceFrameCount || 0);
  const reminderSessionId = String(body.reminderSessionId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '找东西模式没有收到有效图片。');
  }
  if (!target || target.length > 80 || /[；;\r\n]/.test(target)) {
    throw httpError(400, '找东西目标缺失或格式无效。');
  }
  if (comparisonMode && !referenceImageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '找东西遮挡比较没有收到有效参考图片。');
  }
  if (
    subjectLocked
    && (
      !referenceImageDataUrl.startsWith('data:image/')
      || !Number.isFinite(referenceTargetX)
      || referenceTargetX < 0
      || referenceTargetX > 1
      || !Number.isFinite(referenceTargetY)
      || referenceTargetY < 0
      || referenceTargetY > 1
    )
  ) {
    throw httpError(400, '找东西主体跟随缺少有效参考图片或主体坐标。');
  }
  const startedAt = Date.now();
  const nativeHandStage = body?.nativeFindHandStage === true;
  const appleLidarOnly = isAppleLidarOnlyFindRequest(body, comparisonMode);
  const serverDepthEnabled = FIND_OBJECT_DEPTH_ASSIST_ENABLED && !appleLidarOnly;
  const depthPromise = comparisonMode || !serverDepthEnabled
    ? Promise.resolve({ ok: false, error: 'comparison_mode', latencyMs: 0 })
    : runFindDepthAssist(imageDataUrl);
  const [modelText, depthResult] = await Promise.all([callActiveReminderModel({
    prompt: comparisonMode
      ? buildFindObjectComparisonPrompt(target)
      : buildFindObjectPrompt(target, {
        subjectLocked,
        nativeHandStage,
        referenceTargetX,
        referenceTargetY
      }),
    imageDataUrls: comparisonMode || subjectLocked
      ? [referenceImageDataUrl, imageDataUrl]
      : [imageDataUrl],
    jsonMode: true,
    maxOutputTokens: comparisonMode ? 64 : 192,
    timeoutMs: 10000,
    realtimeImageTask: 'find_object',
    realtimeRequestId: String(body?.realtimeRequestId || ''),
    capturedAt: Number(body?.capturedAt || 0),
    clientRequestSentAt: Number(body?.requestSentAt || 0),
    inFlightCount: Number(body?.inFlightCount || 0)
  }), depthPromise]);
  const modelParsed = comparisonMode
    ? parseFindObjectComparisonResult(modelText)
    : parseFindObjectResult(modelText, { nativeHandStage });
  if (!modelParsed) {
    throw httpError(422, comparisonMode ? '找东西遮挡比较返回了无效单选结果。' : '找东西视觉模型返回了无效单选结果。');
  }
  const depthApplied = comparisonMode || !serverDepthEnabled
    ? { result: modelParsed, metadata: null }
    : applyFindDepthAssist(modelParsed, depthResult, {
      nativeHandStage,
      reminderSessionId,
      target,
      frameCount
    });
  const parsed = depthApplied.result;
  const depthAssist = depthApplied.metadata;
  const latencyMs = Date.now() - startedAt;
  const debugFrame = saveFindObjectFrame({
    imageDataUrl,
    frameCount,
    reminderSessionId,
    target,
    status: parsed.status,
    confidence: parsed.confidence,
    latencyMs,
    provider: activeReminderProvider(),
    model: activeReminderModelName()
  });
  console.log(`[find-object] frame=${frameCount}; referenceFrame=${comparisonMode || subjectLocked ? referenceFrameCount : 0}; mode=${comparisonMode ? 'comparison' : subjectLocked ? 'subject_follow' : 'single'}; target=${target.slice(0, 30)}; status=${parsed.status}; rawStatus=${modelParsed.status}; confidence=${parsed.confidence.toFixed(2)}; latencyMs=${latencyMs}; depthDecision=${appleLidarOnly ? 'apple_lidar_only' : depthAssist?.decision || ''}; targetDepthM=${depthAssist?.targetDepthM ?? ''}; smoothedDepthM=${depthAssist?.smoothedDepthM ?? ''}; depthTrend=${depthAssist?.trend || ''}; modelNearCount=${depthAssist?.modelNearConfirmCount ?? ''}; modelNearOverride=${depthAssist?.modelNearOverride ? 'yes' : 'no'}; depthLatencyMs=${depthAssist?.latencyMs ?? ''}; debugFrame=${debugFrame || ''}`);
  return {
    ok: true,
    provider: activeReminderProvider(),
    model: activeReminderModelName(),
    frameCount,
    referenceFrameCount: comparisonMode || subjectLocked ? referenceFrameCount : 0,
    comparisonMode,
    subjectLocked,
    ...parsed,
    depthAssist,
    serverDepthSkipped: appleLidarOnly,
    latencyMs,
    debugFrame: debugFrame || ''
  };
}

function normalizeActiveReminderPromptMode(value) {
  return value === 'deep_multitask'
    ? 'deep_multitask'
    : value === 'scene_context'
      ? 'scene_context'
      : 'baseline';
}

function assertBrowserDirectScreenExperimentAvailable() {
  if (
    APP_VARIANT !== 'greencloud-gemini'
    || !GEMINI_BROWSER_DIRECT_SCREEN_EXPERIMENT
    || activeReminderProvider() !== 'gemini'
  ) {
    throw httpError(404, '当前版本没有开放手机直连筛图实验。');
  }
  if (!GEMINI_API_KEY) {
    throw httpError(503, 'Gemini API Key 未配置，手机直连筛图暂时不可用。');
  }
}

function prepareBrowserDirectActiveReminderCheck(body) {
  assertBrowserDirectScreenExperimentAvailable();
  const task = String(body?.task || '').replace(/\s+/g, ' ').trim();
  const promptMode = normalizeActiveReminderPromptMode(body?.promptMode);
  if (!task || task.length > 1200) {
    throw httpError(400, '手机直连主动提醒任务缺失或格式无效。');
  }
  return {
    ok: true,
    model: GEMINI_DIRECT_ACTIVE_REMINDER_MODEL,
    prompt: buildActiveReminderPrompt(task, promptMode, APP_VARIANT === 'greencloud-gemini'),
    promptMode,
    jsonMode: promptMode === 'deep_multitask' || promptMode === 'scene_context',
    maxOutputTokens: promptMode === 'deep_multitask' || promptMode === 'scene_context' ? 160 : 48,
    timeoutMs: GEMINI_IMAGE_REQUEST_TIMEOUT_MS
  };
}

function finalizeActiveReminderModelResult({
  imageDataUrl,
  task,
  promptMode,
  frameCount,
  modelText,
  prompt,
  latencyMs,
  provider,
  model,
  transport = ''
}) {
  const sceneContext = promptMode === 'scene_context'
    ? parseActiveReminderSceneContext(modelText)
    : null;
  const structured = promptMode === 'deep_multitask'
    ? parseActiveReminderObservation(modelText, APP_VARIANT === 'greencloud-gemini' && /(?:^|[；;])mode=state_changed(?:[；;]|$)/.test(task))
    : null;
  const stateTrackingTask = isServerActiveReminderStateTrackingTask(task);
  let rawText = sceneContext?.scene || structured?.observation || structured?.currentState || normalizeActiveReminderModelText(modelText);
  let state = sceneContext ? 'SCENE' : structured?.state || '';
  let speakable = structured?.speakable;
  let shouldAlert;
  if (sceneContext) {
    shouldAlert = false;
    speakable = false;
  } else if (structured) {
    shouldAlert = Boolean(
      !stateTrackingTask
      && structured.speakable
      && (structured.state === 'HIT' || structured.state === 'PROGRESS')
      && structured.observation
    );
    if (!shouldAlert && !rawText) {
      rawText = structured.state || 'NO_HIT';
    }
  } else {
    const compactRawText = rawText.toUpperCase().replace(/[\s"'“”‘’。．.，,！!？?：:；;、]/g, '');
    const negativeText = /^(N|NO|没|没有|未|不|无法|不能|看不清|不确定)/i.test(rawText);
    shouldAlert = Boolean(rawText) && compactRawText !== 'N' && compactRawText !== 'NO' && !negativeText;
    if (shouldAlert && Array.from(rawText).length <= 4 && !/(看到|看见|出现|前方|左侧|右侧|疑似|可能)/.test(rawText)) {
      rawText = `看到${rawText}出现在画面中`;
    }
    state = shouldAlert ? 'HIT' : 'NO_HIT';
    speakable = shouldAlert;
  }
  let observationText = structured?.observation || '';
  let currentStateText = structured?.currentState || '';
  const resultReached = Boolean(structured?.resultReached);
  const resultText = structured?.resultText || '';
  const instanceKey = structured?.instanceKey || '';
  const confidence = structured?.confidence ?? null;
  if (shouldAlert) {
    const detailedAppearance = APP_VARIANT === 'greencloud-gemini'
      && /^gemini(?:-|$)/.test(provider) && structured
      && /category=target_presence[；;].*lifecycle=once[；;]/.test(task);
    rawText = detailedAppearance
      ? normalizeActiveReminderModelText(rawText)
      : stabilizeActiveReminderObservation(rawText, task);
    if (structured) {
      observationText = rawText;
      currentStateText = currentStateText || rawText;
    }
  }
  logActiveReminderResult({
    frameCount,
    task,
    shouldAlert,
    rawText,
    state,
    observation: observationText,
    currentState: currentStateText,
    resultReached,
    resultText,
    instanceKey,
    scene: sceneContext?.scene || '',
    relation: sceneContext?.relation || '',
    speakable,
    confidence,
    latencyMs,
    provider,
    model,
    promptMode,
    prompt,
    transport
  });
  saveActiveReminderFrame({
    imageDataUrl,
    frameCount,
    task,
    shouldAlert,
    rawText,
    state,
    observation: observationText,
    currentState: currentStateText,
    resultReached,
    resultText,
    instanceKey,
    scene: sceneContext?.scene || '',
    relation: sceneContext?.relation || '',
    speakable,
    confidence,
    latencyMs,
    provider,
    model,
    promptMode,
    prompt,
    transport
  });
  return {
    ok: true,
    provider,
    configured: true,
    model,
    transport,
    promptMode,
    shouldAlert,
    state,
    observation: observationText,
    currentState: currentStateText,
    resultReached,
    resultText,
    instanceKey,
    scene: sceneContext?.scene || '',
    relation: sceneContext?.relation || '',
    speakable,
    confidence,
    rawText: rawText.slice(0, 20),
    latencyMs
  };
}

function finalizeBrowserDirectActiveReminderCheck(body) {
  assertBrowserDirectScreenExperimentAvailable();
  const startedAt = Date.now();
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const task = String(body?.task || '').replace(/\s+/g, ' ').trim();
  const promptMode = normalizeActiveReminderPromptMode(body?.promptMode);
  const frameCount = Number(body?.frameCount || 0);
  const modelText = String(body?.modelText || '').trim().slice(0, 20000);
  const modelLatencyMs = Math.max(0, Number(body?.modelLatencyMs || 0));
  const browserKeySlot = Math.max(0, Number(body?.browserKeySlot || 0));
  const liveTransport = body?.transport === 'browser-direct-live';
  const screenLane = Math.max(1, Math.min(2, Number(body?.screenLane || 1)));
  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '手机直连主动提醒没有收到有效图片。');
  }
  if (!task || task.length > 1200 || !modelText) {
    throw httpError(400, '手机直连主动提醒结果缺失或格式无效。');
  }
  const prompt = buildActiveReminderPrompt(task, promptMode, APP_VARIANT === 'greencloud-gemini');
  const serverLatencyMs = Date.now() - startedAt;
  const result = finalizeActiveReminderModelResult({
    imageDataUrl,
    task,
    promptMode,
    frameCount,
    modelText,
    prompt,
    latencyMs: modelLatencyMs + serverLatencyMs,
    provider: liveTransport ? 'gemini-browser-direct-live' : 'gemini-browser-direct',
    model: liveTransport ? GEMINI_LIVE_MODEL : GEMINI_DIRECT_ACTIVE_REMINDER_MODEL,
    transport: liveTransport ? 'browser-direct-live' : 'browser-direct-generate-content'
  });
  console.log(`[active-reminder-direct] frame=${frameCount}; transport=${result.transport}; lane=${screenLane}; keySlot=${browserKeySlot}; task=${task.slice(0, 50)}; alert=${result.shouldAlert ? 'yes' : 'no'}; state=${result.state || ''}; modelLatencyMs=${modelLatencyMs}; serverLatencyMs=${serverLatencyMs}`);
  return {
    ...result,
    modelLatencyMs,
    serverLatencyMs,
    browserKeySlot,
    screenLane
  };
}

async function runActiveReminderCheck(body) {
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const task = String(body.task || '').replace(/\s+/g, ' ').trim();
  const promptMode = normalizeActiveReminderPromptMode(body.promptMode);
  const frameCount = Number(body.frameCount || 0);
  const startedAt = Date.now();

  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '主动提醒没有收到有效图片。');
  }

  if (!task) {
    const latencyMs = Date.now() - startedAt;
    logActiveReminderResult({
      frameCount,
      task: '',
      shouldAlert: false,
      rawText: 'N',
      latencyMs,
      provider: 'idle'
    });
    saveActiveReminderFrame({
      imageDataUrl,
      frameCount,
      task: '',
      shouldAlert: false,
      rawText: 'N',
      latencyMs,
      provider: 'idle'
    });
    return {
      ok: true,
      provider: 'idle',
      configured: activeReminderConfigured(),
      model: activeReminderModelName(),
      shouldAlert: false,
      rawText: 'N',
      latencyMs
    };
  }

  if (task.includes('测试主动提醒')) {
    const latencyMs = Date.now() - startedAt;
    logActiveReminderResult({
      frameCount,
      task,
      shouldAlert: true,
      rawText: 'Y',
      latencyMs,
      provider: 'test'
    });
    saveActiveReminderFrame({
      imageDataUrl,
      frameCount,
      task,
      shouldAlert: true,
      rawText: 'Y',
      latencyMs,
      provider: 'test'
    });
    return {
      ok: true,
      provider: 'test',
      configured: true,
      model: activeReminderModelName(),
      shouldAlert: true,
      rawText: 'Y',
      latencyMs
    };
  }

  if (!activeReminderConfigured()) {
    return {
      ok: true,
      provider: 'demo',
      configured: false,
      model: activeReminderModelName(),
      shouldAlert: false,
      rawText: 'N',
      latencyMs: 0
    };
  }

  const prompt = buildActiveReminderPrompt(task, promptMode, APP_VARIANT === 'greencloud-gemini');
  const modelText = await callActiveReminderModel({
    prompt,
    imageDataUrl,
    jsonMode: promptMode === 'deep_multitask' || promptMode === 'scene_context',
    maxOutputTokens: promptMode === 'deep_multitask' || promptMode === 'scene_context' ? 160 : 48,
    timeoutMs: 10000,
    realtimeImageTask: 'active_reminder',
    realtimeRequestId: String(body?.realtimeRequestId || ''),
    capturedAt: Number(body?.capturedAt || 0),
    clientRequestSentAt: Number(body?.requestSentAt || 0),
    inFlightCount: Number(body?.inFlightCount || 0)
  });
  return finalizeActiveReminderModelResult({
    imageDataUrl,
    task,
    promptMode,
    frameCount,
    modelText,
    prompt,
    latencyMs: Date.now() - startedAt,
    provider: activeReminderProvider(),
    model: activeReminderModelName(),
    transport: 'server-generate-content'
  });
}

async function runActiveReminderTaskNormalize(body) {
  const inputTranscript = String(body.inputTranscript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const outputTranscript = String(body.outputTranscript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const startedAt = Date.now();

  if (!inputTranscript && !outputTranscript) {
    throw httpError(400, '任务归一化没有收到用户任务或模型确认句。');
  }

  if (!activeReminderConfigured()) {
    return {
      ok: true,
      provider: 'demo',
      configured: false,
      model: activeReminderModelName(),
      inputTranscript,
      outputTranscript,
      rawText: '',
      category: '',
      mode: '',
      lifecycle: '',
      target: '',
      condition: '',
      speakText: '',
      taskText: '',
      confidence: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const prompt = buildActiveReminderTaskNormalizePrompt(inputTranscript, outputTranscript);
  let modelText = '';
  let normalized = null;
  let attempts = 0;
  while (!normalized && attempts < 2) {
    attempts += 1;
    const attemptPrompt = attempts === 1
      ? prompt
      : `${prompt}\n\n你上一份输出未通过合同结构检查。请重新输出且只输出一个完整 JSON 对象，不得解释，不得省略固定字段。特别检查：如果 contractType=change_continuous，yesCondition 只能写 filterSubject 每一张图片的当前状态维度，例如“主体的当前位置”“主体的当前数量”“主体的当前开关状态”；绝对不能写发生变化、与上一帧不同、前后改变、历史状态或基线。`;
    modelText = await callActiveReminderModel({
      prompt: attemptPrompt,
      jsonMode: true,
      maxOutputTokens: 320,
      timeoutMs: 15000
    });
    normalized = parseActiveReminderTaskNormalize(modelText);
  }
  if (!normalized) {
    throw httpError(422, '主动提醒归一化模型连续两次返回无效合同，请重新说一次任务。');
  }
  const latencyMs = Date.now() - startedAt;
  console.log(`[active-reminder-task] action=${normalized.action}; contractType=${normalized.contractType || ''}; category=${normalized.category || ''}; target=${String(normalized.target || '').slice(0, 30)}; condition=${String(normalized.condition || '').slice(0, 40)}; attempts=${attempts}; latencyMs=${latencyMs}`);

  return {
    ok: true,
    provider: activeReminderProvider(),
    configured: true,
    model: activeReminderModelName(),
    inputTranscript,
    outputTranscript,
    rawText: modelText.slice(0, 800),
    ...normalized,
    attempts,
    latencyMs
  };
}

function resolveUnifiedStrictSpecialModeCue(transcript) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  const findMatch = compact.match(/^(帮我找|给我找)(.+)$/);
  if (findMatch && !/^(东西|一下|一找)$/.test(findMatch[2])) {
    return 'find_object';
  }
  if (/^持续播报/.test(compact)) {
    return 'continuous_narration';
  }
  return '';
}

function isUnifiedStrictPendingAnswer(transcript, expected) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  if (expected === 'confirm') {
    return /^(是|是的|对|对的|可以|开始|是开始|对开始|可以开始)$/.test(compact);
  }
  return /^(不是|不对|不用|取消|先不用|不要)$/.test(compact);
}

function buildUnifiedVisualTaskClassifyPrompt({
  transcript,
  activeMode = '',
  pendingMode = '',
  pendingSubject = '',
  findTouchConfirmationPending = false
}) {
  return [
    '你是纯阿里实时慧眼的顶层分发模型。你的作用只相当于替用户按下主动提醒、找东西或持续播报三个旧入口中的一个。',
    '你只决定把用户完整原话交给哪个独立模块，不得签主动提醒合同，不得写找物执行目标，不得写持续播报执行重点。',
    '只输出 JSON 对象，字段固定为 action、subject、confirmationSpeech、confidence。',
    'action 只能单选：ordinary、propose_find_object、propose_continuous_narration、confirm_pending、reject_pending、route_active_reminder、update_find_object、update_continuous_narration、complete_find_object、resume_find_object、cancel_current。',
    '三类边界：主动提醒是静默等待，只有目标出现、唯一结果达成或无指定终点的持续变化发生时才说结果；找东西是引导用户靠近并用手触摸一个具体物体；持续播报是按照重点定期描述最新画面。',
    '专用任务入口是硬规则：只有整句话以“帮我找”或“给我找”开头并带有具体目标，才允许 propose_find_object；只有整句话以“持续播报”开头，才允许 propose_continuous_narration。不得把其他同义说法扩展成这两个动作。',
    '“某物在哪里”“识别一下”“看看有没有”“告诉我有哪些”“持续告诉我”“一直描述”等没有上述精确开场白的表达，不得 propose；只能在 ordinary 与 route_active_reminder 之间判断。',
    '用户要求等待某个目标、结果或变化发生后再“提醒我、通知我、说一声”，归主动提醒。询问当前画面、位置、种类、属性或现状，归普通问答。',
    '普通问答、当前画面查询、闲聊、感谢、语气词、读屏残音和不完整噪声必须用 ordinary，不得启动任何模式。',
    'propose 的 subject 必须保留目标或播报要求，confirmationSpeech 只能询问是否开始；确认前不得声称任务已经启动。',
    '当前存在 pendingMode 时：用户整句话明确回答是、对、可以、开始等肯定意思才用 confirm_pending；明确回答不是、不用、取消等否定意思才用 reject_pending。其他内容视为一条新的完整指令，必须重新分类当前原话，不得继续追问旧候选。',
    '明确主动提醒任务一律用 route_active_reminder，顶层不生成确认句；原主动提醒模块收到完整原话后自己签合同并确认。',
    '当前已经在找东西模式时，用户明确更换找物目标用 update_find_object；已经在持续播报模式时，用户明确给出新的完整播报要求用 update_continuous_narration。update 只代表把原话交给当前旧模块，不提炼目标也不生成确认。',
    '只有当前处于找东西模式且应用层明确标记正在等待“摸到了吗”的回答时，用户明确回答已经摸到才用 complete_find_object，明确回答没有摸到才用 resume_find_object。其他任何时候都不得使用这两个 action。',
    '当前是否等待摸到确认为 no 时，即使用户说“摸到了”或“没有摸到”，也绝对不得输出 complete_find_object 或 resume_find_object，必须用 ordinary。',
    '提出主动提醒时用 route_active_reminder。新的严格找东西或持续播报开场白分别用 propose_find_object 或 propose_continuous_narration。',
    '除两个 propose 动作外，subject 与 confirmationSpeech 必须全部为空。',
    'confidence 是 0 到 1 的数字。无法明确分类时宁可 ordinary，不能猜模式。',
    activeMode === 'find_object'
      ? '硬边界：当前正在找东西。新的持续播报要求只有以“持续播报”开头才允许 propose_continuous_narration。'
      : '',
    activeMode === 'continuous_narration'
      ? '硬边界：当前正在持续播报。新的找东西要求只有以“帮我找”或“给我找”开头才允许 propose_find_object。'
      : '',
    '',
    `当前执行模式：${activeMode || 'none'}`,
    `当前待确认模式：${pendingMode || 'none'}`,
    `当前待确认内容：${pendingSubject || 'none'}`,
    `当前是否等待摸到确认：${findTouchConfirmationPending ? 'yes' : 'no'}`,
    `用户当前原话：${transcript || 'none'}`
  ].join('\n');
}

function parseUnifiedVisualTaskClassify(text) {
  const parsed = tryParseJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const action = String(parsed.action || '').trim();
  const actions = new Set([
    'ordinary',
    'propose_find_object',
    'propose_continuous_narration',
    'confirm_pending',
    'reject_pending',
    'route_active_reminder',
    'update_find_object',
    'update_continuous_narration',
    'complete_find_object',
    'resume_find_object',
    'cancel_current'
  ]);
  let confidence = Number(parsed.confidence);
  if (!actions.has(action) || !Number.isFinite(confidence)) {
    return null;
  }
  confidence = Math.max(0, Math.min(1, confidence));
  const subject = normalizeActiveReminderTaskText(parsed.subject || '').slice(0, 100);
  const confirmationSpeech = normalizeActiveReminderTaskText(parsed.confirmationSpeech || '').slice(0, 180);
  if (parsed.contractType || parsed.filterSubject || parsed.yesCondition || parsed.yesSpeech) {
    return null;
  }
  if (['propose_find_object', 'propose_continuous_narration'].includes(action)) {
    if (!subject || !confirmationSpeech) {
      return null;
    }
    return { action, subject, confirmationSpeech, confidence };
  }
  if (subject || confirmationSpeech) {
    return null;
  }
  return { action, subject: '', confirmationSpeech: '', confidence };
}

function isUnifiedVisualTaskContextValid(
  result,
  {
    transcript = '',
    activeMode = '',
    pendingMode = '',
    findTouchConfirmationPending = false
  } = {}
) {
  if (!result) {
    return false;
  }
  if (result.action === 'propose_find_object') {
    return resolveUnifiedStrictSpecialModeCue(transcript) === 'find_object';
  }
  if (result.action === 'propose_continuous_narration') {
    return resolveUnifiedStrictSpecialModeCue(transcript) === 'continuous_narration';
  }
  if (result.action === 'confirm_pending') {
    return Boolean(pendingMode) && isUnifiedStrictPendingAnswer(transcript, 'confirm');
  }
  if (result.action === 'reject_pending') {
    return Boolean(pendingMode) && isUnifiedStrictPendingAnswer(transcript, 'reject');
  }
  if (result.action === 'update_find_object') {
    return activeMode === 'find_object';
  }
  if (result.action === 'update_continuous_narration') {
    return activeMode === 'continuous_narration';
  }
  if (result.action === 'complete_find_object' || result.action === 'resume_find_object') {
    return activeMode === 'find_object' && findTouchConfirmationPending;
  }
  if (result.action === 'cancel_current') {
    return Boolean(activeMode);
  }
  return true;
}

async function runUnifiedVisualTaskClassify(body) {
  const transcript = String(body.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const activeMode = ['active_reminder', 'find_object', 'continuous_narration']
    .includes(String(body.activeMode || '').trim())
    ? String(body.activeMode || '').trim()
    : '';
  const pendingMode = ['find_object', 'continuous_narration']
    .includes(String(body.pendingMode || '').trim())
    ? String(body.pendingMode || '').trim()
    : '';
  const pendingSubject = normalizeActiveReminderTaskText(body.pendingSubject || '').slice(0, 100);
  const findTouchConfirmationPending = body.findTouchConfirmationPending === true;
  if (!transcript) {
    throw httpError(400, '统一入口分类没有收到用户原话。');
  }
  if (!activeReminderConfigured()) {
    throw httpError(503, '统一入口分类模型未配置。');
  }
  const startedAt = Date.now();
  const prompt = buildUnifiedVisualTaskClassifyPrompt({
    transcript,
    activeMode,
    pendingMode,
    pendingSubject,
    findTouchConfirmationPending
  });
  let modelText = '';
  let result = null;
  let attempts = 0;
  while (!result && attempts < 2) {
    attempts += 1;
    modelText = await callActiveReminderModel({
      prompt: attempts === 1
        ? prompt
        : `${prompt}\n\n上一份输出未通过固定结构或当前状态检查。请重新只输出完整 JSON。只有原话以“帮我找”或“给我找”开头才允许 propose_find_object，只有以“持续播报”开头才允许 propose_continuous_narration；只有整句话是明确的是或不是回答才允许 confirm_pending 或 reject_pending。其他情况必须在 ordinary 与 route_active_reminder 等当前有效动作中选择。`,
      jsonMode: true,
      maxOutputTokens: 360,
      timeoutMs: 15000
    });
    result = parseUnifiedVisualTaskClassify(modelText);
    if (!isUnifiedVisualTaskContextValid(result, {
      transcript,
      activeMode,
      pendingMode,
      findTouchConfirmationPending
    })) {
      result = null;
    }
  }
  if (!result) {
    console.warn(`[unified-visual-task-invalid] transcript=${transcript.slice(0, 120)}; raw=${String(modelText || '').replace(/\s+/g, ' ').slice(0, 800)}`);
    throw httpError(422, '统一入口分类模型连续两次返回无效合同。');
  }
  const latencyMs = Date.now() - startedAt;
  console.log(`[unified-visual-task] action=${result.action}; activeMode=${activeMode}; pendingMode=${pendingMode}; subject=${String(result.subject || result.target || '').slice(0, 40)}; attempts=${attempts}; latencyMs=${latencyMs}`);
  return {
    ok: true,
    provider: activeReminderProvider(),
    model: activeReminderModelName(),
    transcript,
    activeMode,
    pendingMode,
    pendingSubject,
    rawText: modelText.slice(0, 1000),
    attempts,
    latencyMs,
    ...result
  };
}

function buildUnifiedVisualModuleInstructionPrompt({
  mode,
  transcript,
  initialInstruction = false,
  findTouchConfirmationPending = false
}) {
  const shared = [
    '你是已经进入独立视觉模块后的任务模型。顶层分发已经完成，你不能重新分类到其他模块。',
    '只输出 JSON 对象，字段固定为 action、subject、confirmationSpeech、confidence。',
    '所有可听 confirmationSpeech 都从助手视角说给用户听：用户原话中的“我、我的”要自然改成第二人称“你”或“您”，不能继续说成助手自己的“我的”；不得声称现在已经看到目标。',
    'confidence 是 0 到 1 的数字。'
  ];
  const modeRules = mode === 'find_object'
    ? [
      '当前是原找东西模块。action 只能是 start、cancel、complete、resume、none。',
      '用户明确说出要找的具体物体时用 start；subject 只写唯一目标，不增加其他物体、位置或属性，但保留用户明确限定。',
      'initialInstruction=yes 表示用户已在统一入口确认开始；只要原话含具体目标，就必须用 start，不能再问一次是否确认。',
      'start 的 confirmationSpeech 只确认开始寻找目标并请用户慢慢移动镜头，不能说已经看见、找到或摸到。',
      '只有 findTouchConfirmationPending=yes 且用户明确回答已经摸到才用 complete，明确回答没有摸到才用 resume；否则不能使用这两个 action。',
      '任务已经运行时，只在用户整句话恰好为单字“停”时用 cancel，其他停止说法和其他语音一律用 none。complete、resume、cancel、none 的 subject 必须为空。',
      'complete 只说“寻找结束。”；resume 只说“继续寻找。”；cancel 只说“找东西已停止。”；none 的 confirmationSpeech 为空。'
    ]
    : [
      '当前是原持续播报模块。action 只能是 set、cancel、none。',
      '用户明确给出持续播报重点时用 set；subject 简洁保留完整重点，尤其保留距离要求和间隔秒数。',
      'initialInstruction=yes 表示用户已在统一入口确认开始；只要原话含明确播报要求，就必须用 set，不能再问一次是否确认。',
      'set 的 confirmationSpeech 只确认开始持续播报该重点，不要立即描述画面；确认句必须明确说出 subject 中的全部重点，尤其不能漏掉距离要求和间隔秒数。',
      '用户明确停止或取消持续播报用 cancel，subject 必须为空，confirmationSpeech 只说“持续播报已停止。”。',
      '普通问答或无法形成明确重点时用 none，subject 和 confirmationSpeech 都为空。'
    ];
  return [
    ...shared,
    ...modeRules,
    '',
    `initialInstruction：${initialInstruction ? 'yes' : 'no'}`,
    `findTouchConfirmationPending：${findTouchConfirmationPending ? 'yes' : 'no'}`,
    `用户完整原话：${transcript}`
  ].join('\n');
}

function parseUnifiedVisualModuleInstruction(text, mode) {
  const parsed = tryParseJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const action = String(parsed.action || '').trim();
  const allowed = mode === 'find_object'
    ? new Set(['start', 'cancel', 'complete', 'resume', 'none'])
    : new Set(['set', 'cancel', 'none']);
  let confidence = Number(parsed.confidence);
  if (!allowed.has(action) || !Number.isFinite(confidence)) {
    return null;
  }
  confidence = Math.max(0, Math.min(1, confidence));
  const subject = normalizeActiveReminderTaskText(parsed.subject || '').slice(0, 100);
  const confirmationSpeech = normalizeActiveReminderTaskText(parsed.confirmationSpeech || '').slice(0, 180);
  const requiresSubject = action === 'start' || action === 'set';
  if (requiresSubject) {
    return subject && confirmationSpeech
      ? { action, subject, confirmationSpeech, confidence }
      : null;
  }
  if (subject) {
    return null;
  }
  if (action === 'none') {
    return confirmationSpeech
      ? null
      : { action, subject: '', confirmationSpeech: '', confidence };
  }
  return confirmationSpeech
    ? { action, subject: '', confirmationSpeech, confidence }
    : null;
}

function isUnifiedVisualModuleContextValid(
  result,
  {
    mode = '',
    transcript = '',
    initialInstruction = false,
    findTouchConfirmationPending = false
  } = {}
) {
  if (!result) {
    return false;
  }
  if (
    /我的/.test(String(transcript || ''))
    && result.confirmationSpeech
    && (
      /我的/.test(result.confirmationSpeech)
      || !/[你您]/.test(result.confirmationSpeech)
    )
  ) {
    return false;
  }
  if (initialInstruction) {
    return result.action === (mode === 'find_object' ? 'start' : 'set');
  }
  if (result.action === 'complete' || result.action === 'resume') {
    return mode === 'find_object' && findTouchConfirmationPending;
  }
  return true;
}

async function runUnifiedVisualModuleInstruction(body) {
  const mode = ['find_object', 'continuous_narration'].includes(String(body.mode || '').trim())
    ? String(body.mode || '').trim()
    : '';
  const transcript = String(body.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const initialInstruction = body.initialInstruction === true;
  const findTouchConfirmationPending = body.findTouchConfirmationPending === true;
  if (!mode || !transcript) {
    throw httpError(400, '独立模块没有收到有效模式或用户原话。');
  }
  if (!activeReminderConfigured()) {
    throw httpError(503, '独立模块任务模型未配置。');
  }
  const startedAt = Date.now();
  const prompt = buildUnifiedVisualModuleInstructionPrompt({
    mode,
    transcript,
    initialInstruction,
    findTouchConfirmationPending
  });
  let modelText = '';
  let result = null;
  let attempts = 0;
  while (!result && attempts < 2) {
    attempts += 1;
    modelText = await callActiveReminderModel({
      prompt: attempts === 1
        ? prompt
        : `${prompt}\n\n上一份输出未通过结构、视角或当前状态检查。请只输出完整 JSON，并严格检查 action 对应的 subject 和 confirmationSpeech 是否应为空。initialInstruction=yes 时，找东西必须输出 start，持续播报必须输出 set。用户说“我的”时，confirmationSpeech 必须从助手视角使用第二人称，不能说成助手自己的“我的”。`,
      jsonMode: true,
      maxOutputTokens: 220,
      timeoutMs: 15000
    });
    result = parseUnifiedVisualModuleInstruction(modelText, mode);
    if (!isUnifiedVisualModuleContextValid(result, {
      mode,
      transcript,
      initialInstruction,
      findTouchConfirmationPending
    })) {
      result = null;
    }
  }
  if (!result) {
    throw httpError(422, '独立模块任务模型连续两次返回无效指令。');
  }
  const latencyMs = Date.now() - startedAt;
  console.log(`[unified-visual-module] mode=${mode}; action=${result.action}; subject=${String(result.subject || '').slice(0, 40)}; attempts=${attempts}; latencyMs=${latencyMs}`);
  return {
    ok: true,
    provider: activeReminderProvider(),
    model: activeReminderModelName(),
    mode,
    transcript,
    rawText: modelText.slice(0, 800),
    attempts,
    latencyMs,
    ...result
  };
}

function isServerActiveReminderStateTrackingTask(task) {
  const text = String(task || '').replace(/\s+/g, '');
  return /任务类型：state_tracking|category=state_tracking|mode=result_reached|mode=state_changed|currentState|resultReached/.test(text);
}

function normalizeActiveReminderContractMode(mode, category, condition = '') {
  if (category === 'target_presence') {
    return 'appear';
  }
  const raw = String(mode || '').trim();
  if (raw === 'state_changed' || raw === 'change') {
    return 'state_changed';
  }
  if (raw === 'result_reached' || raw === 'reached' || raw === 'threshold' || raw === 'relation_reached') {
    return 'result_reached';
  }
  const text = normalizeActiveReminderTaskText(condition || '').replace(/\s+/g, '');
  if (/(变化|改变|有变化|状态变|一变|变了|换位置|换地方|移动了|挪动了|挪位置|位置变|内容变|(?:从|由).{1,20}(?:变成|变为|到|拿起|拿起来|放下|离开|进入|出来))/.test(text)) {
    return 'state_changed';
  }
  return 'result_reached';
}

function normalizeActiveReminderLifecycle(value, category, mode, sourceText = '') {
  if (mode === 'state_changed') {
    return 'continuous_changes';
  }
  if (mode === 'result_reached' || category === 'state_tracking') {
    return 'once';
  }
  const raw = String(value || '').trim();
  if (raw === 'distinct_occurrences' || raw === 'repeat' || raw === 'continuous') {
    return 'distinct_occurrences';
  }
  const compact = normalizeActiveReminderTaskText(sourceText || '').replace(/\s+/g, '');
  if (/(每次|每一个|每个|所有|凡是|只要有|持续提醒|一直提醒|反复提醒|新的目标|新目标|不同目标)/.test(compact)) {
    return 'distinct_occurrences';
  }
  return 'once';
}

function buildActiveReminderContractSpeakText(task) {
  const category = task?.category === 'state_tracking' ? 'state_tracking' : 'target_presence';
  const target = normalizeActiveReminderTaskText(task?.target || '');
  const condition = cleanActiveReminderContractCondition(task?.condition || target || '');
  if (category === 'target_presence') {
    return target ? `看到${target}了` : '看到目标了';
  }
  const cleaned = condition
    .replace(/^(当|如果|一旦|等到|下次)/, '')
    .replace(/(的时候|时候|时|后)$/g, '')
    .replace(/^(画面中|当前|现在)/, '')
    .trim();
  if (!cleaned) {
    return target ? `${target}已达到提醒条件` : '已经达到提醒条件';
  }
  if (/(了|着|完成|通过|就绪|到位|接近|快满|不见|消失)$/.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}了`;
}

function cleanActiveReminderContractCondition(value) {
  return normalizeActiveReminderTaskText(value || '')
    .replace(/(请|就)?(提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|对我说|说一声|说一下|说下|我讲|跟我讲|告诉一下|报一下)$/g, '')
    .replace(/(会提醒你|会提示你|会告诉你|会通知你|会叫你|会和你说|会跟你说)$/g, '')
    .replace(/(的时候|时候|时|后)$/g, '')
    .trim();
}

function buildActiveReminderTaskNormalizePrompt(inputTranscript, outputTranscript) {
  return [
    '你是视障辅助主动提醒的任务归一化模型。你的任务不是看图，而是把用户自然语言任务整理成后续图像快筛可执行的结构化任务。',
    '输入包含两部分：用户原话转写、对话模型给用户听到的确认句。确认句通常更接近用户听到和认可的任务，但如果确认句明显只是提醒结果或答非所问，要以用户原话为准。',
    '只输出 JSON 对象，字段固定为 action、contractType、filterSubject、yesCondition、yesSpeech、confidence。',
    'action 只能是 create_task 或 none。是否建立主动提醒任务完全由你根据用户原话和确认句判断。',
    '先只决定 action，再决定其他字段。create_task 的必要条件是用户明确要求从现在起等待某个未来视觉事实成立后再通知；没有这个未来通知要求就必须是 none。',
    '用户询问当前是否看见、当前是否成立、当前在哪里、当前是什么状态，属于当前问答，必须输出 none；不能因为问句里出现主体、状态或结果词就建立任务。',
    '对话模型只是回答当前状态而没有承诺未来通知时，不能据此建立任务。无法确定用户是否要求未来通知时，选择 none。',
    '如果不是建立或替换主动提醒任务，action=none，其余四个文字字段输出空字符串；普通问答、当前画面查询、追问为什么没提醒、闲聊都必须输出 none。',
    '如果是主动提醒任务，action=create_task，contractType 必须从 appearance_once、appearance_new_instances、result_once、change_continuous 中四选一。',
    'appearance_once：一个明确目标或一个带状态描述的完整目标出现后播报一次并结束。',
    'appearance_new_instances：用户明确要求每个新的、不同的独立实例都继续提醒。',
    'result_once：等待一个明确、可观察的最终结果成立，成立后播报一次并结束。',
    'change_continuous：没有指定终点，只等待同一主体出现任意新的稳定前后变化。',
    '当前只处理短结果提醒，不处理持续讲解或逐步引导。生命周期只控制一次任务内播报一次，还是对新的独立对象或新的稳定变化继续播报。',
    'filterSubject：要观察的唯一核心主体，使用用户当前语言的短语。result_once 优先写承载最终结果的可见对象、关系、区域或场景状态；change_continuous 写需要跨帧保持身份的变化主体。',
    'change_continuous 的 filterSubject 必须只写真正发生变化、需要跨帧保持身份的主体；初始位置、容器、所属区域和其他参照关系写进 yesCondition，不能并入主体。',
    'yesCondition：图片快筛应当回答的唯一视觉条件。appearance 和 result_once 必须是当前单张图片可以回答的单选命题；result_once 只写最终结果，不写导致结果发生的动作。',
    'yesSpeech：条件放行后可原样播报的一句短结果；不能写没看到、看不清、不确定、还没到或没有变化。',
    'filterSubject、yesCondition、yesSpeech 必须原样保留用户或明确确认句中的程度、方向、阈值、范围和比较关系；接近、达到、超过、低于、部分、全部等不能互相替换，尤其不能把“接近结果”升级成“结果已经完全达到”。',
    'result_once 的提醒有效期从合同成功建立开始，到结果成功播报、任务被新任务替换或会话结束为止。有效期内任意一张图片只要明确满足 yesCondition，就应立即放行；不要求先看到未达成状态，不要求观察动作过程或证明因果，也不要求连续两张一致。',
    'change_continuous 的快筛职责是交付当前状态，应用层只机械比较稳定状态。yesCondition 只能写每帧需要稳定提取的当前状态维度；禁止把变化、改变、不同、前后、移动了或换了本身写成条件，禁止让单张图片判断历史变化。',
    'change_continuous 的 yesCondition 使用“filterSubject 的当前状态维度”格式，例如抽象地写主体的当前位置、当前数量、当前开关状态或当前可见属性；不能写成主体发生了什么变化。',
    'confidence：0 到 1 的数字，只表示你对 action 和合同字段的把握。',
    '如果用户原话或确认句显式声明第一类、第二类、第三类或按出现、按结果、按变化，必须尊重这个声明并映射到对应 contractType。',
    '如果用户显式说“主体是 X、筛 Y”或同义格式，filterSubject 必须只填写 X，yesCondition 填写主体 X 的可见条件 Y；不得把 Y 拼进 filterSubject。',
    '只有用户确实要求今后看到某种视觉事实时再通知，才输出 create_task；称呼用我、你、您或其他自然表达都不能影响判断。',
    '用户只是在问当前画面、位置、是否发生、为什么没提醒、有没有、是不是、在哪里、是什么状态或现在如何，输出 none。',
    '用户明确寻找一个已经带有状态描述的完整目标时使用 appearance_once；用户等待状态稍后形成时使用 result_once。',
    '用户指定明确终点就用 result_once；没有指定终点、只要求任意前后变化时才用 change_continuous。',
    '只要用户指定变化方向、目标值、完成态或单侧结果，即使原话带变、变化或动作词，也必须用 result_once。',
    'result_once 以结果为导向：用户用动作表达时，理解其造成的当前画面可见结果；不要求看见动作过程、动作来源或证明因果。',
    'result_once 合同有效期内，任意一张图片只要明确满足 yesCondition 就立即放行一次；不要求历史基线或第二张确认图。',
    '如果无法从用户话里推出可见结果，就不要编造；保留概括条件并降低 confidence。',
    '不要把提醒、告诉或在哪里当成 filterSubject。',
    '不要编造具体物体、场景或阈值；用户没说清的，只保留为概括条件。',
    '',
    `用户原话转写：${inputTranscript || '无'}`,
    `对话模型确认句：${outputTranscript || '无'}`,
    ].join('\n');
}

function parseActiveReminderTaskNormalize(text) {
  const parsed = tryParseJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const action = String(parsed.action || '').trim();
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) {
    return null;
  }
  confidence = Math.max(0, Math.min(1, confidence));
  if (action === 'none') {
    if (parsed.contractType || parsed.filterSubject || parsed.yesCondition || parsed.yesSpeech) {
      return null;
    }
    return {
      action: 'none',
      contractType: '',
      category: '',
      mode: '',
      lifecycle: '',
      target: '',
      condition: '',
      speakRequirement: '',
      speakText: '',
      taskText: '',
      confidence
    };
  }
  if (action === 'create_task') {
    const contractType = String(parsed.contractType || '').trim();
    const contractTypes = {
      appearance_once: { category: 'target_presence', mode: 'appear', lifecycle: 'once' },
      appearance_new_instances: { category: 'target_presence', mode: 'appear', lifecycle: 'distinct_occurrences' },
      result_once: { category: 'state_tracking', mode: 'result_reached', lifecycle: 'once' },
      change_continuous: { category: 'state_tracking', mode: 'state_changed', lifecycle: 'continuous_changes' }
    };
    const mapped = contractTypes[contractType];
    const target = normalizeActiveReminderTaskText(parsed.filterSubject || '').slice(0, 40);
    const condition = normalizeActiveReminderTaskText(parsed.yesCondition || '').slice(0, 80);
    const speakText = normalizeActiveReminderTaskText(parsed.yesSpeech || '').slice(0, 80);
    if (!mapped || !target || !condition || !speakText) {
      return null;
    }
    if (
      contractType === 'change_continuous'
      && /(变化|改变|不同|前后|上一(?:帧|次|状态)|历史|基线|移动了|换了)/.test(
        condition.replaceAll(target, '').replace(/\s+/g, '')
      )
    ) {
      return null;
    }
    const taskText = buildNormalizedTaskText({ ...mapped, target, condition, speakText, confidence });
    return {
      action,
      contractType,
      ...mapped,
      target,
      condition,
      speakRequirement: '',
      speakText,
      taskText,
      confidence
    };
  }

  return null;
}

function hasActiveReminderChangeTriggerText(compactText) {
  const compact = normalizeActiveReminderTaskText(compactText || '').replace(/\s+/g, '');
  return /(变化|改变|有变化|状态变|一变|变了|换位置|换地方|移动了|挪动了|挪位置|位置变|内容变|移动到.*新|(?:从|由).{1,20}(?:变成|变为|到|拿起|拿起来|放下|离开|进入|出来))/.test(compact);
}

function buildNormalizedTaskText(task) {
  if (!task) {
    return '用户口头主动提醒任务：任务不明确，输出 N。';
  }
  const condition = task.condition || (task.target ? `看到${task.target}` : '');
  const category = task.category === 'state_tracking' ? 'state_tracking' : 'target_presence';
  const mode = normalizeActiveReminderContractMode(task.mode, category, condition);
  const lifecycle = normalizeActiveReminderLifecycle(task.lifecycle, category, mode);
  const target = task.target || (category === 'state_tracking' ? '目标状态' : condition);
  const speakText = normalizeActiveReminderTaskText(task.speakText || '')
    || buildActiveReminderContractSpeakText({ category, mode, target, condition });
  if (!condition) {
    return '用户口头主动提醒任务：任务不明确，输出 N。';
  }
  if (category === 'state_tracking') {
    const screeningRule = mode === 'result_reached'
      ? `快筛单选题：当前图片是否已经出现结果“${condition}”？是则 resultReached=true；否或不确定则 false。`
      : '快筛职责：每帧只输出主体当前状态，应用层和历史基线比较；未变化、没看到、看不清或不确定不得播报。';
    return `任务类型：state_tracking。调度合同：category=state_tracking；mode=${mode}；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。${screeningRule}`;
  }
  return `任务类型：target_presence。调度合同：category=target_presence；mode=appear；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。快筛职责：只在目标明确出现时 HIT；未发现、看不清、不确定不得播报。`;
}

function parseActiveReminderObservation(text, requireValidObservation = false) {
  const parsed = tryParseJsonObject(text);
  if (requireValidObservation && parsed?.observationValid !== true) {
    return { state: 'UNCERTAIN', currentState: '', observation: '', speakable: false, resultReached: false, resultText: '', instanceKey: '', confidence: null };
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const rawState = String(parsed.state || '').trim().toUpperCase();
  const state = ['NO_HIT', 'HIT', 'PROGRESS', 'UNCERTAIN'].includes(rawState)
    ? rawState
    : 'UNCERTAIN';
  const currentState = normalizeActiveReminderModelText(parsed.currentState || parsed.current_state || '').slice(0, 40);
  const observation = normalizeActiveReminderModelText(parsed.observation || currentState).slice(0, 40);
  const speakable = parsed.speakable === true;
  const resultReached = parsed.resultReached === true || parsed.result_reached === true;
  const resultText = normalizeActiveReminderModelText(parsed.resultText || parsed.result_text || '').slice(0, 40);
  const instanceKey = normalizeActiveReminderModelText(parsed.instanceKey || parsed.instance_key || '').slice(0, 40);
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) {
    confidence = null;
  } else {
    confidence = Math.max(0, Math.min(1, confidence));
  }
  return { state, currentState, observation, speakable, resultReached, resultText, instanceKey, confidence };
}

function parseActiveReminderSceneContext(text) {
  const parsed = tryParseJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const scene = normalizeActiveReminderModelText(parsed.scene || parsed.observation || '').slice(0, 50);
  const relation = normalizeActiveReminderModelText(parsed.relation || '').slice(0, 50);
  if (!scene || !relation) {
    return null;
  }
  return { scene, relation };
}

function stabilizeActiveReminderObservation(text, task) {
  const normalizedText = normalizeActiveReminderModelText(text).slice(0, 40);
  const target = extractActiveReminderStableTarget(task, normalizedText);
  const anchor = extractActiveReminderStableAnchor(normalizedText);
  if (target && anchor) {
    return `${target}在${anchor}`.slice(0, 20);
  }
  return normalizedText;
}

function extractActiveReminderStableTarget(task, observation) {
  const taskText = normalizeActiveReminderTaskText(task || '');
  const conditionMatch = taskText.match(/当(.{1,40}?)(?:时|，|,|输出)/);
  const condition = String(conditionMatch?.[1] || taskText)
    .replace(/^(看到|看见|发现|找到|出现|有|接近|靠近)/, '')
    .replace(/(的时候|时候|时|后|就|达到|满足|提醒|提示|告诉|输出|Y|N).*$/i, '')
    .trim();
  if (condition && condition.length <= 12 && !/任务不明确|观察画面/.test(condition)) {
    return condition;
  }
  const observationText = normalizeActiveReminderModelText(observation || '');
  const fallbackMatch = observationText.match(/(?:看到|看见|发现|出现|有)?(.{1,12}?)(?:在|位于|靠近|放在|出现于)/);
  return String(fallbackMatch?.[1] || '').trim();
}

function extractActiveReminderStableAnchor(text) {
  const normalizedText = normalizeActiveReminderModelText(text || '');
  const match = normalizedText.match(/(?:在|位于|靠近|接近|放在|出现于|移到|移动到|到了)([^，,。.!！?？；;：:、\s]{1,12})/);
  return normalizeActiveReminderModelText(match?.[1] || '').slice(0, 12);
}

function buildActiveReminderPrompt(task, promptMode = 'baseline', detailedSpeech = false) {
  if (promptMode === 'scene_context') {
    return [
      '你是视障辅助主动提醒的场景快筛模型。只根据“用户当前任务”和“当前图片”输出两层短信息。',
      '你不是聊天模型，不决定是否最终提醒，不输出建议，不输出寒暄，不输出 JSON 以外的文字。',
      '必须输出一个 JSON 对象，字段固定为 scene、relation。',
      'scene：当前图片里的具体画面事实，必须是中文短句，最多 20 个汉字。',
      'relation：scene 和用户当前任务之间的关系，必须是中文短句，最多 24 个汉字。',
      'relation 要说明这张图对任务是接近、相关、无关、未满足、不确定、已经满足、出现变化，或可作为判断依据。',
      '如果没有看到任务相关内容，scene 仍然描述当前可见事实，relation 写明和任务无关或未满足。',
      '如果画面看不清，scene 写当前可确定的画面状态，relation 写明证据不足或不确定。',
      '不得沿用历史任务，不得引用导航、门牌、入口、站牌等旧上下文，只看当前任务和当前图片。',
      '不要把用户任务原文当作 scene；scene 必须来自当前图片。',
      '',
      `用户当前任务：${task || '观察画面，发现明确目标时提醒。'}`
    ].join('\n');
  }

  if (promptMode === 'deep_multitask') {
    return [
      '你是视障辅助主动提醒快筛模型。只根据“用户当前任务”和“当前图片”输出任务相关短观察。',
      '你不是聊天模型，不要解释，不要复述任务，不要输出 JSON 以外的文字。',
      '必须输出一个 JSON 对象，字段固定为 state、currentState、observation、speakable、resultReached、resultText、instanceKey、confidence。',
      ...(APP_VARIANT === 'greencloud-gemini' && /(?:^|[；;])mode=state_changed(?:[；;]|$)/.test(task) ? [
        '本次第三类状态变化任务额外必须输出布尔字段 observationValid：当前画面足以可靠观察合同关注的主体、场景或属性时为 true；目标未出现、失去目标、遮挡、看不清或无法观察相关状态时为 false。它表示能否观察，不表示状态是否正向或条件是否达成。',
        'observationValid=false 时 state=UNCERTAIN，currentState、observation、resultText 均为空字符串，speakable=false，resultReached=false；不要把未发现、没看到、不在画面、出画、失去目标、遮挡或模糊写成新状态。暂时看不到不等于现实中的主体消失。',
        '手机转动、镜头偏移、拍摄角度、画面裁切、远近透视、清晰度、光照以及主体在画面左中右或上下的变化，都不是现实状态变化；除非合同明确监测画面构图，否则这些情况必须保持与原现实状态等价，无法确认时 observationValid=false。',
        'observationValid=true 时只报告合同关注的最新可靠现实状态；优先使用现实中的属性、开关、姿态、承载、接触、容器内容或相对稳定参照关系，不使用画面左、右、上、下作为现实位置。observation 与 currentState 表达同一当前事实，不描述前后对比，不声称变化或移动。',
        '只有合同本身明确监测出现、消失、有无、进入、离开或被移走，并且当前图片包含足够完整的现实场景证据时，存在或不存在才可作为 observationValid=true 的语义状态；不能仅因摄像头没有拍到主体就推断其不存在。'
      ] : []),
      'state 只能是 NO_HIT、HIT、PROGRESS、UNCERTAIN。',
      'NO_HIT 表示当前图片没有满足用户任务；speakable 必须是 false。',
      'UNCERTAIN 表示看不清、证据不足或无法判断；speakable 必须是 false。',
      'HIT 表示当前图片已经明确满足用户任务；speakable 必须是 true。',
      'PROGRESS 表示用户任务需要关注状态或变化，当前图片给出了有用进展但尚未达到触发条件；speakable 必须是 false。',
      'currentState 是给系统做上一帧记忆比较的稳定状态短语，必须只写和任务直接相关的当前状态，最多 16 个汉字。',
      detailedSpeech && /category=target_presence[；;].*lifecycle=once[；;]/.test(task)
        ? 'observation 在合同明确命中且目标是具体可定位物体时，说明发现的目标并补它在现实环境中的明确位置或关系，最多 32 个汉字。整体场景或抽象条件只报命中事实，不硬凑位置。定位优先级固定为：用户正在手持、握持、佩戴或接触的关系；桌面、柜面、床面、座面、地面、容器等承载位置；与家具、门、墙或其他清楚参照物的相邻关系。能确认这些现实关系时禁止改报画面左、右、上、下。只有完全看不出任何现实参照关系、但画面区域确实明确时，才退回画面左上、上方、右上、左侧、中央、右侧、左下、下方或右下，并明确这是画面方位，不冒充用户身体方向。位置必须属于满足合同条件的同一目标；多个候选只选一个确实满足条件的目标定位。不得编造参照物、画外位置、距离、米数或移动引导；位置都不明确时只报命中事实，省略位置及位置不明的解释，不得为了补位置阻止已经明确的目标命中。未命中仍按原规则静默。'
        : 'observation 是触发时给用户播报的短句，最多 20 个汉字；未触发时可以和 currentState 相同，也可以写未满足原因。',
      'resultReached 是布尔值，只表示当前图片是否已经达到用户合同里的 condition；没看到、看不清、不确定、中间状态、还没到、没有变化时必须 false。',
      'resultText 只有 resultReached=true 时才写可播报的正向结果短句；否则必须写空字符串。',
      'instanceKey 只用于 lifecycle=distinct_occurrences 的目标出现任务：写当前独立实例的稳定短标识，优先使用可见名称、内容或稳定位置；同一实例跨帧必须相同，新实例必须不同。其他任务写空字符串。',
      'confidence 是 0 到 1 的数字，表示本帧判断可靠程度。',
      '如果用户当前任务里写着“任务类型：state_tracking”，你的职责是状态抽取和结果达成标记，不决定什么时候开口。必须每帧先输出 currentState；state 通常写 PROGRESS，只有看不清写 UNCERTAIN。',
      'state_tracking 的 speakable 默认必须是 false。即使当前图片已经达到触发条件，也只把稳定状态写进 currentState，把正向结果写进 resultText，是否播报由应用层根据前后状态进程决定。',
      detailedSpeech && /category=target_presence[；;].*lifecycle=once[；;]/.test(task)
        ? '只有目标完整符合合同 condition 才 HIT，不能仅凭同类物体出现就忽略颜色、状态、范围等限定；满足完整条件就立即 HIT，不等待目标移动或下一帧。不要把“没变”“未变化”当成 observation 或 resultText。'
        : '不要只因为看到目标就 HIT；不要把“没变”“未变化”当成 observation 或 resultText。直接写当前事实状态，格式尽量稳定为“主体+状态”“主体+位置”“主体+关系”或“主体+进度”。',
      '用户等待的触发条件不一定是高阈值或最终满格，也可能是低阈值、起始阈值或局部状态。你只负责把当前图片已经达到的状态写准。',
      '状态跟踪的 currentState 稳定写法：位置写“主体在位置”；开关、明暗、进度、数量、存在、关系等状态写成固定短语；看不清才写 UNCERTAIN。',
      detailedSpeech && /category=target_presence[；;].*lifecycle=once[；;]/.test(task)
        ? '目标出现合同中，currentState 保持简短稳定，observation 则按上述规则包含同一目标的位置，两者无需相同。合同 speakText 只表示应播报的命中结果，不是位置证据；位置只能取自当前图片。具体物体有明确的人体接触关系、承载物或相邻参照物时，必须优先报告这种现实关系；仅能确定画面区域时才报画面区域。多个候选时本句只定位其中一个符合合同的物体，不把另一个物体的位置拼到它身上。'
        : '同一目标在同一物理位置或同一状态时，currentState 和 observation 必须固定为同一句短语；目标名称、位置锚点和句式都不要变化。不要因为角度、远近、颜色、清晰度或措辞变化改写。只有目标位置、障碍类型或状态真的变化时，才改变 currentState。',
      '如果用户当前任务是目标出现，当前图片没有明确出现目标，state 写 NO_HIT，currentState 写“未发现目标”，observation 写“未发现目标”，speakable=false。',
      '如果用户当前任务是结果到达，只做一道单选题：“当前图片是否已经出现合同 condition 所需结果？”是则立刻 resultReached=true；否或不确定则 false。不要改问动作过程、历史变化或目标物是否入镜。',
      '结果到达任务在合同有效期内逐帧独立判断，不等待历史状态、因果证据或下一张图片。结果可以由目标本身或足以确认同一结果的整体场景证据支持。',
      '如果用户当前任务是状态变化，单张图不要自己声称已经变化，只输出 currentState；应用层会比较前后状态。',
      '多任务时，只要任一明确条件满足即可 HIT；多项同时满足时，优先选择最影响行动或安全、最明确的观察。',
      '不得沿用历史任务，不得引用导航、门牌、入口、站牌等旧上下文，只看当前任务和当前图片。',
      '输出示例格式：{"state":"PROGRESS","currentState":"主体当前状态","observation":"主体当前状态","speakable":false,"resultReached":false,"resultText":"","instanceKey":"","confidence":0.82}',
      '',
      `用户当前任务：${task || '观察画面，发现明确目标时提醒。'}`
    ].join('\n');
  }

  return [
    '你是主动提醒快筛模型。只根据用户当前任务和当前图片判断。',
    '如果没有达到提醒条件，只输出一个字符：N。',
    '如果达到提醒条件，只输出一句中文现场短提醒，简单问题约 10 个字，最长不超过 15 个字。',
    '不要只输出目标名；短提醒必须包含“看到、出现、在画面中、前方、左侧、右侧”等现场状态。',
    '短提醒要描述当前画面命中的目标、场景或状态，不要解释，不要输出多句。',
    '硬规则：只根据“用户当前任务”判断是否触发。不得沿用历史任务，不得沿用下拉框默认值，不得自行加入入口、门牌、招牌、站牌等旧目标。',
    '如果用户任务要求看到某个具体目标，只要当前图片里明确出现这个目标，就输出短提醒。',
    '如果当前图片没有明确出现用户任务指定的目标，输出 N。',
    '不确定时输出 N。',
    '',
    `用户当前任务：${task || '观察画面，发现明确目标时提醒。'}`
  ].join('\n');
}

async function runSpeedVisionAnswer(body) {
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const question = String(body.question || '').replace(/\s+/g, ' ').trim();
  const startedAt = Date.now();

  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '极速视觉追问没有收到有效图片。');
  }
  if (!question) {
    throw httpError(400, '极速视觉追问没有收到问题。');
  }

  if (!BAILIAN_API_KEY) {
    return {
      ok: true,
      provider: 'demo',
      configured: false,
      model: BAILIAN_ACTIVE_REMINDER_MODEL,
      spokenText: '演示模式还不能看图回答。',
      rawText: '演示模式还不能看图回答。',
      latencyMs: 0
    };
  }

  const prompt = [
    '你是极速视觉追问模型。只根据当前图片回答用户刚才的问题。',
    '不要引用历史画面、历史任务、导航、门牌、入口或站点。',
    '看得清就直接回答；看不清或图片里没有证据，就说“没看清”。',
    '回答要适合直接语音播报：简单问题简短回答；问题需要说明时可以多说一句，但不要展开无关内容。',
    '不要寒暄，不要解释推理过程，不要说自己没有能力看画面。',
    '',
    `用户问题：${question}`
  ].join('\n');

  const response = await fetchWithTimeout(`${BAILIAN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: BAILIAN_ACTIVE_REMINDER_MODEL,
      messages: [
        {
          role: 'system',
          content: '只根据图片短答。'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 80,
      enable_thinking: false
    })
  }, 8000);

  const data = await response.json();
  if (!response.ok) {
    throw httpError(response.status, `极速视觉追问 HTTP 错误：${data.error?.message || response.status}`);
  }

  const rawText = normalizeSpeedVisionAnswerText(data.choices?.[0]?.message?.content || '');
  const spokenText = rawText || '没看清。';
  const latencyMs = Date.now() - startedAt;
  console.log(`[speed-vision-answer] latencyMs=${latencyMs}; question=${question.slice(0, 40)}; answer=${spokenText.slice(0, 40)}`);
  return {
    ok: true,
    provider: 'bailian',
    configured: true,
    model: BAILIAN_ACTIVE_REMINDER_MODEL,
    spokenText,
    rawText,
    latencyMs
  };
}

function normalizeSpeedVisionAnswerText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, '')
    .trim()
    .slice(0, 180);
}

function normalizeActiveReminderTaskText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”"'‘’]/g, '')
    .trim();
}

function normalizeActiveReminderModelText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, '')
    .trim()
    .slice(0, 40);
}

function logActiveReminderResult(result) {
  const frameCount = Number(result.frameCount || 0);
  if (!result.shouldAlert && frameCount % 10 !== 1) {
    return;
  }
  console.log(`[active-reminder] frame=${frameCount}; alert=${result.shouldAlert ? 'Y' : 'N'}; provider=${result.provider}; latencyMs=${result.latencyMs}; state=${String(result.state || '').slice(0, 12)}; current=${String(result.currentState || '').slice(0, 20)}; reached=${result.resultReached ? 'Y' : 'N'}; result=${String(result.resultText || '').slice(0, 20)}; task=${String(result.task || '').slice(0, 40)}; raw=${String(result.rawText || '').slice(0, 20)}`);
}

function logClientDiagnostic(body) {
  const name = String(body?.name || 'unknown').replace(/[^\w.:-]/g, '').slice(0, 80);
  const details = body?.details && typeof body.details === 'object' ? body.details : {};
  const safeDetails = {};
  for (const [key, value] of Object.entries(details).slice(0, 24)) {
    const safeKey = String(key).replace(/[^\w.:-]/g, '').slice(0, 40);
    if (!safeKey) {
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      safeDetails[safeKey] = value;
    } else {
      safeDetails[safeKey] = String(value ?? '').slice(0, 600);
    }
  }
  console.log(`[client-log] ${name}; ${JSON.stringify(safeDetails)}`);
}

function saveActiveReminderFrame(result) {
  if (!ACTIVE_REMINDER_DEBUG_CAPTURE) {
    return null;
  }
  const parsed = parseDataUrl(result.imageDataUrl);
  if (!parsed) {
    return null;
  }
  const dir = ensureDebugCaptureDir();
  const stamp = makeDebugStamp();
  const frame = Number(result.frameCount || 0);
  const suffix = result.shouldAlert ? 'Y' : 'N';
  const fileName = `${stamp}_frame-${String(frame).padStart(5, '0')}_${suffix}.${parsed.extension}`;
  fs.writeFileSync(path.join(dir, fileName), parsed.buffer);
  appendDebugMetadata({
    kind: 'image',
    file: fileName,
    frameCount: frame,
    shouldAlert: Boolean(result.shouldAlert),
    provider: result.provider || '',
    model: result.model || '',
    state: result.state || '',
    observation: String(result.observation || '').slice(0, 80),
    scene: String(result.scene || '').slice(0, 80),
    relation: String(result.relation || '').slice(0, 80),
    speakable: typeof result.speakable === 'boolean' ? result.speakable : null,
    confidence: Number.isFinite(result.confidence) ? result.confidence : null,
    rawText: String(result.rawText || '').slice(0, 80),
    instanceKey: String(result.instanceKey || '').slice(0, 80),
    latencyMs: result.latencyMs,
    task: String(result.task || '').slice(0, 200),
    prompt: String(result.prompt || '').slice(0, 1200),
    createdAt: new Date().toISOString()
  });
  return fileName;
}

function saveFindObjectFrame(result) {
  if (!ACTIVE_REMINDER_DEBUG_CAPTURE) {
    return null;
  }
  const parsed = parseDataUrl(result.imageDataUrl);
  if (!parsed) {
    return null;
  }
  const dir = ensureDebugCaptureDir();
  const stamp = makeDebugStamp();
  const frame = Number(result.frameCount || 0);
  const status = String(result.status || 'unknown').replace(/[^a-z_]/gi, '').slice(0, 24) || 'unknown';
  const fileName = `${stamp}_find-frame-${String(frame).padStart(5, '0')}_${status}.${parsed.extension}`;
  fs.writeFileSync(path.join(dir, fileName), parsed.buffer);
  appendDebugMetadata({
    kind: 'find_object_image',
    file: fileName,
    frameCount: frame,
    reminderSessionId: String(result.reminderSessionId || '').slice(0, 64),
    target: String(result.target || '').slice(0, 80),
    status,
    confidence: Number.isFinite(result.confidence) ? result.confidence : null,
    latencyMs: result.latencyMs,
    provider: result.provider || '',
    model: result.model || '',
    createdAt: new Date().toISOString()
  });
  return fileName;
}

function saveDebugAudio(req, body) {
  if (!ACTIVE_REMINDER_DEBUG_CAPTURE || !body.length) {
    return { saved: false };
  }
  const dir = ensureDebugCaptureDir();
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const extension = mime.includes('mp4') ? 'mp4'
    : mime.includes('ogg') ? 'ogg'
      : mime.includes('wav') ? 'wav'
        : 'webm';
  const label = String(req.headers['x-debug-label'] || 'microphone').replace(/[^\w.-]/g, '').slice(0, 40) || 'microphone';
  const fileName = `${makeDebugStamp()}_${label}.${extension}`;
  fs.writeFileSync(path.join(dir, fileName), body);
  appendDebugMetadata({
    kind: 'audio',
    file: fileName,
    bytes: body.length,
    mime,
    label,
    createdAt: new Date().toISOString()
  });
  console.log(`[debug-capture] audio=${fileName}; bytes=${body.length}; mime=${mime}`);
  return { saved: true, file: fileName, bytes: body.length };
}

function ensureDebugCaptureDir() {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(DEBUG_CAPTURE_DIR, date);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendDebugMetadata(entry) {
  const dir = ensureDebugCaptureDir();
  fs.appendFileSync(path.join(dir, 'metadata.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
}

function makeDebugStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }
  const mime = match[1].toLowerCase();
  const extension = mime.includes('png') ? 'png'
    : mime.includes('webp') ? 'webp'
      : 'jpg';
  return {
    mime,
    extension,
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function buildTransitSummary(data, request) {
  const transits = data.route?.transits || [];
  if (!Array.isArray(transits) || transits.length === 0) {
    return {
      summaryText: '高德没有返回可用的公交方案。',
      facts: buildBaseFacts('transit', request, { unresolved: true, reason: 'no_transit_route' })
    };
  }

  const chosen = transits[0];
  const lines = [];
  const segments = [];

  lines.push(`公交方案：总距离约 ${formatMeters(chosen.distance)}，预计 ${formatDuration(chosen.duration)}。`);

  for (const [index, segment] of (chosen.segments || []).entries()) {
    const walking = segment.walking;
    if (walking && Number(walking.distance || 0) > 0) {
      const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(walking.steps).map(simplifyWalkingStep));
      lines.push(`步行段 ${index + 1}：约 ${formatMeters(walking.distance)}。`);
      for (const step of steps.slice(0, 6)) {
        lines.push(`  - ${step.instruction || step.fallback}`);
      }
      segments.push({
        type: 'walk',
        distance: Number(walking.distance || 0),
        steps,
        origin: normalizeCoordinate(walking.origin),
        destination: normalizeCoordinate(walking.destination),
        role: ''
      });
    }

    const buslines = normalizeArray(segment.bus?.buslines);
    for (const busline of buslines) {
      const name = busline.name || '未知线路';
      const departure = simplifyStop(busline.departure_stop);
      const arrival = simplifyStop(busline.arrival_stop);
      const viaNum = Number(busline.via_num || 0);
      lines.push(`乘车段 ${index + 1}：${name}，从 ${departure.name || '未知上车站'} 上车，到 ${arrival.name || '未知下车站'} 下车，途经约 ${viaNum} 个中间站。`);
      segments.push({
        type: 'vehicle',
        name,
        vehicleType: busline.type || '',
        departureStop: departure,
        arrivalStop: arrival,
        viaNum,
        viaStops: normalizeArray(busline.via_stops).map(simplifyStop)
      });
    }
  }

  const transitPlan = await buildTransitThreePartPlan(segments, request);

  const facts = buildBaseFacts('transit', request, {
    routeDistance: Number(chosen.distance || 0),
    routeDuration: Number(chosen.duration || 0),
    segments,
    transitPlan
  });

  return {
    summaryText: lines.join('\n'),
    ...await buildAccessibleNavigationResult(facts),
    facts
  };
}

async function buildTransitThreePartPlan(segments, request) {
  const vehicleEntries = segments
    .map((segment, index) => ({ segment, index }))
    .filter((entry) => entry.segment.type === 'vehicle');
  if (!vehicleEntries.length) {
    return {
      available: false,
      reason: 'no_vehicle_segment',
      originalSegments: segments
    };
  }

  const firstVehicleIndex = vehicleEntries[0].index;
  const lastVehicleIndex = vehicleEntries[vehicleEntries.length - 1].index;
  const initialWalk = segments.find((segment, index) => segment.type === 'walk' && index < firstVehicleIndex) || null;
  const finalWalk = [...segments].reverse().find((segment, reverseIndex) => {
    const index = segments.length - 1 - reverseIndex;
    return segment.type === 'walk' && index > lastVehicleIndex;
  }) || null;
  const transferWalks = segments
    .map((segment, index) => ({ ...segment, segmentIndex: index }))
    .filter((segment) => segment.type === 'walk' && segment.segmentIndex > firstVehicleIndex && segment.segmentIndex < lastVehicleIndex);

  const vehicles = vehicleEntries.map((entry) => ({ ...entry.segment, segmentIndex: entry.index }));
  const boardingStop = vehicles[0]?.departureStop || {};
  const arrivalStop = vehicles[vehicles.length - 1]?.arrivalStop || {};
  let initialExitResolution = { hint: null, poi: null, locked: false, reason: 'initial_vehicle_not_rail', source: 'initial_nearest_to_origin' };
  let initialWalkForRender = initialWalk;
  let initialWalkSource = initialWalk ? 'amap_transit_segment' : 'missing';
  if (initialWalk && isRailVehicle(vehicles[0])) {
    initialExitResolution = await resolveMetroExitNearReference(
      boardingStop,
      normalizeCoordinate(request.origin),
      request,
      'initial_nearest_to_origin'
    );
    const initialExitCoordinate = getPoiNavigationCoordinate(initialExitResolution.poi);
    if (initialExitCoordinate && request.origin) {
      if (isTransitExitPoi(request.originPoi) && coordinatesWithinMeters(request.origin, initialExitCoordinate, 3)) {
        initialWalkForRender = buildNoOutdoorWalkSegment(
          'initial',
          request.origin,
          initialExitCoordinate,
          'initial_station_access_noop'
        );
        initialWalkSource = 'initial_station_access_noop';
      } else {
        try {
          const replannedInitialWalk = await fetchWalkingLeg(request.origin, initialExitCoordinate);
          if (replannedInitialWalk?.steps?.length) {
            initialWalkForRender = {
              ...replannedInitialWalk,
              type: 'walk',
              role: 'initial',
              origin: request.origin,
              destination: initialExitCoordinate,
              source: 'initial_exit_replanned'
            };
            initialWalkSource = 'initial_exit_replanned';
          }
        } catch (error) {
          initialExitResolution.walkReplanError = error.message || String(error);
        }
      }
    }
  } else if (initialWalk) {
    const boardingCoordinate = getStopCoordinate(boardingStop);
    if (boardingCoordinate && request.origin) {
      try {
        const replannedInitialWalk = await fetchWalkingLeg(request.origin, boardingCoordinate);
        if (replannedInitialWalk?.steps?.length) {
          initialWalkForRender = {
            ...replannedInitialWalk,
            type: 'walk',
            role: 'initial',
            origin: request.origin,
            destination: boardingCoordinate,
            source: 'initial_stop_replanned'
          };
          initialWalkSource = 'initial_stop_replanned';
        }
      } catch (error) {
        initialExitResolution.walkReplanError = error.message || String(error);
      }
    }
  }
  const finalExitHint = extractMetroExitHintFromPoi(request.destinationPoi);
  const finalVehicleIsRail = isRailVehicle(vehicles[vehicles.length - 1]);
  let finalExitResolution = finalVehicleIsRail
    ? finalExitHint
      ? await resolveMetroExitPoi(finalExitHint, request)
      : { hint: null, poi: null, locked: false, reason: 'no_exit_hint' }
    : { hint: null, poi: null, locked: false, reason: 'final_vehicle_not_rail' };
  if (finalVehicleIsRail && !finalExitResolution.locked) {
    const inferredExit = await resolveMetroExitFromFinalWalk(arrivalStop, finalWalk, request);
    if (inferredExit.locked) {
      finalExitResolution = inferredExit;
    } else {
      finalExitResolution.inferredExit = inferredExit;
    }
  }

  let finalWalkForRender = finalWalk;
  let finalWalkSource = finalWalk ? 'amap_transit_segment' : 'missing';
  const finalExitCoordinate = getPoiNavigationCoordinate(finalExitResolution.poi);
  const finalWalkOrigin = finalVehicleIsRail ? finalExitCoordinate : getStopCoordinate(arrivalStop);
  if (finalWalkOrigin && request.destination) {
    if (
      finalVehicleIsRail
      && isTransitExitPoi(request.destinationPoi)
      && coordinatesWithinMeters(finalWalkOrigin, request.destination, 3)
    ) {
      finalWalkForRender = buildNoOutdoorWalkSegment(
        'final',
        finalWalkOrigin,
        request.destination,
        'final_station_exit_noop'
      );
      finalWalkSource = 'final_station_exit_noop';
    } else {
      try {
        const replannedFinalWalk = await fetchWalkingLeg(finalWalkOrigin, request.destination);
        if (replannedFinalWalk?.steps?.length) {
          finalWalkForRender = {
            ...replannedFinalWalk,
            type: 'walk',
            role: 'final',
            origin: finalWalkOrigin,
            destination: request.destination,
            source: finalVehicleIsRail ? 'exit_replanned' : 'final_stop_replanned'
          };
          finalWalkSource = finalVehicleIsRail ? 'exit_replanned' : 'final_stop_replanned';
        }
      } catch (error) {
        finalExitResolution.walkReplanError = error.message || String(error);
      }
    }
  }

  const legs = await buildTransitDynamicLegs({
    segments,
    firstVehicleIndex,
    lastVehicleIndex,
    finalWalk,
    finalWalkForRender,
    initialWalk,
    initialWalkForRender,
    initialExitResolution,
    finalExitResolution,
    vehicles,
    request
  });

  return {
    available: true,
    legs,
    initialWalk: initialWalkForRender ? { ...initialWalkForRender, role: 'initial' } : null,
    initialExit: initialExitResolution,
    initialWalkSource,
    vehicles,
    transferWalks,
    finalWalk: finalWalkForRender ? { ...finalWalkForRender, role: 'final' } : null,
    boardingStop,
    arrivalStop,
    finalExit: finalExitResolution,
    finalWalkSource
  };
}

function buildNoOutdoorWalkSegment(role, origin, destination, source) {
  return {
    type: 'walk',
    role,
    origin,
    destination,
    source,
    noOutdoorWalk: true,
    distance: 0,
    duration: 0,
    steps: []
  };
}

async function buildTransitDynamicLegs(options) {
  const {
    segments,
    firstVehicleIndex,
    lastVehicleIndex,
    finalWalk,
    finalWalkForRender,
    initialWalk,
    initialWalkForRender,
    initialExitResolution,
    finalExitResolution,
    request
  } = options;
  const legs = [];
  for (const [index, segment] of segments.entries()) {
    if (segment.type === 'vehicle') {
      const nextWalk = segments[index + 1];
      const nextVehicle = nextWalk?.type === 'walk' ? findAdjacentVehicle(segments, index + 1, 1) : null;
      const internalTransferAfter = nextWalk && isInternalRailTransferWalk(segments, index + 1)
        ? {
          distance: Number(nextWalk.distance || 0),
          nextVehicleName: nextVehicle?.name || '',
          nextDepartureStopName: nextVehicle?.departureStop?.name || ''
        }
        : null;
      legs.push({
        type: 'vehicle',
        segment: { ...segment, role: 'ride', internalTransferAfter },
        sourceSegmentIndex: index
      });
      continue;
    }
    if (segment.type !== 'walk') {
      continue;
    }
    if (isInternalRailTransferWalk(segments, index)) {
      continue;
    }
    const previousVehicle = findAdjacentVehicle(segments, index, -1);
    const nextVehicle = findAdjacentVehicle(segments, index, 1);
    const role = index < firstVehicleIndex ? 'initial' : index > lastVehicleIndex ? 'final' : 'transfer';
    const transferExit = role === 'transfer'
      ? await resolveTransferMetroExit(previousVehicle, nextVehicle, segment, request)
      : null;
    const walkSegment = transferExit?.locked
      ? await buildTransferWalkSegmentFromExit(segment, previousVehicle, nextVehicle, transferExit)
      : role === 'initial' && segment === initialWalk
      ? initialWalkForRender
      : role === 'final' && segment === finalWalk
      ? finalWalkForRender
      : role === 'transfer'
      ? await buildTransferWalkSegment(segment, previousVehicle, nextVehicle)
      : segment;
    legs.push({
      type: 'walk',
      role,
      segment: { ...walkSegment, role },
      sourceSegmentIndex: index,
      previousVehicle,
      nextVehicle,
      requiresInitialExit: role === 'initial' && isRailVehicle(nextVehicle),
      requiresFinalExit: role === 'final' && isRailVehicle(previousVehicle),
      transferExit,
      originPoi: await buildWalkLegOriginPoi(role, request, previousVehicle, finalExitResolution, walkSegment, transferExit),
      destinationPoi: await buildWalkLegDestinationPoi(role, request, nextVehicle, transferExit, initialExitResolution)
    });
  }
  return legs.map((leg, index) => ({ ...leg, legIndex: index }));
}

async function resolveTransferMetroExit(previousVehicle, nextVehicle, walkSegment, request) {
  if (isRailVehicle(previousVehicle) && !isRailVehicle(nextVehicle)) {
    const referenceLocation = getStopCoordinate(nextVehicle?.departureStop) || normalizeCoordinate(walkSegment?.destination);
    if (!referenceLocation) {
      return null;
    }
    return resolveMetroExitNearReference(previousVehicle.arrivalStop, referenceLocation, request, 'transfer_nearest_to_next_stop');
  }
  if (!isRailVehicle(previousVehicle) && isRailVehicle(nextVehicle)) {
    const referenceLocation = getStopCoordinate(previousVehicle?.arrivalStop) || normalizeCoordinate(walkSegment?.origin);
    if (!referenceLocation) {
      return null;
    }
    return resolveMetroExitNearReference(nextVehicle.departureStop, referenceLocation, request, 'transfer_nearest_from_previous_stop');
  }
  return null;
}

async function buildTransferWalkSegmentFromExit(segment, previousVehicle, nextVehicle, transferExit) {
  const origin = isRailVehicle(previousVehicle)
    ? getPoiNavigationCoordinate(transferExit.poi)
    : normalizeCoordinate(segment.origin) || getStopCoordinate(previousVehicle?.arrivalStop);
  const destination = isRailVehicle(nextVehicle)
    ? getPoiNavigationCoordinate(transferExit.poi)
    : normalizeCoordinate(segment.destination) || getStopCoordinate(nextVehicle?.departureStop);
  if (origin && destination) {
    try {
      const replanned = await fetchWalkingLeg(origin, destination);
      if (replanned?.steps?.length) {
        return {
          ...replanned,
          type: 'walk',
          role: 'transfer',
          origin,
          destination,
          source: 'transfer_exit_replanned'
        };
      }
    } catch (error) {
      return {
        ...segment,
        role: 'transfer',
        source: 'transfer_exit_replan_failed',
        replanError: error.message || String(error)
      };
    }
  }
  return {
    ...segment,
    role: 'transfer',
    source: 'transfer_exit_unusable'
  };
}

function isInternalRailTransferWalk(segments, walkIndex) {
  const walk = segments[walkIndex];
  if (walk?.type !== 'walk') {
    return false;
  }
  const previousVehicle = findAdjacentVehicle(segments, walkIndex, -1);
  const nextVehicle = findAdjacentVehicle(segments, walkIndex, 1);
  if (!previousVehicle || !nextVehicle) {
    return false;
  }
  return isRailVehicle(previousVehicle)
    && isRailVehicle(nextVehicle)
    && sameStopName(previousVehicle.arrivalStop?.name, nextVehicle.departureStop?.name);
}

function isRailVehicle(segment) {
  const vehicleType = normalizeTextValue(segment?.vehicleType);
  if (/地铁|轨道|磁浮|轻轨/.test(vehicleType)) {
    return true;
  }
  if (/公交|巴士|快速公交|有轨电车/.test(vehicleType)) {
    return false;
  }
  const routeName = normalizeTextValue(segment?.name).replace(/[（(].*?[）)]/g, '');
  return /地铁|轨道|磁浮|轻轨/.test(routeName);
}

function sameStopName(a, b) {
  const left = normalizeStopName(a);
  const right = normalizeStopName(b);
  return Boolean(left && right && left === right);
}

function normalizeStopName(value) {
  return normalizeTextValue(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/站$/, '')
    .trim();
}

function findAdjacentVehicle(segments, fromIndex, direction) {
  for (let index = fromIndex + direction; index >= 0 && index < segments.length; index += direction) {
    if (segments[index]?.type === 'vehicle') {
      return segments[index];
    }
  }
  return null;
}

async function buildTransferWalkSegment(segment, previousVehicle, nextVehicle) {
  const origin = normalizeCoordinate(segment.origin) || getStopCoordinate(previousVehicle?.arrivalStop);
  const destination = normalizeCoordinate(segment.destination) || getStopCoordinate(nextVehicle?.departureStop);
  if (origin && destination) {
    try {
      const replanned = await fetchWalkingLeg(origin, destination);
      if (replanned?.steps?.length) {
        return {
          ...replanned,
          type: 'walk',
          role: 'transfer',
          origin,
          destination,
          source: 'transfer_replanned'
        };
      }
    } catch (error) {
      return {
        ...segment,
        role: 'transfer',
        source: 'transfer_replan_failed',
        replanError: error.message || String(error)
      };
    }
  }
  return {
    ...segment,
    role: 'transfer',
    source: 'amap_transit_segment'
  };
}

async function buildWalkLegOriginPoi(role, request, previousVehicle, finalExitResolution, walkSegment, transferExit = null) {
  let originPoi = null;
  if (role === 'initial') {
    originPoi = request.originPoi || null;
  } else if (role === 'transfer' && transferExit?.locked && isRailVehicle(previousVehicle)) {
    originPoi = buildTransitExitOriginPoi(transferExit.poi, walkSegment?.steps || []);
  } else if (role === 'final' && finalExitResolution?.locked && finalExitResolution.poi) {
    originPoi = buildTransitExitOriginPoi(finalExitResolution.poi, walkSegment?.steps || []);
  } else if (previousVehicle?.arrivalStop) {
    originPoi = buildTransitRouteOriginPoi(buildStopPoi(previousVehicle.arrivalStop, '上一段下车站'), walkSegment?.steps || []);
  }
  const originLocation = normalizeCoordinate(walkSegment?.origin)
    || getPoiNavigationCoordinate(originPoi)
    || getPolylineEndpoints(combineStepPolylines(walkSegment?.steps || [])).start;
  return resolveWalkingOriginPoiRoadAnchor(originPoi, originLocation, walkSegment?.steps || []);
}

async function buildWalkLegDestinationPoi(role, request, nextVehicle, transferExit = null, initialExitResolution = null) {
  let destinationPoi = null;
  if (role === 'final') {
    destinationPoi = request.destinationPoi || null;
  } else if (role === 'initial' && initialExitResolution?.locked && initialExitResolution.poi) {
    destinationPoi = initialExitResolution.poi;
  } else if (role === 'transfer' && transferExit?.locked && isRailVehicle(nextVehicle)) {
    destinationPoi = transferExit.poi;
  } else if (nextVehicle?.departureStop) {
    destinationPoi = buildStopPoi(nextVehicle.departureStop, '下一段上车站');
  }
  if (!destinationPoi) {
    return null;
  }
  return resolveDestinationPoiRoadAnchor(destinationPoi, getPoiNavigationCoordinate(destinationPoi));
}

function extractMetroExitHintFromPoi(poi) {
  if (!poi) {
    return null;
  }
  const text = [poi.address, poi.name].map(normalizeTextValue).filter(Boolean).join(' ');
  if (!text) {
    return null;
  }
  const matches = [...text.matchAll(/(?:^|[（(，,；;\s])([^（）()，,；;\s]{1,20}?)(?:地铁站|站)\s*([0-9一二三四五六七八九十两]+号口)/g)];
  if (!matches.length) {
    return null;
  }
  const match = matches[matches.length - 1];
  const stationName = normalizeMetroStationName(match[1]);
  const exitName = normalizeExitName(match[2]);
  if (!stationName || !exitName) {
    return null;
  }
  return {
    stationName,
    exitName,
    keyword: `${stationName}地铁站${exitName}`,
    sourceText: match[0].trim()
  };
}

function normalizeMetroStationName(value) {
  return normalizeTextValue(value)
    .replace(/[（(].*$/, '')
    .replace(/地铁站$/, '')
    .replace(/站$/, '')
    .trim();
}

function normalizeExitName(value) {
  const text = normalizeTextValue(value).trim();
  const match = text.match(/([0-9一二三四五六七八九十两]+)号口/);
  if (!match) {
    return text;
  }
  const numberText = normalizeChineseNumber(match[1]);
  return `${numberText}号口`;
}

function normalizeChineseNumber(value) {
  const text = normalizeTextValue(value);
  if (/^\d+$/.test(text)) {
    return text;
  }
  const digits = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (text === '十') {
    return '10';
  }
  const tenMatch = text.match(/^十([一二两三四五六七八九])$/);
  if (tenMatch) {
    return String(10 + digits[tenMatch[1]]);
  }
  const compoundMatch = text.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
  if (compoundMatch) {
    return String(digits[compoundMatch[1]] * 10 + (compoundMatch[2] ? digits[compoundMatch[2]] : 0));
  }
  return String(digits[text] || text);
}

async function resolveMetroExitPoi(hint, request) {
  const result = {
    hint,
    poi: null,
    locked: false,
    reason: '',
    source: 'destination_hint'
  };
  try {
    const data = await callAmap('/v3/place/text', {
      keywords: hint.keyword,
      city: request.destinationCity || request.city || '上海',
      citylimit: 'true',
      offset: '10',
      page: '1',
      extensions: 'all'
    });
    const pois = Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : [];
    result.candidates = pois.slice(0, 5).map((poi) => ({
      name: poi.name,
      address: poi.address,
      location: poi.location,
      entrLocation: poi.entrLocation
    }));
    const selected = chooseMetroExitPoi(pois, hint);
    if (!selected) {
      result.reason = 'exit_poi_not_found';
      return result;
    }
    result.poi = selected;
    result.locked = Boolean(getPoiNavigationCoordinate(selected));
    result.reason = result.locked ? 'exit_poi_locked' : 'exit_poi_without_coordinate';
    return result;
  } catch (error) {
    result.reason = 'exit_poi_search_failed';
    result.error = error.message || String(error);
    return result;
  }
}

async function resolveMetroExitFromFinalWalk(arrivalStop, finalWalk, request) {
  const stationName = normalizeMetroStationName(arrivalStop?.name);
  const referenceLocation = normalizeCoordinate(request.destination) || getFinalWalkStartCoordinate(finalWalk) || getStopCoordinate(arrivalStop);
  return resolveMetroExitNearReference(arrivalStop, referenceLocation, request, normalizeCoordinate(request.destination) ? 'nearest_to_destination' : 'final_walk_start');
}

async function resolveMetroExitNearReference(arrivalStop, referenceLocation, request, source = 'nearest_reference') {
  const stationName = normalizeMetroStationName(arrivalStop?.name);
  const result = {
    hint: null,
    poi: null,
    locked: false,
    reason: '',
    source,
    stationName,
    referenceLocation
  };
  if (!stationName || !referenceLocation) {
    result.reason = 'missing_station_or_reference';
    return result;
  }

  try {
    const aroundData = await callAmap('/v3/place/around', {
      location: referenceLocation,
      keywords: `${stationName}地铁站`,
      radius: '800',
      offset: '25',
      page: '1',
      extensions: 'all'
    });
    let pois = Array.isArray(aroundData.pois) ? aroundData.pois.map(simplifyPoi) : [];
    pois = mergePoiCandidates(pois, await searchMetroExitTextPois(`${stationName}地铁站出口`, request));
    if (!pois.some((poi) => isLikelyStationExitPoi(poi, stationName))) {
      for (let exitNumber = 1; exitNumber <= 12; exitNumber += 1) {
        pois = mergePoiCandidates(pois, await searchMetroExitTextPois(`${stationName}地铁站${exitNumber}号口`, request));
      }
    }
    result.candidates = pois.slice(0, 8).map((poi) => ({
      name: poi.name,
      address: poi.address,
      location: poi.location,
      entrLocation: poi.entrLocation
    }));
    const selected = chooseExitPoiNearReference(pois, stationName, referenceLocation);
    if (!selected) {
      result.reason = 'nearby_exit_poi_not_found';
      return result;
    }
    result.poi = selected.poi;
    result.locked = true;
    result.reason = source === 'nearest_to_destination'
      ? 'exit_selected_nearest_to_destination'
      : source === 'transfer_nearest_to_next_stop'
      ? 'exit_selected_nearest_to_next_boarding_stop'
      : source === 'transfer_nearest_from_previous_stop'
      ? 'exit_selected_nearest_from_previous_alighting_stop'
      : 'exit_inferred_from_final_walk_start';
    result.distanceToReferenceMeters = Math.round(selected.distanceMeters);
    return result;
  } catch (error) {
    result.reason = 'nearby_exit_search_failed';
    result.error = error.message || String(error);
    return result;
  }
}

async function searchMetroExitTextPois(keyword, request) {
  const data = await callAmap('/v3/place/text', {
    keywords: keyword,
    city: request.destinationCity || request.city || '上海',
    citylimit: 'true',
    offset: '10',
    page: '1',
    extensions: 'all'
  });
  return Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : [];
}

function mergePoiCandidates(existing, incoming) {
  const merged = [];
  const seen = new Set();
  for (const poi of [...(existing || []), ...(incoming || [])]) {
    const key = poi.id || `${poi.name}|${getPoiNavigationCoordinate(poi)}|${poi.address}`;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(poi);
  }
  return merged;
}

function chooseMetroExitPoi(pois, hint) {
  const exitNumber = normalizeExitName(hint.exitName).replace('号口', '');
  const scored = pois
    .map((poi, index) => {
      const text = `${normalizeTextValue(poi.name)} ${normalizeTextValue(poi.address)} ${normalizeTextValue(poi.type)}`;
      let score = 0;
      if (text.includes(hint.stationName)) score += 4;
      if (text.includes(hint.exitName)) score += 5;
      if (new RegExp(`${exitNumber}\\s*号?口`).test(text)) score += 4;
      if (/地铁|轨道交通|出入口|地铁站/.test(text)) score += 2;
      if (getPoiNavigationCoordinate(poi)) score += 2;
      return { poi, score, index };
    })
    .filter((item) => item.score >= 7)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.poi || null;
}

function isLikelyStationExitPoi(poi, stationName) {
  const name = normalizeTextValue(poi?.name);
  const normalizedStation = normalizeMetroStationName(stationName);
  if (!name || !normalizedStation || !getPoiNavigationCoordinate(poi)) {
    return false;
  }
  const stationIndex = name.indexOf(normalizedStation);
  const stationHasAllowedPrefix = stationIndex >= 0 && stationIndex <= 2;
  const stationToExitText = stationIndex >= 0 ? name.slice(stationIndex) : '';
  const nameLooksLikeStationExit = /(?:地铁站|站).*?(?:[0-9一二三四五六七八九十两]+\s*号口|出入口|出口)/.test(stationToExitText);
  return stationHasAllowedPrefix && nameLooksLikeStationExit;
}

function chooseExitPoiNearReference(pois, stationName, referenceLocation) {
  const reference = parseLngLat(referenceLocation);
  if (!reference) {
    return null;
  }
  const candidates = pois
    .map((poi, index) => {
      const coordinate = getPoiNavigationCoordinate(poi);
      const point = parseLngLat(coordinate);
      if (!point || !isLikelyStationExitPoi(poi, stationName)) {
        return null;
      }
      const distanceToReference = distanceMeters(point, reference);
      return { poi, index, distanceMeters: distanceToReference };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.index - b.index);
  return candidates[0] || null;
}

function isMetroExitText(text) {
  return /[0-9一二三四五六七八九十两]+\s*号口|出入口|出口/.test(normalizeTextValue(text));
}

function isTransitExitPoiName(value) {
  const name = normalizeTextValue(value);
  return /(?:地铁站|站).*?(?:[0-9一二三四五六七八九十两]+\s*号口|出入口|出口)/.test(name);
}

function getPoiNavigationCoordinate(poi) {
  return normalizeCoordinate(poi?.entrLocation) || normalizeCoordinate(poi?.location);
}

function getFinalWalkStartCoordinate(finalWalk) {
  return normalizeCoordinate(finalWalk?.origin)
    || getPolylineEndpoints(combineStepPolylines(finalWalk?.steps || [])).start
    || '';
}

async function fetchWalkingLeg(origin, destination) {
  const data = await callAmap('/v3/direction/walking', { origin, destination });
  const paths = data.route?.paths || [];
  if (!Array.isArray(paths) || !paths.length) {
    return null;
  }
  const chosen = paths[0];
  const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(chosen.steps).map(simplifyWalkingStep));
  return {
    distance: Number(chosen.distance || 0),
    duration: Number(chosen.duration || 0),
    steps
  };
}

async function buildWalkingSummary(data, request) {
  const paths = data.route?.paths || [];
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      summaryText: '高德没有返回可用的步行路线。',
      facts: buildBaseFacts('walking', request, { unresolved: true, reason: 'no_walking_route' })
    };
  }

  const chosen = paths[0];
  const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(chosen.steps).map(simplifyWalkingStep));
  const originPoi = await resolveWalkingOriginPoiRoadAnchor(request.originPoi, request.origin, steps);
  const lines = [
    `步行方案：总距离约 ${formatMeters(chosen.distance)}，预计 ${formatDuration(chosen.duration)}。`
  ];

  steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.instruction || step.fallback}`);
  });

  const facts = buildBaseFacts('walking', { ...request, originPoi }, {
    routeDistance: Number(chosen.distance || 0),
    routeDuration: Number(chosen.duration || 0),
    walkingSteps: steps
  });

  return {
    summaryText: lines.join('\n'),
    ...await buildAccessibleNavigationResult(facts),
    facts
  };
}

async function resolveWalkingOriginPoiRoadAnchor(originPoi, originLocation, steps = []) {
  if (!originPoi) {
    return null;
  }
  let poi = { ...originPoi };
  const addressRoad = extractAddressRoadName(poi.address || '');
  if (!normalizeTextValue(poi.knownFacingRoad) && addressRoad) {
    poi = { ...poi, knownFacingRoad: addressRoad, facingRoadEvidenceSource: 'amap_poi_address' };
  }
  const isTransitExit = poi.isTransitExit || isTransitExitPoiName(poi.name);
  const location = normalizeCoordinate(originLocation) || getPoiNavigationCoordinate(poi);
  if (location) {
    try {
      const data = await callAmap('/v3/geocode/regeo', {
        location,
        extensions: 'all',
        radius: '100'
      });
      const roads = (Array.isArray(data.regeocode?.roads) ? data.regeocode.roads : [])
        .map((road) => ({
          name: normalizeTextValue(road?.name),
          distance: Number(road?.distance),
          location: normalizeCoordinate(road?.location)
        }))
        .filter((road) => road.name && Number.isFinite(road.distance) && road.distance <= 45)
        .sort((left, right) => left.distance - right.distance);
      const knownFacingRoad = normalizeTextValue(poi.knownFacingRoad);
      const nearestRoad = roads.find((road) => sameRoadName(road.name, knownFacingRoad)) || roads[0];
      if (nearestRoad?.name) {
        const startPolyline = combineStepPolylines((steps || []).slice(0, 2));
        const geometricStartSide = normalizeSideValue(poi.knownStartSide)
          || inferRoadSideFromCenter(location, nearestRoad.location, startPolyline);
        return {
          ...poi,
          isTransitExit: Boolean(isTransitExit),
          knownFacingRoad: knownFacingRoad || nearestRoad.name,
          knownStartSide: geometricStartSide,
          facingRoadEvidenceSource: normalizeTextValue(poi.facingRoadEvidenceSource) || 'amap_origin_regeo'
        };
      }
    } catch {
      // Keep the map route usable when the extra origin anchor lookup fails.
    }
  }
  if (normalizeTextValue(poi.knownFacingRoad)) {
    return { ...poi, isTransitExit: Boolean(isTransitExit) };
  }
  const fallbackRoad = findNextNamedRoad(steps, 0, steps.length || 3);
  return fallbackRoad
    ? { ...poi, isTransitExit: Boolean(isTransitExit), knownFacingRoad: fallbackRoad }
    : poi;
}

function inferRoadSideFromCenter(walkLocation, roadCenterLocation, polyline) {
  const walkPoint = parseLngLat(walkLocation);
  const roadPoint = parseLngLat(roadCenterLocation);
  const routePoints = parsePolylinePoints(polyline);
  if (!walkPoint || !roadPoint || routePoints.length < 2) {
    return '';
  }
  const roadOffset = distanceMeters(walkPoint, roadPoint);
  if (roadOffset < 2 || roadOffset > 60) {
    return '';
  }
  let routeVector = null;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    routeVector = vectorBetween(routePoints[index], routePoints[index + 1]);
    if (routeVector) {
      break;
    }
  }
  if (!routeVector) {
    return '';
  }
  const toRoadX = roadPoint.x - walkPoint.x;
  const toRoadY = roadPoint.y - walkPoint.y;
  const cross = routeVector.x * toRoadY - routeVector.y * toRoadX;
  if (Math.abs(cross) < 0.5) {
    return '';
  }
  return cross > 0 ? 'right' : 'left';
}

async function buildAccessibleNavigationScript(facts) {
  const result = await buildAccessibleNavigationResult(facts);
  return result.accessibleScript;
}

async function buildAccessibleNavigationResult(facts) {
  const lines = [
    '执行路线：'
  ];
  const collector = createRouteStepCollector(facts);

  if (facts.mode === 'transit') {
    const transitPlan = facts.transitPlan;
    if (transitPlan?.available) {
      lines.push('公交地铁路线：');
      lines.push('');
      lines.push(...await renderTransitDynamicLegs(transitPlan, facts, collector));
    } else {
      lines.push('总流程：先完成起点到上车站的步行段，再乘车，最后完成下车站到目的地的步行段。');
      lines.push('公交站提醒：站名不等于站杆所在马路一侧。当前如果没有单独站杆路侧坐标，不能直接说“沿左边/右边就能找到站”。');
      lines.push('');

      for (const [index, segment] of (facts.segments || []).entries()) {
        if (segment.type === 'walk') {
          lines.push(...await renderAccessibleWalkLeg(segment.steps || [], `步行段 ${index + 1}`, segment.distance, facts, {
            collector,
            legIndex: index,
            legLabel: `步行段 ${index + 1}`
          }));
        } else if (segment.type === 'vehicle') {
          lines.push(...renderAccessibleVehicleLeg(segment, `乘车段 ${index + 1}`));
        }
        lines.push('');
      }
    }
  } else if (facts.mode === 'walking') {
    lines.push(...await renderAccessibleWalkLeg(facts.walkingSteps || [], '全程步行段', facts.routeDistance, facts, {
      collector,
      legIndex: 0,
      legLabel: '全程步行段'
    }));
  } else {
    lines.push('当前路线类型不是步行或公交，暂时无法转换成上海步行导航稿。');
  }

  lines.push('终点确认：到门牌、站牌或入口标识附近后，用慧眼确认最终门口。');
  return {
    accessibleScript: lines.join('\n'),
    structuredRoute: collector.route
  };
}

function renderAccessibleVehicleLeg(segment, label, options = {}) {
  const departure = segment.departureStop?.name || '未知上车站';
  const arrival = segment.arrivalStop?.name || '未知下车站';
  const name = segment.name || '未知线路';
  const viaNum = Number(segment.viaNum || 0);
  if (isRailVehicle(segment)) {
    return [
      `${label}：乘坐 ${name}。`,
      `上车站：${departure}。到地铁站后，先找服务中心或工作人员，说明目的地和需要无障碍引导；进站、站台、上车、换乘尽量交给工作人员接力式引导。`,
      `下车站：${arrival}。途经约 ${viaNum} 个中间站后下车。`,
      segment.internalTransferAfter
        ? `在${arrival}站内换乘 ${segment.internalTransferAfter.nextVehicleName || '下一条线路'}；这属于地铁站内换乘，不按室外步行导航拆解，继续找服务中心或工作人员接力引导到 ${segment.internalTransferAfter.nextDepartureStopName || arrival} 的站台。`
        : options.finalExitName
        ? `到站后继续找服务中心或工作人员，说明需要从${options.finalExitName}出站；出到地面后，用慧眼确认出口和目的地标识。`
        : '到站后先按站内导向或工作人员引导出站；出站到地面后，再进入下一段室外步行。'
    ];
  }
  const boardingApproach = options.boardingApproach || null;
  const boardingText = boardingApproach?.roadName && boardingApproach?.roadSide
    ? `上车站：${departure}。上一段步行已经到达${boardingApproach.roadName}${roadSideText(boardingApproach.roadSide)}的站点坐标，在这里等车。`
    : options.boardingEndpointLocked
    ? `上车站：${departure}。上一段步行已经按这个站点坐标重新规划；到点后核对 ${name}，确认车辆开往${arrival}方向再上车。`
    : options.sameStopTransfer
    ? `上车站：${departure}。与上一辆车的下车站是同一个站点坐标；留在原站点，核对 ${name} 和开往${arrival}方向后再上车。`
    : `上车站：${departure}。站点路侧证据没有闭合，当前路线不能作为独立可执行路线。`;
  return [
    `${label}：乘坐 ${name}。`,
    boardingText,
    `下车站：${arrival}。途经约 ${viaNum} 个中间站后下车。`,
    segment.internalTransferAfter
      ? `在${arrival}站内换乘 ${segment.internalTransferAfter.nextVehicleName || '下一条线路'}；站内步行约 ${formatMeters(segment.internalTransferAfter.distance)}，跟随站内导向到 ${segment.internalTransferAfter.nextDepartureStopName || arrival} 的站台。`
      : options.hasLaterWalk
      ? '下车后以下车站坐标作为下一段真实起点，直接按下一段步行箭头执行。'
      : '到达终点站后，以站点坐标作为本段终点。'
  ];
}

async function renderTransitDynamicLegs(transitPlan, facts, collector) {
  const lines = [];
  const legs = transitPlan.legs || [];
  if (!legs.length) {
    lines.push('高德没有返回可拆分的公交地铁分段。');
    return lines;
  }
  for (let legPosition = 0; legPosition < legs.length; legPosition += 1) {
    const leg = legs[legPosition];
    const segmentNumber = Number(leg.legIndex || 0) + 1;
    const ordinal = formatChineseOrdinal(segmentNumber);
    if (leg.type === 'vehicle') {
      lines.push(`${ordinal}段：乘车。`);
      const hasLaterWalk = legs.slice(segmentNumber).some((candidate) => candidate.type === 'walk');
      const finalExitName = !hasLaterWalk
        ? transitPlan.finalExit?.poi?.name || ''
        : '';
      const previousLeg = legs[legPosition - 1];
      const previousVehicle = previousLeg?.type === 'vehicle' ? previousLeg.segment : null;
      const boardingApproach = previousLeg?.type === 'walk'
        ? getFinalLegRoadApproach(collector, previousLeg.legIndex)
        : null;
      const boardingEndpointLocked = previousLeg?.type === 'walk'
        ? isWalkLegReplannedToStop(previousLeg, leg.segment?.departureStop)
        : false;
      const sameStopTransfer = previousVehicle
        ? sameStopCoordinate(previousVehicle.arrivalStop, leg.segment?.departureStop)
        : false;
      lines.push(...renderAccessibleVehicleLeg(leg.segment || {}, `${ordinal}段乘车`, {
        finalExitName,
        boardingApproach,
        boardingEndpointLocked,
        sameStopTransfer,
        hasLaterWalk
      }));
      lines.push('');
      continue;
    }
    if (leg.type === 'walk') {
      const label = `${ordinal}段步行`;
      const walkSegment = leg.segment || {};
      if (walkSegment.noOutdoorWalk) {
        lines.push(...renderNoOutdoorTransitWalk(leg, ordinal, transitPlan));
        lines.push('');
        continue;
      }
      lines.push(`${ordinal}段：步行。${describeTransitWalkRole(leg)}`);
      if (leg.role === 'final' && leg.requiresFinalExit) {
        lines.push(...renderFinalExitLockLines(transitPlan));
      }
      if (walkSegment.steps?.length) {
        const originPoi = leg.originPoi || null;
        const destinationPoi = leg.destinationPoi || null;
        const walkFacts = buildTransitWalkFacts(facts, {
          origin: getPoiNavigationCoordinate(originPoi) || normalizeCoordinate(walkSegment.origin) || facts.origin,
          originPoi,
          destination: getPoiNavigationCoordinate(destinationPoi) || normalizeCoordinate(walkSegment.destination) || facts.destination,
          destinationPoi
        });
        lines.push(...await renderAccessibleWalkLeg(walkSegment.steps || [], label, walkSegment.distance, walkFacts, {
          collector,
          legIndex: segmentNumber - 1,
          legLabel: label
        }));
      } else {
        lines.push(`${label}：高德没有返回可拆分步行段，不能生成步行动作脚本。`);
      }
      lines.push('');
    }
  }
  return lines;
}

function renderNoOutdoorTransitWalk(leg, ordinal, transitPlan) {
  if (leg.role === 'initial') {
    const entranceName = normalizeTextValue(leg.destinationPoi?.name)
      || normalizeTextValue(leg.originPoi?.name)
      || '当前地铁口';
    return [
      `${ordinal}段：站内进站。`,
      `起点确认：当前位置就是${entranceName}入口坐标，不需要室外步行；直接进站并找工作人员引导到上车站台。`
    ];
  }
  const exitName = normalizeTextValue(transitPlan.finalExit?.poi?.name)
    || normalizeTextValue(leg.destinationPoi?.name)
    || '指定地铁口';
  return [
    `${ordinal}段：站内出站。`,
    `终点确认：按工作人员引导从${exitName}出站，出口坐标就是目的地，不需要室外步行。`
  ];
}

function getFinalLegRoadApproach(collector, legIndex) {
  const steps = Array.isArray(collector?.route?.followSteps) ? collector.route.followSteps : [];
  return [...steps].reverse().find((step) => (
    Number(step.legIndex || 0) === Number(legIndex || 0)
    && (step.kind === 'walk' || step.kind === 'finalApproach')
    && step.roadName
    && (step.roadSide === 'left' || step.roadSide === 'right')
  )) || null;
}

function sameStopCoordinate(arrivalStop, departureStop) {
  const arrival = parseLngLat(getStopCoordinate(arrivalStop));
  const departure = parseLngLat(getStopCoordinate(departureStop));
  if (!arrival || !departure || distanceMeters(arrival, departure) > 8) {
    return false;
  }
  const arrivalId = normalizeTextValue(arrivalStop?.id);
  const departureId = normalizeTextValue(departureStop?.id);
  return Boolean(
    (arrivalId && departureId && arrivalId === departureId)
    || sameStopName(arrivalStop?.name, departureStop?.name)
  );
}

function coordinatesWithinMeters(leftCoordinate, rightCoordinate, maximumDistance) {
  const left = parseLngLat(leftCoordinate);
  const right = parseLngLat(rightCoordinate);
  return Boolean(left && right && distanceMeters(left, right) <= maximumDistance);
}

function isWalkLegReplannedToStop(walkLeg, stop) {
  const source = normalizeTextValue(walkLeg?.segment?.source);
  if (!['initial_stop_replanned', 'transfer_replanned', 'transfer_exit_replanned'].includes(source)) {
    return false;
  }
  const requestedStop = parseLngLat(getPoiNavigationCoordinate(walkLeg?.destinationPoi));
  const vehicleStop = parseLngLat(getStopCoordinate(stop));
  return Boolean(requestedStop && vehicleStop && distanceMeters(requestedStop, vehicleStop) <= 3);
}

function describeTransitWalkRole(leg) {
  if (leg.role === 'initial') {
    return '从本次出发点到第一段上车点。';
  }
  if (leg.role === 'transfer') {
    const origin = leg.originPoi?.name || '上一段下车点';
    const destination = leg.destinationPoi?.name || '下一段上车点';
    return `从${origin}到${destination}，上一段终点作为本段起点。`;
  }
  if (leg.role === 'final') {
    return '从最后下车出口到目的地。';
  }
  return '';
}

function formatChineseOrdinal(value) {
  const ordinals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const number = Number(value || 0);
  if (number > 0 && number <= 10) {
    return `第${ordinals[number]}`;
  }
  return `第${number}`;
}

function renderAccessibleTransitRideSection(transitPlan) {
  const lines = [];
  const vehicles = transitPlan.vehicles || [];
  if (!vehicles.length) {
    return ['高德没有返回可用乘车段。'];
  }
  vehicles.forEach((segment, index) => {
    const departure = segment.departureStop?.name || '未知上车站';
    const arrival = segment.arrivalStop?.name || '未知下车站';
    const name = segment.name || '未知线路';
    const viaNum = Number(segment.viaNum || 0);
    const viaStops = (segment.viaStops || []).map((stop) => stop.name).filter(Boolean);
    lines.push(`${index + 1}. 乘坐 ${name}，从 ${departure} 上车，到 ${arrival} 下车，途经约 ${viaNum} 个中间站。`);
    if (viaStops.length) {
      lines.push(`   途经站：${viaStops.join('、')}。`);
    }
    const transferWalk = (transitPlan.transferWalks || [])[index];
    const nextVehicle = vehicles[index + 1];
    if (nextVehicle) {
      const transferDistance = transferWalk ? formatMeters(transferWalk.distance) : '距离未知';
      const nextName = nextVehicle.name || '下一条线路';
      const nextDeparture = nextVehicle.departureStop?.name || arrival;
      lines.push(`   在 ${arrival} 换乘 ${nextName}；站内换乘步行约 ${transferDistance}，跟随站内导向到 ${nextDeparture} 的站台。`);
    }
  });
  const finalArrival = vehicles[vehicles.length - 1]?.arrivalStop?.name || '';
  if (finalArrival) {
    lines.push(`到 ${finalArrival} 下车后，先按站内导向找出口；不要把站厅中心点当成第三段起点。`);
  }
  return lines;
}

function renderFinalExitLockLines(transitPlan) {
  const lines = [];
  const exit = transitPlan.finalExit;
  if (exit?.locked && exit.poi) {
    const hintText = exit.hint ? `${exit.hint.stationName}站${exit.hint.exitName}` : exit.poi.name;
    lines.push(`出站口：${hintText}。`);
    lines.push('出站后先站在口外面对马路，再按下面的步行段走。');
  } else if (exit?.hint) {
    lines.push(`${exit.hint.stationName}站${exit.hint.exitName}的出口坐标未锁定，本路线判失败。`);
  } else {
    lines.push('下车站出口未锁定，本路线判失败。');
  }
  return lines;
}

function buildTransitWalkFacts(facts, overrides = {}) {
  return {
    ...facts,
    ...overrides,
    mode: 'walking'
  };
}

function getStopCoordinate(stop) {
  return normalizeCoordinate(stop?.location);
}

function buildStopPoi(stop, fallbackName) {
  const name = normalizeTextValue(stop?.name) || fallbackName || '站点';
  const location = getStopCoordinate(stop);
  return {
    id: normalizeTextValue(stop?.id),
    name,
    type: 'transit_stop',
    address: '',
    streetNumber: '',
    streetNumberParity: '',
    location,
    entrLocation: location,
    exitLocation: '',
    adname: '',
    cityname: '',
    pname: '',
    tel: ''
  };
}

function buildTransitExitOriginPoi(poi, steps) {
  const firstRoad = normalizeTextValue(poi?.knownFacingRoad)
    || extractAddressRoadName(poi?.address || '')
    || getFirstSupportedRouteRoad(steps || []);
  const startSide = inferPreferredSideForRoad(steps || [], 0);
  return {
    ...poi,
    isTransitExit: true,
    knownFacingRoad: firstRoad,
    knownStartSide: normalizeSideValue(startSide)
  };
}

function buildTransitRouteOriginPoi(poi, steps) {
  const firstRoad = normalizeTextValue(poi?.knownFacingRoad)
    || extractAddressRoadName(poi?.address || '')
    || getFirstSupportedRouteRoad(steps || []);
  const startSide = inferPreferredSideForRoad(steps || [], 0);
  return {
    ...poi,
    knownFacingRoad: firstRoad,
    knownStartSide: normalizeSideValue(startSide)
  };
}

function getFirstSupportedRouteRoad(steps) {
  const list = Array.isArray(steps) ? steps : [];
  for (let index = 0; index < Math.min(list.length, 4); index += 1) {
    const road = normalizeTextValue(list[index]?.road) || inferMainRoadByNearestDistance(list[index]);
    if (road) {
      return road;
    }
  }
  return '';
}

function createRouteStepCollector(facts) {
  return {
    route: {
      schemaVersion: 1,
      provider: facts.provider || 'amap',
      mode: facts.mode || '',
      coordinateSystem: 'GCJ-02',
      generatedAt: facts.generatedAt || new Date().toISOString(),
      routeDistanceMeters: Number(facts.routeDistance || 0),
      routeDurationSeconds: Number(facts.routeDuration || 0),
      origin: {
        location: facts.origin || '',
        name: facts.originPoi?.name || ''
      },
      destination: {
        location: facts.destination || '',
        name: facts.destinationPoi?.name || '',
        entrLocation: facts.destinationPoi?.entrLocation || '',
        address: facts.destinationPoi?.address || ''
      },
      principle: 'GPS播报消费无障碍路线；polyline只作为同源定位骨架，不重新生成路线。',
      followSteps: []
    }
  };
}

function addStructuredWalkStep(options, input) {
  const collector = options?.collector;
  if (!collector?.route?.followSteps || !Array.isArray(input?.sourceStepIndexes)) {
    return;
  }
  const sourceIndexes = input.sourceStepIndexes
    .filter((index) => Number.isInteger(index) && index >= 0)
    .filter((index, position, array) => array.indexOf(index) === position);
  if (!sourceIndexes.length) {
    return;
  }
  const sourceSteps = sourceIndexes.map((index) => input.steps?.[index]).filter(Boolean);
  const polyline = combineStepPolylines(sourceSteps);
  const endpoints = getPolylineEndpoints(polyline);
  const distanceMeters = input.distanceMeters !== undefined
    ? Number(input.distanceMeters || 0)
    : sourceSteps.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  const followStep = {
    id: `${options.legLabel || 'walk'}-${collector.route.followSteps.length + 1}`,
    kind: input.kind || 'walk',
    legIndex: Number(options.legIndex || 0),
    legLabel: options.legLabel || '',
    lineNumber: input.lineNumber || 0,
    sourceStepIndexes: sourceIndexes,
    sourceStepCount: sourceSteps.length,
    roadName: normalizeTextValue(input.roadName),
    targetRoadName: normalizeTextValue(input.targetRoadName),
    roadSide: normalizeSideValue(input.roadSide),
    nextRoadSide: normalizeSideValue(input.nextRoadSide),
    distanceMeters,
    polyline,
    startLocation: endpoints.start,
    endLocation: endpoints.end,
    turnPoint: normalizeCoordinate(input.turnPoint) || '',
    turnDirection: input.turnDirection || '',
    turnSize: input.turnSize || '',
    crossingCount: Number.isFinite(Number(input.crossingCount)) ? Number(input.crossingCount) : 0,
    crossingRoads: Array.isArray(input.crossingRoads) ? input.crossingRoads.filter(Boolean) : [],
    destinationSide: normalizeSideValue(input.destinationSide),
    spokenText: input.spokenText || '',
    announce: buildDefaultAnnouncement(input.kind || 'walk')
  };
  collector.route.followSteps.push(followStep);
}

function buildDefaultAnnouncement(kind) {
  if (kind === 'turn') {
    return {
      onEnter: false,
      beforeTurnMeters: [30, 15, 5],
      arrivalMeters: 0
    };
  }
  if (kind === 'finalApproach') {
    return {
      onEnter: true,
      beforeTurnMeters: [],
      arrivalMeters: 20
    };
  }
  return {
    onEnter: true,
    beforeTurnMeters: [],
    arrivalMeters: 0
  };
}

function normalizeSideValue(side) {
  return side === 'left' || side === 'right' ? side : '';
}

function combineStepPolylines(steps) {
  const points = [];
  for (const step of steps) {
    for (const point of String(step?.polyline || '').split(';').filter(Boolean)) {
      if (point && points[points.length - 1] !== point) {
        points.push(point);
      }
    }
  }
  return points.join(';');
}

function getPolylineEndpoints(polyline) {
  const points = String(polyline || '').split(';').filter(Boolean);
  return {
    start: points[0] || '',
    end: points[points.length - 1] || ''
  };
}

function getTurnPointFromSteps(step, nextStep) {
  const currentEnd = getPolylineEndpoints(step?.polyline).end;
  const nextStart = getPolylineEndpoints(nextStep?.polyline).start;
  return currentEnd || nextStart || '';
}

function inferTurnSizeFromText(text, currentSide, turnDirection) {
  if (/大转弯/.test(text)) {
    return 'big';
  }
  if (/小转弯/.test(text)) {
    return 'small';
  }
  if (currentSide && turnDirection) {
    return currentSide === turnDirection ? 'small' : 'big';
  }
  return '';
}

function inferCrossingCountFromText(text) {
  const matches = String(text || '').match(/过[^，。；：]*一次/g);
  return matches ? matches.length : 0;
}

function getCrossingRoadNames(step, currentRoad, targetRoad = '', futureRoadName = '', excludedRoads = []) {
  return uniqueRoadNames(step?.inferredCrossRoads || [])
    .filter((road) => !sameRoadName(road, currentRoad))
    .filter((road) => !sameRoadName(road, targetRoad))
    .filter((road) => !sameRoadName(road, futureRoadName))
    .filter((road) => !excludedRoads.some((excluded) => sameRoadName(road, excluded)));
}

async function renderAccessibleWalkLeg(steps, label, distance, facts = {}, options = {}) {
  const lines = [
    `${label}，约 ${formatMeters(distance || sumStepDistance(steps))}。`
  ];

  if (!steps.length) {
    lines.push('地图没有返回可拆分的小步，无法生成步行动作脚本。');
    return lines;
  }

  if (isComplexConnectorWalkLeg(steps, facts.destinationPoi)) {
    return renderComplexConnectorWalkLeg(lines, steps, facts, options);
  }

  const routeState = initWalkingRouteState(steps, facts);
  const destinationSideEvidence = await inferDestinationSideForRoute(facts, steps);
  routeState.destinationSide = destinationSideEvidence.side || '';
  lines.push(...buildWalkLegAnchorLines(steps, facts, routeState));
  let lineNumber = 1;

  if (routeState.startLines.length) {
    for (const [startLineIndex, line] of routeState.startLines.entries()) {
      const consumesSecondStep = startLineIndex === 1 && Boolean(normalizeTextValue(steps[1]?.road));
      lines.push(`${lineNumber}. ${line}`);
      addStructuredWalkStep(options, {
        kind: startLineIndex === 0 ? 'startConnector' : consumesSecondStep ? 'walk' : 'orientation',
        lineNumber,
        spokenText: line,
        steps,
        sourceStepIndexes: startLineIndex === 0 ? [0] : consumesSecondStep ? [1] : [],
        roadName: startLineIndex === 0 ? routeState.currentRoad : normalizeTextValue(steps[1]?.road) || routeState.currentRoad,
        roadSide: startLineIndex === 0 ? '' : routeState.currentSide,
        distanceMeters: startLineIndex === 0
          ? Number(steps[0]?.distance || 0)
          : consumesSecondStep
          ? Number(steps[1]?.distance || 0)
          : 0
      });
      lineNumber += 1;
    }
  }

  for (let index = routeState.nextStepIndex; index < steps.length; index += 1) {
    const step = steps[index];
    const nextStep = steps[index + 1];
    const road = normalizeTextValue(step.road);
    const inferredEndRoad = normalizeTextValue(step.inferredEndRoad);
    let stepDistanceRendered = index === routeState.walkAlreadyRenderedIndex;
    if (road) {
      routeState.currentRoad = road;
      if (routeState.destinationSide && isFinalRoad(road, facts, steps)) {
        routeState.currentSide = routeState.destinationSide;
      }
      routeState.lastPublicRoad = road;
      routeState.lastPublicSide = routeState.currentSide || routeState.lastPublicSide || '';
    }

    if (road && step.distance > 0 && !stepDistanceRendered) {
      const nextRoadName = normalizeTextValue(nextStep?.road) || inferredEndRoad;
      const targetText = nextRoadName ? buildRoadJunctionText(road, nextRoadName) : '';
      const futureRoadName = findNextNamedRoad(steps, index + 1);
      const previousRoadName = findPreviousNamedRoad(steps, index - 1);
      const excludedCrossRoads = [previousRoadName].filter(Boolean);
      const crossText = buildCrossingRoadText(step, road, nextRoadName, futureRoadName, excludedCrossRoads);
      const destinationText = routeState.destinationName ? `，到${routeState.destinationName}附近` : '，到目的地附近';
      const arrivalText = isArrivalStep(step) ? destinationText : '';
      const sideText = routeState.currentSide ? `${road}${roadSideText(routeState.currentSide)}` : road;
      const spokenText = `沿${sideText}走约 ${formatMeters(step.distance)}${crossText}${targetText}${arrivalText}。`;
      lines.push(`${lineNumber}. ${spokenText}`);
      const crossingRoads = getCrossingRoadNames(step, road, nextRoadName, futureRoadName, excludedCrossRoads);
      addStructuredWalkStep(options, {
        kind: isArrivalStep(step) ? 'finalApproach' : 'walk',
        lineNumber,
        spokenText,
        steps,
        sourceStepIndexes: [index],
        roadName: road,
        roadSide: routeState.currentSide || '',
        distanceMeters: step.distance,
        crossingRoads,
        crossingCount: crossingRoads.length,
        destinationSide: isArrivalStep(step) ? routeState.destinationSide : ''
      });
      stepDistanceRendered = true;
      lineNumber += 1;
    } else if (!road && step.distance > 0 && !stepDistanceRendered) {
      const futureRoadName = findNextNamedRoad(steps, index + 1);
      const endpointConnector = isEndpointConnectorStep(steps, index, facts.destinationPoi);
      const connectorArrivalText = index === steps.length - 1 || isArrivalStep(step)
        ? `，到${routeState.destinationName || '目的地'}入口坐标附近`
        : '';
      const inferredText = endpointConnector
        ? `沿入口连接箭头${describeRawMapMotion(step)}${connectorArrivalText}。`
        : describeInferredRoadStep(step, routeState, nextStep, futureRoadName);
      if (inferredText) {
        lines.push(`${lineNumber}. ${inferredText}`);
        const currentRoad = endpointConnector
          ? '入口连接段'
          : inferMainRoadByNearestDistance(step) || routeState.currentRoad || '未标路名连接段';
        const crossingRoads = endpointConnector
          ? []
          : getCrossingRoadNames(step, currentRoad, getLastInferredRoad(step), futureRoadName);
        addStructuredWalkStep(options, {
          kind: index === steps.length - 1 || isArrivalStep(step) ? 'finalApproach' : 'walk',
          lineNumber,
          spokenText: inferredText,
          steps,
          sourceStepIndexes: [index],
          roadName: currentRoad,
          roadSide: endpointConnector ? '' : routeState.currentSide || '',
          distanceMeters: step.distance,
          crossingRoads,
          crossingCount: crossingRoads.length,
          destinationSide: index === steps.length - 1 ? routeState.destinationSide : ''
        });
        stepDistanceRendered = true;
        lineNumber += 1;
        const lastRoad = endpointConnector ? '' : getLastInferredRoad(step);
        const nextRoadForApproach = normalizeTextValue(nextStep?.road);
        if (lastRoad && !sameRoadName(lastRoad, nextRoadForApproach)) {
          routeState.approachRoad = lastRoad;
        }
        if (endpointConnector) {
          routeState.currentRoad = '入口连接段';
          routeState.currentSide = '';
        }
      }
    }

    const turnDirection = getTurnDirection(step, nextStep);
    const targetRoad = normalizeTextValue(nextStep?.road) || inferredEndRoad;
    if (turnDirection && targetRoad) {
      const preferredTargetSide = routeState.destinationSide && isFinalRoad(targetRoad, facts, steps)
        ? routeState.destinationSide
        : inferPreferredSideForRoad(steps, index + 1);
      const currentForNamedTurn = routeState.currentRoad || road || routeState.approachRoad || '未命名通道';
      const turn = describeSideAwareTurn(currentForNamedTurn, targetRoad, routeState.currentSide, turnDirection, preferredTargetSide);
      lines.push(`${lineNumber}. ${turn.text}`);
      addStructuredWalkStep(options, {
        kind: 'turn',
        lineNumber,
        spokenText: turn.text,
        steps,
        sourceStepIndexes: [index, index + 1],
        roadName: currentForNamedTurn,
        targetRoadName: targetRoad,
        roadSide: routeState.currentSide || '',
        nextRoadSide: turn.nextSide || '',
        turnDirection,
        turnSize: inferTurnSizeFromText(turn.text, routeState.currentSide, turnDirection),
        turnPoint: getTurnPointFromSteps(step, nextStep),
        distanceMeters: 0,
        crossingCount: inferCrossingCountFromText(turn.text)
      });
      lineNumber += 1;
      routeState.currentRoad = targetRoad;
      routeState.currentSide = turn.nextSide || routeState.currentSide;
      routeState.lastPublicRoad = targetRoad;
      routeState.lastPublicSide = routeState.currentSide || '';
      routeState.approachRoad = '';
    } else if (turnDirection && nextStep && !targetRoad) {
      const currentForUnnamedTurnSource = road ? 'step' : routeState.currentRoad ? 'state' : routeState.approachRoad ? 'approach' : 'unnamed';
      const currentForUnnamedTurn = road || routeState.currentRoad || routeState.approachRoad || '未命名通道';
      if (isEndpointConnectorStep(steps, index + 1, facts.destinationPoi)) {
        const turnInfo = describeUnnamedTurnGeometry(currentForUnnamedTurn, routeState.currentSide, turnDirection);
        const entranceTurnText = `在${currentForUnnamedTurn}这一段尽头，${turnInfo.text}，进入${routeState.destinationName || '目的地'}入口连接段。`;
        lines.push(`${lineNumber}. ${entranceTurnText}`);
        addStructuredWalkStep(options, {
          kind: 'turn',
          lineNumber,
          spokenText: entranceTurnText,
          steps,
          sourceStepIndexes: [index, index + 1],
          roadName: currentForUnnamedTurn,
          roadSide: routeState.currentSide || '',
          targetRoadName: '入口连接段',
          nextRoadSide: turnInfo.nextSide || '',
          distanceMeters: 0,
          turnDirection,
          turnSize: inferTurnSizeFromText(entranceTurnText, routeState.currentSide, turnDirection),
          turnPoint: getTurnPointFromSteps(step, nextStep),
          destinationSide: ''
        });
        lineNumber += 1;
        if (isTerminalUnnamedApproach(steps, index + 1, facts.destinationPoi)) {
          for (let connectorIndex = index + 1; connectorIndex < steps.length; connectorIndex += 1) {
            const connectorStep = steps[connectorIndex];
            const followingStep = steps[connectorIndex + 1];
            const connectorTurn = getTurnDirection(connectorStep, followingStep);
            const connectorTurnText = connectorTurn ? `，到这段尽头后${connectorTurn === 'left' ? '左转' : '右转'}` : '';
            const connectorArrivalText = connectorIndex === steps.length - 1 || isArrivalStep(connectorStep)
              ? `，到${routeState.destinationName || '目的地'}入口坐标附近`
              : '';
            const connectorText = `沿入口连接箭头${describeRawMapMotion(connectorStep)}${connectorTurnText}${connectorArrivalText}。`;
            lines.push(`${lineNumber}. ${connectorText}`);
            addStructuredWalkStep(options, {
              kind: connectorIndex === steps.length - 1 || isArrivalStep(connectorStep) ? 'finalApproach' : 'walk',
              lineNumber,
              spokenText: connectorText,
              steps,
              sourceStepIndexes: [connectorIndex],
              roadName: '入口连接段',
              roadSide: '',
              distanceMeters: Number(connectorStep.distance || 0),
              turnDirection: connectorTurn,
              turnSize: connectorTurn ? inferTurnSizeFromText(connectorText, '', connectorTurn) : '',
              turnPoint: connectorTurn ? getTurnPointFromSteps(connectorStep, followingStep) : '',
              destinationSide: connectorIndex === steps.length - 1 ? routeState.destinationSide : ''
            });
            lineNumber += 1;
          }
          break;
        }
        routeState.currentRoad = '入口连接段';
        routeState.currentSide = '';
        routeState.approachRoad = '';
        continue;
      }
      const continuedCurrentRoad = inferContinuedCurrentRoad(nextStep, currentForUnnamedTurn);
      const recoveredTargetRoad = continuedCurrentRoad || inferRecoveredTargetRoad(nextStep, steps[index + 2], currentForUnnamedTurn);
      const connectorTargetRoad = findNextNamedRoad(steps, index + 1);
      const unnamedTurn = continuedCurrentRoad
        ? describeTurnWithUnnamedContinuation(currentForUnnamedTurn, routeState.currentSide, turnDirection, currentForUnnamedTurnSource)
        : recoveredTargetRoad
        ? describeTurnIntoRecoveredRoad(currentForUnnamedTurn, recoveredTargetRoad, routeState.currentSide, turnDirection)
        : describeTurnIntoUnnamedPath(currentForUnnamedTurn, routeState.currentSide, turnDirection, connectorTargetRoad);
      lines.push(`${lineNumber}. ${unnamedTurn.text}`);
      addStructuredWalkStep(options, {
        kind: 'turn',
        lineNumber,
        spokenText: unnamedTurn.text,
        steps,
        sourceStepIndexes: [index, index + 1],
        roadName: currentForUnnamedTurn,
        targetRoadName: recoveredTargetRoad || continuedCurrentRoad || connectorTargetRoad || '未标路名连接段',
        roadSide: routeState.currentSide || '',
        nextRoadSide: unnamedTurn.nextSide || '',
        turnDirection,
        turnSize: inferTurnSizeFromText(unnamedTurn.text, routeState.currentSide, turnDirection),
        turnPoint: getTurnPointFromSteps(step, nextStep),
        distanceMeters: 0,
        crossingCount: inferCrossingCountFromText(unnamedTurn.text)
      });
      lineNumber += 1;
      routeState.unnamedFromRoad = recoveredTargetRoad ? '' : (currentForUnnamedTurn === '未命名通道' ? '' : currentForUnnamedTurn);
      routeState.currentRoad = recoveredTargetRoad || continuedCurrentRoad || '未标路名连接段';
      routeState.currentSide = unnamedTurn.nextSide || '';
      routeState.approachRoad = '';
    } else if (isArrivalStep(step) && !road && !stepDistanceRendered) {
      const destinationText = routeState.destinationName ? `到${routeState.destinationName}附近` : '到目的地附近';
      const finalText = describeFinalApproach(step, routeState.currentRoad, routeState.currentSide, destinationText);
      lines.push(`${lineNumber}. ${finalText}`);
      addStructuredWalkStep(options, {
        kind: 'finalApproach',
        lineNumber,
        spokenText: finalText,
        steps,
        sourceStepIndexes: [index],
        roadName: routeState.currentRoad || '未标路名连接段',
        roadSide: routeState.currentSide || '',
        distanceMeters: step.distance,
        destinationSide: routeState.destinationSide
      });
      lineNumber += 1;
    }
  }

  const inferredFinalRoadStep = getFinalRoadStep(steps, facts.destinationPoi);
  const finalRoadStep = isTransitStopPoi(facts.destinationPoi)
    && normalizeTextValue(routeState.lastPublicRoad)
    ? {
      ...inferredFinalRoadStep,
      road: normalizeTextValue(routeState.lastPublicRoad),
      roadEvidenceSource: 'route_state_at_stop'
    }
    : inferredFinalRoadStep;
  const completedDestinationSideEvidence = completeDestinationSideFromArrival(
    destinationSideEvidence,
    routeState,
    finalRoadStep,
    steps,
    facts.destinationPoi
  );
  const finalDestinationEvidence = buildDestinationEvidence(
    facts.destinationPoi,
    completedDestinationSideEvidence,
    finalRoadStep
  );
  if (finalDestinationEvidence) {
    lines.push(`${lineNumber}. 终点锚点：${finalDestinationEvidence}`);
  }

  return lines;
}

function isComplexConnectorWalkLeg(steps, destinationPoi) {
  if (!isComplexEntranceDestinationPoi(destinationPoi)) {
    return false;
  }
  const totalDistance = sumStepDistance(steps || []);
  return totalDistance > 0
    && totalDistance <= 300
    && (steps || []).every((step) => !normalizeTextValue(step?.road) && !inferMainRoadByNearestDistance(step));
}

function renderComplexConnectorWalkLeg(lines, steps, facts, options) {
  const originName = normalizeTextValue(facts.originPoi?.name) || '本段起点';
  const destinationName = normalizeTextValue(facts.destinationPoi?.name) || '入口';
  lines.push(`起点确认：从${originName}当前位置开始。`);
  lines.push(`终点确认：本段箭头终点锁定到${destinationName}入口坐标。`);
  let lineNumber = 1;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const nextStep = steps[index + 1];
    const motion = describeRawMapMotion(step);
    const turnDirection = getTurnDirection(step, nextStep);
    const turnText = turnDirection ? `，到这段尽头后${turnDirection === 'left' ? '左转' : '右转'}` : '';
    const arrivalText = index === steps.length - 1 || isArrivalStep(step)
      ? `，到${destinationName}入口坐标附近`
      : '';
    const spokenText = `${index === 0 ? '从当前位置' : '接上一步'}按箭头${motion}${turnText}${arrivalText}。`;
    lines.push(`${lineNumber}. ${spokenText}`);
    addStructuredWalkStep(options, {
      kind: index === steps.length - 1 || isArrivalStep(step) ? 'finalApproach' : 'walk',
      lineNumber,
      spokenText,
      steps,
      sourceStepIndexes: [index],
      roadName: '入口连接段',
      roadSide: '',
      distanceMeters: Number(step.distance || 0),
      turnDirection,
      turnSize: turnDirection ? inferTurnSizeFromText(spokenText, '', turnDirection) : '',
      turnPoint: turnDirection ? getTurnPointFromSteps(step, nextStep) : '',
      destinationSide: ''
    });
    lineNumber += 1;
  }
  return lines;
}

function buildWalkLegAnchorLines(steps, facts = {}, routeState = {}) {
  const lines = [];
  const startRoad = getWalkLegStartRoad(steps, facts, routeState);
  const routeStopRoad = isTransitStopPoi(facts.destinationPoi)
    ? normalizeTextValue(routeState.lastPublicRoad || routeState.currentRoad)
    : '';
  const destinationRoadEvidence = routeStopRoad
    ? {
      addressRoad: routeStopRoad,
      addressRoadSource: 'route_state_at_stop',
      routeRoad: routeStopRoad,
      routeRoadSource: 'route_state_at_stop',
      matched: true
    }
    : getWalkLegDestinationRoadEvidence(steps, facts);
  const originName = normalizeTextValue(facts.originPoi?.name) || '本段起点';
  const destinationName = normalizeTextValue(facts.destinationPoi?.name) || '本段终点';
  const startSide = normalizeSideValue(routeState.currentSide || facts.originPoi?.knownStartSide);
  if (startRoad) {
    const originIsExit = facts.originPoi?.isTransitExit || isTransitExitPoiName(originName);
    const hasConnectorToRoad = !normalizeTextValue(steps?.[0]?.road) && Boolean(normalizeTextValue(steps?.[1]?.road));
    const startPrefix = originIsExit
      ? `起点确认：从${originName}出来后面对${startRoad}`
      : hasConnectorToRoad
      ? `起点确认：${originName}，先从出入口走到${startRoad}路边；到路边后面对${startRoad}`
      : `起点确认：${originName}，先面对${startRoad}`;
    const sideText = startSide ? `，从${startRoad}${roadSideText(startSide)}开始` : '';
    lines.push(`${startPrefix}${sideText}。`);
  } else if (isComplexEntranceDestinationPoi(facts.destinationPoi)) {
    lines.push(`起点确认：从${originName}出口坐标当前位置开始，直接执行下面第一条入口连接箭头。`);
  } else {
    lines.push(`起点确认：${originName}，本段起点路名没有在地图步行 step 里直接写出，先按第一句走到路边再确认。`);
  }
  if (destinationRoadEvidence.addressRoad && destinationRoadEvidence.routeRoad) {
    const anchorLabel = destinationRoadEvidence.addressRoadSource === 'amap_destination_regeo'
      ? '高德点位在'
      : '高德地址在';
    if (destinationRoadEvidence.routeRoadSource === 'address_fallback') {
      lines.push(`终点确认：${destinationName}${anchorLabel}${destinationRoadEvidence.addressRoad}，末段到达${destinationRoadEvidence.addressRoad}。`);
    } else if (destinationRoadEvidence.matched) {
      lines.push(`终点确认：${destinationName}${anchorLabel}${destinationRoadEvidence.addressRoad}，本次沿${destinationRoadEvidence.routeRoad}到大入口。`);
    } else if (destinationRoadEvidence.entranceCoordinateClosed) {
      lines.push(`终点确认：${destinationName}${anchorLabel}${destinationRoadEvidence.addressRoad}，路线箭头已闭合到${destinationRoadEvidence.routeRoad}一侧的高德入口坐标；到入口附近后用慧眼确认门牌或招牌。`);
    } else if (isComplexEntranceDestinationPoi(facts.destinationPoi)) {
      lines.push(`终点确认：${destinationName}${anchorLabel}${destinationRoadEvidence.addressRoad}，本次从${destinationRoadEvidence.routeRoad}到大入口。`);
    } else {
      lines.push(`终点确认：${destinationName}${anchorLabel}${destinationRoadEvidence.addressRoad}，但末段箭头落在${destinationRoadEvidence.routeRoad}，两者冲突，本路线判失败。`);
    }
  } else if (destinationRoadEvidence.addressRoad) {
    lines.push(`终点确认：${destinationName}高德地址在${destinationRoadEvidence.addressRoad}，但末段道路未锁定，本路线判失败。`);
  } else if (destinationRoadEvidence.routeRoad) {
    lines.push(`终点确认：本次沿${destinationRoadEvidence.routeRoad}到${destinationName}，但高德地址道路缺失，本路线判失败。`);
  } else {
    lines.push(`终点确认：${destinationName}的终点道路未锁定，本路线判失败。`);
  }
  return lines;
}

function getWalkLegStartRoad(steps, facts = {}, routeState = {}) {
  return normalizeTextValue(facts.originPoi?.knownFacingRoad)
    || extractAddressRoadName(facts.originPoi?.address || '')
    || normalizeTextValue(routeState.currentRoad)
    || normalizeTextValue(steps?.[0]?.road)
    || normalizeTextValue(steps?.[1]?.road)
    || findNextNamedRoad(steps || [], 0);
}

function getWalkLegDestinationRoadEvidence(steps, facts = {}) {
  const addressRoad = getDestinationRoadAnchor(facts.destinationPoi);
  const finalRoadStep = getFinalRoadStep(steps || [], facts.destinationPoi);
  const routeRoad = normalizeTextValue(finalRoadStep?.road);
  const entranceCoordinateClosed = isAddressRoadApproachClosedToExplicitEntrance(steps, facts.destinationPoi);
  return {
    addressRoad,
    routeRoad,
    matched: Boolean(addressRoad && routeRoad && sameRoadName(addressRoad, routeRoad)),
    entranceCoordinateClosed,
    routeRoadSource: normalizeTextValue(finalRoadStep?.roadEvidenceSource),
    addressRoadSource: normalizeTextValue(facts.destinationPoi?.addressEvidenceSource)
      || (facts.destinationPoi?.nearbyRoadAnchor ? 'amap_destination_regeo' : '')
  };
}

function findPreviousNamedRoad(steps, startIndex) {
  for (let index = Math.min(Number(startIndex || 0), steps.length - 1); index >= 0; index -= 1) {
    const road = normalizeTextValue(steps[index]?.road);
    if (road) {
      return road;
    }
  }
  return '';
}

function initWalkingRouteState(steps, facts = {}) {
  const state = {
    currentRoad: '',
    currentSide: '',
    lastPublicRoad: '',
    lastPublicSide: '',
    approachRoad: '',
    unnamedFromRoad: '',
    destinationName: facts.destinationPoi?.name || '',
    nextStepIndex: 0,
    walkAlreadyRenderedIndex: -1,
    startLines: []
  };
  const first = steps[0];
  const second = steps[1];
  const explicitFirstRoad = normalizeTextValue(first?.road);
  const inferredFirstRoad = inferMainRoadByNearestDistance(first);
  const firstRoad = explicitFirstRoad || inferredFirstRoad;
  if (firstRoad) {
    const knownStartSide = normalizeSideValue(facts.originPoi?.knownStartSide)
      || (isTransitExitPoiName(facts.originPoi?.name) ? inferPreferredSideForRoad(steps || [], 0) : '');
    state.currentRoad = firstRoad;
    state.currentSide = knownStartSide;
    state.lastPublicRoad = firstRoad;
    state.lastPublicSide = knownStartSide;
    return state;
  }
  if (!first || !second) {
    return state;
  }
  const direction = getTurnDirection(first, second);
  if (!direction) {
    return state;
  }
  const connectorDistance = formatMeters(first.distance);
  const knownFacingRoad = normalizeTextValue(facts.originPoi?.knownFacingRoad);
  const secondRoad = normalizeTextValue(second.road) || knownFacingRoad;
  if (!secondRoad) {
    return state;
  }
  const side = direction;
  state.currentRoad = secondRoad;
  const nextRoad = normalizeTextValue(steps[2]?.road);
  const targetText = nextRoad ? buildRoadJunctionText(state.currentRoad, nextRoad) : '';
  state.currentSide = side;
  state.lastPublicRoad = secondRoad;
  state.lastPublicSide = side;
  state.nextStepIndex = 1;
  state.walkAlreadyRenderedIndex = normalizeTextValue(second.road) ? 1 : -1;
  state.startLines = [
    `从出入口先走到路边，约 ${connectorDistance}。`,
    normalizeTextValue(second.road)
      ? `到路边后，面对${state.currentRoad}，往${direction === 'left' ? '左' : '右'}走；沿${state.currentRoad}${roadSideText(side)}走约 ${formatMeters(second.distance)}${targetText}。`
      : `到路边后，面对${state.currentRoad}，往${direction === 'left' ? '左' : '右'}走。`
  ];
  return state;
}

function getTurnDirection(step, nextStep = null) {
  const geometryDirection = inferTurnDirectionFromPolyline(step?.polyline, nextStep?.polyline);
  if (geometryDirection) {
    return geometryDirection;
  }
  const text = `${normalizeTextValue(step?.action)} ${normalizeTextValue(step?.assistantAction)} ${normalizeTextValue(step?.instruction)}`;
  if (/左转|向左/.test(text)) {
    return 'left';
  }
  if (/右转|向右/.test(text)) {
    return 'right';
  }
  return '';
}

function inferTurnDirectionFromPolyline(currentPolyline, nextPolyline) {
  const currentVector = getPolylineEndVector(currentPolyline);
  const nextVector = getPolylineStartVector(nextPolyline);
  if (!currentVector || !nextVector) {
    return '';
  }
  const cross = currentVector.x * nextVector.y - currentVector.y * nextVector.x;
  const dot = currentVector.x * nextVector.x + currentVector.y * nextVector.y;
  const angle = Math.atan2(cross, dot) * 180 / Math.PI;
  if (Math.abs(angle) < 25 || Math.abs(angle) > 155) {
    return '';
  }
  return angle > 0 ? 'left' : 'right';
}

function getPolylineEndVector(polyline) {
  const points = parsePolylinePoints(polyline);
  for (let index = points.length - 1; index > 0; index -= 1) {
    const vector = vectorBetween(points[index - 1], points[index]);
    if (vector) {
      return vector;
    }
  }
  return null;
}

function getPolylineStartVector(polyline) {
  const points = parsePolylinePoints(polyline);
  for (let index = 0; index < points.length - 1; index += 1) {
    const vector = vectorBetween(points[index], points[index + 1]);
    if (vector) {
      return vector;
    }
  }
  return null;
}

function parsePolylinePoints(polyline) {
  return String(polyline || '')
    .split(';')
    .map(parseLngLat)
    .filter(Boolean);
}

function vectorBetween(start, end) {
  if (!start || !end) {
    return null;
  }
  const x = end.x - start.x;
  const y = end.y - start.y;
  const length = Math.sqrt(x * x + y * y);
  if (length < 1) {
    return null;
  }
  return { x: x / length, y: y / length };
}

function inferPreferredSideForRoad(steps, roadStepIndex) {
  for (let index = roadStepIndex; index < steps.length; index += 1) {
    const step = steps[index];
    if (!normalizeTextValue(step?.road)) {
      continue;
    }
    const turnDirection = getTurnDirection(step, steps[index + 1]);
    if (turnDirection && normalizeTextValue(steps[index + 1]?.road)) {
      return turnDirection;
    }
  }
  return '';
}

function describeSideAwareTurn(currentRoad, targetRoad, currentSide, turnDirection, preferredTargetSide = '') {
  const turnText = turnDirection === 'left' ? '左手' : '右手';
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const geometryTargetSide = turnDirection === 'left' ? 'left' : 'right';
  const locationText = formatTurnLocation(currentRoad, targetRoad);
  const currentCrossingObject = formatCrossingObject(currentRoad);
  if (!currentSide) {
    if (/连接段|通道|入口/.test(normalizeTextValue(currentRoad))) {
      return {
        text: `${locationText}，${plainTurnText}进入${targetRoad}；转过去后沿${targetRoad}${roadSideText(geometryTargetSide)}走。`,
        nextSide: geometryTargetSide
      };
    }
    return {
      text: `${turnText}转弯，也就是${plainTurnText}进入${targetRoad}；转过去后先按${targetRoad}${roadSideText(geometryTargetSide)}走。当前没有锁定你在${currentRoad}哪一侧，路口先停下确认过街。`,
      nextSide: geometryTargetSide
    };
  }
  const sameSideTurn = currentSide === turnDirection;
  if (preferredTargetSide) {
    if (sameSideTurn) {
      if (preferredTargetSide === currentSide) {
        return {
          text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；转过去后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
          nextSide: preferredTargetSide
        };
      }
      return {
        text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；进入后过${targetRoad}一次，到${targetRoad}${roadSideText(preferredTargetSide)}继续走。`,
        nextSide: preferredTargetSide
      };
    }
    if (preferredTargetSide === geometryTargetSide) {
      return {
        text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先只过${currentCrossingObject}一次马路，过完后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
        nextSide: preferredTargetSide
      };
    }
    return {
      text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先过${currentCrossingObject}一次，再过${targetRoad}一次，过完后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
      nextSide: preferredTargetSide
    };
  }
  if (sameSideTurn) {
    return {
      text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；转过去后沿${targetRoad}${roadSideText(currentSide)}走。`,
      nextSide: currentSide
    };
  }
  return {
    text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先过${currentCrossingObject}一次，过完后沿${targetRoad}${roadSideText(geometryTargetSide)}走。`,
    nextSide: geometryTargetSide
  };
}

function formatTurnLocation(currentRoad, targetRoad) {
  if (!currentRoad || currentRoad === '未命名通道' || currentRoad === '未标路名连接段') {
    return `在这段未标路名连接段尽头`;
  }
  if (sameRoadName(currentRoad, targetRoad)) {
    return `在${currentRoad}前方路口`;
  }
  return `在${currentRoad}和${targetRoad}路口`;
}

function formatCrossingObject(road) {
  if (!road || road === '未命名通道' || road === '未标路名连接段') {
    return '当前连接段';
  }
  return road;
}

function describeTurnIntoUnnamedPath(currentRoad, currentSide, turnDirection, connectorTargetRoad = '') {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const connectorName = connectorTargetRoad ? `通往${connectorTargetRoad}的未标路名连接段` : '未标路名连接段';
  const sideText = turnInfo.nextSide ? `，转过去后沿${connectorName}${roadSideText(turnInfo.nextSide)}走` : '';
  if (currentRoad === '未命名通道') {
    return {
      text: `在这段未标路名的小路尽头，${turnInfo.text}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeTurnWithUnnamedContinuation(currentRoad, currentSide, turnDirection, source = 'state') {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const sideText = turnInfo.nextSide ? `，转过去后沿${currentRoad}${roadSideText(turnInfo.nextSide)}附近继续走` : '';
  if (source === 'approach') {
    return {
      text: `走到${currentRoad}附近后，${turnInfo.text}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeTurnIntoRecoveredRoad(currentRoad, recoveredRoad, currentSide, turnDirection) {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const sideText = turnInfo.nextSide ? `，转过去后沿${recoveredRoad}${roadSideText(turnInfo.nextSide)}走` : '';
  if (currentRoad === '未命名通道') {
    return {
      text: `在这段未标路名的小路尽头，${turnInfo.text}进入${recoveredRoad}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}进入${recoveredRoad}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection) {
  const turnHand = turnDirection === 'left' ? '左手' : '右手';
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const nextSide = turnDirection === 'left' ? 'left' : 'right';
  if (!currentSide || currentRoad === '未命名通道') {
    return {
      text: `${turnHand}转弯，也就是${plainTurnText}`,
      nextSide
    };
  }
  if (currentSide === turnDirection) {
    return {
      text: `${turnHand}小转弯，也就是${plainTurnText}，不用主动过${currentRoad}`,
      nextSide
    };
  }
  return {
    text: `${turnHand}大转弯，也就是${plainTurnText}：先过${currentRoad}一次，再按${plainTurnText}方向进入下一段`,
    nextSide
  };
}

function inferContinuedCurrentRoad(step, currentRoad) {
  if (!currentRoad || currentRoad === '未命名通道') {
    return '';
  }
  const inferredRoads = uniqueRoadNames(step?.inferredRoads || []);
  if (!inferredRoads.length) {
    return '';
  }
  return inferredRoads.every((road) => sameRoadName(road, currentRoad)) ? currentRoad : '';
}

function inferRecoveredTargetRoad(step, followingStep, currentRoad) {
  const nearestMainRoad = inferMainRoadByNearestDistance(step);
  const followingRoad = normalizeTextValue(followingStep?.road);
  if (nearestMainRoad && !sameRoadName(nearestMainRoad, currentRoad) && !sameRoadName(nearestMainRoad, followingRoad)) {
    return nearestMainRoad;
  }
  const inferredRoads = uniqueRoadNames(step?.inferredRoads || []);
  if (!inferredRoads.length) {
    return '';
  }
  const filtered = inferredRoads.filter((road) => !sameRoadName(road, currentRoad));
  if (filtered.length !== 1) {
    return '';
  }
  const lastRoad = filtered[filtered.length - 1] || '';
  if (!lastRoad) {
    return '';
  }
  if (sameRoadName(lastRoad, followingRoad)) {
    return '';
  }
  const followingInferredRoads = Array.isArray(followingStep?.inferredRoads) ? followingStep.inferredRoads.filter(Boolean) : [];
  const supportedByFollowing =
    sameRoadName(lastRoad, followingRoad) ||
    followingInferredRoads.some((road) => sameRoadName(road, lastRoad));
  return supportedByFollowing ? lastRoad : '';
}

function buildRoadJunctionText(currentRoad, nextRoad) {
  if (sameRoadName(currentRoad, nextRoad)) {
    return `，走到${currentRoad}前方路口`;
  }
  const simplifiedNextRoad = nextRoad.replace(/辅路$/, '');
  if (simplifiedNextRoad && simplifiedNextRoad !== nextRoad) {
    return `，到${simplifiedNextRoad}附近，也就是${currentRoad}和${nextRoad}路口`;
  }
  return `，走到${currentRoad}和${nextRoad}路口`;
}

function describeInferredRoadStep(step, routeState, nextStep = null, futureRoadName = '') {
  const rawInferredRoads = uniqueRoadNames(step.inferredRoads || []);
  const mainRoad = inferMainRoadByNearestDistance(step);
  const nextRoad = normalizeTextValue(nextStep?.road);
  const inferredRoads = routeState.currentRoad
    ? rawInferredRoads
    : rawInferredRoads.filter((road) => !sameRoadName(road, routeState.unnamedFromRoad));
  const anchors = Array.isArray(step.inferredAnchors) ? step.inferredAnchors.filter(Boolean) : [];
  const currentRoad = routeState.currentRoad || '';
  const motionText = describeRawMapMotion(step);
  if (!currentRoad && !inferredRoads.length) {
    const anchorTextOnly = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    return `接上一步转弯后，${motionText}；这一段没有写路名，路侧未锁定${anchorTextOnly}。`;
  }
  const startRoad = currentRoad || '未命名通道';
  const lastRoad = inferredRoads[inferredRoads.length - 1] || startRoad;
  if (mainRoad && !sameRoadName(mainRoad, startRoad) && !sameRoadName(mainRoad, nextRoad)) {
    const crossText = buildCrossingRoadText(step, mainRoad, lastRoad, futureRoadName);
    const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    const side = routeState.currentSide || '';
    const sideText = side ? roadSideText(side) : '';
    return `沿${mainRoad}${sideText}，${motionText}${crossText}${anchorText}，走到${mainRoad}靠近${lastRoad && !sameRoadName(lastRoad, mainRoad) ? lastRoad : '下一路口'}的位置。`;
  }
  const isMultiRoadConnector = inferredRoads.some((road) => !sameRoadName(road, startRoad));
  const sideText = routeState.currentSide ? roadSideText(routeState.currentSide) : '';
  if (isMultiRoadConnector) {
    const nearbyRoads = inferredRoads.filter((road) => !sameRoadName(road, startRoad));
    const roadChainText = nearbyRoads.length ? `；沿线接近${nearbyRoads.join('、')}` : '';
    const crossText = buildCrossingRoadText(step, startRoad, lastRoad, futureRoadName);
    const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    const endText = lastRoad && lastRoad !== startRoad ? `，走到${lastRoad}附近` : '';
    const sidePrefix = sideText ? `沿${startRoad}${sideText}` : `沿${startRoad}`;
    return `${sidePrefix}，${motionText}${crossText}${roadChainText}${anchorText}${endText}。`;
  }
  const roadPart = sideText ? `${startRoad}${sideText}` : `${startRoad}，路侧未锁定`;
  const crossText = buildCrossingRoadText(step, startRoad, lastRoad, futureRoadName);
  const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
  const endText = lastRoad && lastRoad !== startRoad ? `，到${lastRoad}附近` : '';
  return `沿${roadPart}方向走约 ${formatMeters(step.distance)}${crossText}${anchorText}${endText}。`;
}

function buildCrossingRoadText(step, currentRoad, targetRoad = '', futureRoadName = '', excludedRoads = []) {
  const roads = uniqueRoadNames(step?.inferredCrossRoads || [])
    .filter((road) => !sameRoadName(road, currentRoad))
    .filter((road) => !sameRoadName(road, targetRoad))
    .filter((road) => !sameRoadName(road, futureRoadName))
    .filter((road) => !excludedRoads.some((excluded) => sameRoadName(road, excluded)));
  if (!roads.length) {
    return '';
  }
  return `，穿过${roads.slice(0, 3).join('、')}`;
}

function findNextNamedRoad(steps, startIndex, maxLookahead = 3) {
  const end = Math.min(steps.length, startIndex + maxLookahead);
  for (let index = startIndex; index < end; index += 1) {
    const road = normalizeTextValue(steps[index]?.road);
    if (road) {
      return road;
    }
  }
  return '';
}

function getInferredCrossingRoads(inferredRoads, startRoad, lastRoad) {
  const roads = Array.isArray(inferredRoads) ? inferredRoads.filter(Boolean) : [];
  return roads
    .filter((road) => !sameRoadName(road, startRoad) && !sameRoadName(road, lastRoad))
    .filter((road, index, array) => array.findIndex((item) => sameRoadName(item, road)) === index);
}

function getLastInferredRoad(step) {
  const mainRoad = inferMainRoadByNearestDistance(step);
  if (mainRoad) {
    return mainRoad;
  }
  const inferredRoads = uniqueRoadNames(step.inferredRoads || []);
  return inferredRoads[inferredRoads.length - 1] || '';
}

function inferMainRoadByNearestDistance(step) {
  const samples = Array.isArray(step?.nearestRoadSamples) ? step.nearestRoadSamples : [];
  const valid = samples.filter((sample) =>
    sample?.road &&
    Number.isFinite(Number(sample.distance)) &&
    Number(sample.distance) <= 12
  );
  if (valid.length < 3) {
    return '';
  }
  const stats = new Map();
  for (const sample of valid) {
    const road = normalizeRoadBase(sample.road);
    if (!road) {
      continue;
    }
    const current = stats.get(road) || { road, count: 0, totalDistance: 0, lateCount: 0 };
    current.count += 1;
    current.totalDistance += Number(sample.distance);
    if (Number(sample.progress) >= 0.35) {
      current.lateCount += 1;
    }
    stats.set(road, current);
  }
  const ranked = [...stats.values()]
    .sort((a, b) => b.count - a.count || (a.totalDistance / a.count) - (b.totalDistance / b.count));
  const best = ranked[0];
  if (!best) {
    return '';
  }
  const coverage = best.count / valid.length;
  const averageDistance = best.totalDistance / best.count;
  if (coverage >= 0.55 && averageDistance <= 8 && best.lateCount >= 2) {
    return best.road;
  }
  return '';
}

function isTerminalUnnamedApproach(steps, startIndex, destinationPoi = null) {
  const remaining = steps.slice(startIndex);
  if (!remaining.length || remaining.length > 6) {
    return false;
  }
  if (!remaining.every((step) => isUnnamedConnectorEvidenceStep(step))) {
    return false;
  }
  const totalDistance = remaining.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  if (remaining.length === 1) {
    return isComplexEntranceDestinationPoi(destinationPoi) && totalDistance > 0 && totalDistance <= 300;
  }
  return isComplexEntranceDestinationPoi(destinationPoi) && totalDistance > 0 && totalDistance <= 300;
}

function isEndpointConnectorStep(steps, index, destinationPoi = null) {
  return isComplexEntranceDestinationPoi(destinationPoi)
    && isUnnamedConnectorEvidenceStep(steps?.[index]);
}

function isUnnamedConnectorEvidenceStep(step) {
  return !normalizeTextValue(step?.road)
    && !inferMainRoadByNearestDistance(step)
    && !uniqueRoadNames(step?.inferredCrossRoads || []).length;
}

function describeTerminalUnnamedApproach(currentRoad, currentSide, turnDirection, remainingSteps, destinationName, destinationPoi = null, destinationSide = '') {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const totalDistance = remainingSteps.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  if (isComplexEntranceDestinationPoi(destinationPoi) && totalDistance > 0 && totalDistance <= 300) {
    const addressRoad = extractAddressRoadName(destinationPoi?.address || '');
    const address = normalizeTextValue(destinationPoi?.address);
    const approachRoad = addressRoad || currentRoad || '当前道路';
    const destinationText = destinationName || normalizeTextValue(destinationPoi?.name) || '目的地';
    const entranceText = address ? `${address}入口附近` : `${approachRoad}入口附近`;
    const destinationSideText = destinationSide ? `终点在${approachRoad}${roadSideText(destinationSide)}；` : '';
    return `${destinationSideText}到${entranceText}，最后约 ${formatMeters(totalDistance)} 进入${destinationText}入口范围；不要把这段当作另一条道路，到门牌或小区入口标识附近后用慧眼确认。`;
  }
  const stepText = remainingSteps
    .map((step, index) => {
      const motion = describeRawMapMotion(step);
      const nextTurn = index < remainingSteps.length - 1 ? getTurnDirection(step, remainingSteps[index + 1]) : '';
      const turnAfter = nextTurn ? `后${nextTurn === 'left' ? '左转' : '右转'}` : '';
      return `${motion}${turnAfter}`;
    })
    .join('，');
  const destinationText = destinationName ? `，最后到${destinationName}附近` : '，最后到目的地附近';
  const roadText = currentRoad && currentRoad !== '未命名通道' ? `离开${currentRoad}` : '离开当前小路';
  return `在${currentRoad}这一段尽头，${turnInfo.text}，${roadText}，进入目的地入口附近的小路；后面连续约 ${formatMeters(totalDistance)} 都没有写路名，按顺序走：${stepText}${destinationText}。`;
}

function isComplexEntranceDestinationPoi(poi) {
  const text = `${normalizeTextValue(poi?.type)} ${normalizeTextValue(poi?.name)} ${normalizeTextValue(poi?.address)}`;
  return /住宅|小区|公寓|弄|地铁|站口|出入口|入口|出口|院门|园区|医院|院区|学校|校区|大学|公园|景区|风景名胜|旅游景点|旅游区|度假区|游乐场|植物园|场馆|天文馆|交通设施|机场|航站楼|火车站|客运站|港口|码头|博物馆|展览馆|会展|商场|购物中心|体育场/.test(text);
}

function uniqueRoadNames(roads) {
  const result = [];
  for (const road of Array.isArray(roads) ? roads : []) {
    const name = normalizeTextValue(road);
    if (name && !result.some((item) => sameRoadName(item, name))) {
      result.push(name);
    }
  }
  return result;
}

function describeRawMapMotion(step) {
  const orientation = normalizeTextValue(step?.orientation);
  const distanceText = formatMeters(step?.distance || 0);
  if (orientation) {
    return `向${orientation}走约 ${distanceText}`;
  }
  return `走约 ${distanceText}`;
}

function roadSideText(side) {
  return side === 'left' ? '左侧' : side === 'right' ? '右侧' : '';
}

function isArrivalStep(step) {
  const text = `${normalizeTextValue(step?.action)} ${normalizeTextValue(step?.assistantAction)} ${normalizeTextValue(step?.instruction)}`;
  return /到达/.test(text);
}

function describeFinalApproach(step, currentRoad, currentSide, destinationText) {
  const road = normalizeTextValue(step.road) || currentRoad || '当前道路';
  const side = currentSide ? roadSideText(currentSide) : '';
  const sidePart = side ? `${road}${side}` : road;
  return `沿${sidePart}最后走约 ${formatMeters(step.distance)}，${destinationText}。`;
}

function buildDestinationEvidence(destinationPoi, destinationSideEvidence = {}, finalRoadStep = null) {
  if (!destinationPoi) {
    return '';
  }
  const name = normalizeTextValue(destinationPoi.name);
  const address = normalizeTextValue(destinationPoi.address);
  const streetNumber = destinationPoi.streetNumber || extractStreetNumberFromAddress(address);
  const targetText = name ? `${name}` : '终点';
  const addressText = address || (streetNumber ? `${streetNumber}号` : '高德点位');
  const finalRoad = normalizeRoadBase(finalRoadStep?.road);
  const side = destinationSideEvidence.side || '';
  if (side && finalRoad) {
    const addressRoad = getDestinationRoadAnchor(destinationPoi);
    if (addressRoad && !sameRoadName(addressRoad, finalRoad)) {
      return `${targetText}地址是${addressText}，在${addressRoad}；大入口从${finalRoad}${roadSideText(side)}到达。`;
    }
    return `${targetText}地址是${addressText}；大入口在${finalRoad}${roadSideText(side)}。`;
  }
  return `${targetText}地址是${addressText}；大入口所在路侧未锁定，本路线判失败。`;
}

function completeDestinationSideFromArrival(evidence, routeState, finalRoadStep, steps, destinationPoi) {
  if (evidence?.side) {
    return evidence;
  }
  const currentRoad = normalizeTextValue(routeState?.currentRoad);
  const currentIsConnector = /连接段|通道|入口/.test(currentRoad);
  const side = normalizeSideValue(currentIsConnector ? routeState?.lastPublicSide : routeState?.currentSide);
  const routeRoad = normalizeTextValue(currentIsConnector ? routeState?.lastPublicRoad : routeState?.currentRoad);
  const finalRoad = normalizeTextValue(finalRoadStep?.road);
  const addressRoad = getDestinationRoadAnchor(destinationPoi);
  if (!side || !routeRoad || !finalRoad || !sameRoadName(routeRoad, finalRoad)) {
    return evidence || emptySideEvidence();
  }
  if (
    addressRoad
    && !sameRoadName(addressRoad, finalRoad)
    && !isComplexEntranceDestinationPoi(destinationPoi)
    && !isTransitStopPoi(destinationPoi)
    && !isAddressRoadApproachClosedToExplicitEntrance(steps, destinationPoi)
  ) {
    return evidence || emptySideEvidence();
  }
  const destinationLocation = getPoiNavigationCoordinate(destinationPoi);
  const routeEnd = getPolylineEndpoints(combineStepPolylines(steps || [])).end;
  const destinationPoint = parseLngLat(destinationLocation);
  const routeEndPoint = parseLngLat(routeEnd);
  if (!destinationPoint || !routeEndPoint || distanceMeters(destinationPoint, routeEndPoint) > 50) {
    return evidence || emptySideEvidence();
  }
  return {
    side,
    confidence: 'route_arrival',
    evidenceText: [`路线箭头在终点坐标闭合，并保持在${finalRoad}${roadSideText(side)}`]
  };
}

async function inferDestinationSideForRoute(facts, steps) {
  const destinationPoi = facts.destinationPoi;
  if (!destinationPoi) {
    return emptySideEvidence();
  }
  const address = normalizeTextValue(destinationPoi.address);
  const streetNumber = destinationPoi.streetNumber || extractStreetNumberFromAddress(address);
  const finalRoadStep = getFinalRoadStep(steps, destinationPoi);
  if (!finalRoadStep) {
    return emptySideEvidence();
  }
  const finalRoad = normalizeRoadBase(finalRoadStep.road);
  const addressRoad = getDestinationRoadAnchor(destinationPoi);
  if (addressRoad && finalRoad && !sameRoadName(addressRoad, finalRoad) && !isComplexEntranceDestinationPoi(destinationPoi)) {
    return emptySideEvidence();
  }
  const evidenceCacheKey = buildDestinationSideEvidenceCacheKey(destinationPoi, finalRoadStep);
  const cachedEvidence = destinationPoi.navigationSideEvidenceCache;
  if (cachedEvidence?.key === evidenceCacheKey && cachedEvidence.evidence) {
    return cachedEvidence.evidence;
  }
  const votes = [];
  addCoordinateSideVotes(votes, destinationPoi, finalRoadStep);

  if (streetNumber && !facts.disableSupplementalAmap) {
    const parity = Number(streetNumber) % 2 === 0 ? 'even' : 'odd';
    const nearbyParityEvidence = await inferNearbyParitySide(finalRoad, finalRoadStep, destinationPoi, parity);
    for (const vote of nearbyParityEvidence.votes) {
      votes.push(vote);
    }
  }

  const evidence = chooseSideFromEvidence(votes);
  if (!facts.disableSupplementalAmap) {
    destinationPoi.navigationSideEvidenceCache = {
      key: evidenceCacheKey,
      evidence
    };
  }
  return evidence;
}

function buildDestinationSideEvidenceCacheKey(destinationPoi, finalRoadStep) {
  return [
    normalizeRoadBase(finalRoadStep?.road),
    normalizeTextValue(finalRoadStep?.polyline),
    normalizeCoordinate(destinationPoi?.entrLocation),
    normalizeCoordinate(destinationPoi?.location),
    normalizeTextValue(destinationPoi?.address),
    normalizeTextValue(destinationPoi?.streetNumber)
  ].join('|');
}

function emptySideEvidence() {
  return {
    side: '',
    confidence: 'none',
    evidenceText: []
  };
}

function addCoordinateSideVotes(votes, destinationPoi, finalRoadStep) {
  const entrance = normalizeCoordinate(destinationPoi.entrLocation);
  const location = normalizeCoordinate(destinationPoi.location);
  const candidates = [
    { label: '入口坐标', location: entrance, baseWeight: 2.5 },
    { label: 'POI坐标', location, baseWeight: 2 }
  ].filter((item, index, array) => item.location && array.findIndex((candidate) => candidate.location === item.location) === index);

  for (const candidate of candidates) {
    const sideResult = pointSideRelativeToPolyline(candidate.location, finalRoadStep.polyline);
    if (!sideResult.side || sideResult.distanceMeters > 120) {
      continue;
    }
    const clearOffsetWeight = sideResult.distanceMeters >= 4 ? candidate.baseWeight : candidate.baseWeight - 1;
    if (clearOffsetWeight <= 0) {
      continue;
    }
    votes.push({
      side: sideResult.side,
      weight: clearOffsetWeight,
      text: `${candidate.label}在最后一段路的${roadSideText(sideResult.side)}`
    });
  }
}

async function inferNearbyParitySide(finalRoad, finalRoadStep, destinationPoi, targetParity) {
  const location = normalizeCoordinate(destinationPoi.entrLocation) || normalizeCoordinate(destinationPoi.location);
  const destinationNumber = Number(destinationPoi.streetNumber || extractStreetNumberFromAddress(destinationPoi.address));
  if (!location || !finalRoad || !finalRoadStep?.polyline) {
    return { votes: [] };
  }

  try {
    const pois = [];
    for (let page = 1; page <= 3; page += 1) {
      const data = await callAmap('/v3/place/around', {
        location,
        radius: '800',
        offset: '25',
        page: String(page),
        extensions: 'all'
      });
      pois.push(...(Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : []));
      if (!Array.isArray(data.pois) || data.pois.length < 25) {
        break;
      }
    }
    const anchors = [];
    const seen = new Set();
    for (const poi of pois) {
      const address = normalizeTextValue(poi.address);
      const road = extractAddressRoadName(address);
      const number = poi.streetNumber || extractStreetNumberFromAddress(address);
      const anchorLocation = normalizeCoordinate(poi.entrLocation) || normalizeCoordinate(poi.location);
      if (!number || !anchorLocation || !sameRoadName(road, finalRoad)) {
        continue;
      }
      if (destinationNumber && Number(number) === destinationNumber) {
        continue;
      }
      const sideResult = pointSideRelativeToPolyline(anchorLocation, finalRoadStep.polyline);
      if (!sideResult.side || sideResult.distanceMeters > 160) {
        continue;
      }
      const key = `${number}:${sideResult.side}:${anchorLocation}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      anchors.push({
        number: Number(number),
        parity: Number(number) % 2 === 0 ? 'even' : 'odd',
        side: sideResult.side,
        name: normalizeTextValue(poi.name)
      });
    }

    const votes = [];
    const support = { left: 0, right: 0 };
    const examples = { left: [], right: [] };
    for (const anchor of anchors) {
      const impliedTargetSide = anchor.parity === targetParity
        ? anchor.side
        : oppositeSide(anchor.side);
      if (!impliedTargetSide) {
        continue;
      }
      support[impliedTargetSide] += 1;
      if (examples[impliedTargetSide].length < 2) {
        examples[impliedTargetSide].push(`${anchor.number}号${roadSideText(anchor.side)}`);
      }
    }

    for (const side of ['left', 'right']) {
      if (support[side] > 0) {
        votes.push({
          side,
          weight: Math.min(3, support[side]),
          text: `附近同路段门牌锚点推断${roadSideText(side)}，样本：${examples[side].join('、')}`
        });
      }
    }
    return { votes };
  } catch {
    return { votes: [] };
  }
}

function chooseSideFromEvidence(votes) {
  const cleanVotes = votes.filter((vote) => vote?.side && vote.weight > 0);
  if (!cleanVotes.length) {
    return emptySideEvidence();
  }
  const scores = { left: 0, right: 0 };
  const evidenceBySide = { left: [], right: [] };
  for (const vote of cleanVotes) {
    scores[vote.side] += vote.weight;
    evidenceBySide[vote.side].push(vote.text);
  }
  const side = scores.left >= scores.right ? 'left' : 'right';
  const other = side === 'left' ? 'right' : 'left';
  if (scores[side] < 2 || scores[side] < scores[other] + 0.75) {
    return {
      side: '',
      confidence: 'conflict',
      evidenceText: [
        ...evidenceBySide.left.map((item) => `左侧证据：${item}`),
        ...evidenceBySide.right.map((item) => `右侧证据：${item}`)
      ]
    };
  }
  return {
    side,
    confidence: scores[side] >= 4 ? 'strong' : 'medium',
    evidenceText: evidenceBySide[side]
  };
}

function oppositeSide(side) {
  if (side === 'left') {
    return 'right';
  }
  if (side === 'right') {
    return 'left';
  }
  return '';
}

function getFinalRoadStep(steps, destinationPoi = null) {
  const list = Array.isArray(steps) ? steps : [];
  const lastStep = list[list.length - 1];
  if (lastStep) {
    const mainRoad = inferMainRoadByNearestDistance(lastStep);
    const explicitRoad = normalizeTextValue(lastStep.road);
    const inferredEndRoad = normalizeTextValue(lastStep.inferredEndRoad);
    const lastInferredRoad = getLastInferredRoad(lastStep);
    const consensusEndRoad = lastInferredRoad && inferredEndRoad && sameRoadName(lastInferredRoad, inferredEndRoad)
      ? lastInferredRoad
      : '';
    const supportedLastRoad = mainRoad || explicitRoad || consensusEndRoad;
    if (supportedLastRoad) {
      return { ...lastStep, road: supportedLastRoad };
    }
  }
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const step = list[index];
    const mainRoad = inferMainRoadByNearestDistance(step);
    const explicitRoad = normalizeTextValue(step?.road);
    const inferredEndRoad = normalizeTextValue(step?.inferredEndRoad);
    const lastInferredRoad = getLastInferredRoad(step);
    const consensusEndRoad = lastInferredRoad && inferredEndRoad && sameRoadName(lastInferredRoad, inferredEndRoad)
      ? lastInferredRoad
      : '';
    const road = mainRoad || explicitRoad || consensusEndRoad;
    if (road) {
      return { ...step, road };
    }
  }
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const road = normalizeTextValue(list[index]?.inferredEndRoad);
    if (road) {
      return { ...list[index], road };
    }
  }
  const destinationRoad = getDestinationRoadAnchor(destinationPoi);
  if (destinationRoad && lastStep && isArrivalStep(lastStep)) {
    return { ...lastStep, road: destinationRoad, roadEvidenceSource: 'address_fallback' };
  }
  return null;
}

function isFinalRoad(road, facts, steps) {
  const finalRoadStep = getFinalRoadStep(steps, facts.destinationPoi);
  if (!finalRoadStep) {
    return false;
  }
  return sameRoadName(road, finalRoadStep.road);
}

function isTransitExitPoi(poi) {
  const type = normalizeTextValue(poi?.type);
  const name = normalizeTextValue(poi?.name);
  return isTransitExitPoiName(name)
    || (/地铁站/.test(type) && /出入口/.test(type))
    || /站口|出入口|入口|出口/.test(name) && /地铁|车站/.test(name);
}

function isTransitStopPoi(poi) {
  return normalizeTextValue(poi?.type) === 'transit_stop';
}

function getDestinationRoadAnchor(poi) {
  return normalizeTextValue(poi?.knownAddressRoad)
    || extractAddressRoadName(poi?.address || '')
    || normalizeTextValue(poi?.nearbyRoadAnchor);
}

function isAddressRoadApproachClosedToExplicitEntrance(steps, destinationPoi) {
  const addressRoad = getDestinationRoadAnchor(destinationPoi);
  const entrance = parseLngLat(destinationPoi?.entrLocation);
  const routeEnd = parseLngLat(getPolylineEndpoints(combineStepPolylines(steps || [])).end);
  if (!addressRoad || !entrance || !routeEnd || distanceMeters(entrance, routeEnd) > 50) {
    return false;
  }
  let addressRoadStepIndex = -1;
  for (let index = 0; index < (steps || []).length; index += 1) {
    const step = steps[index];
    const stepRoad = normalizeTextValue(step?.road) || inferMainRoadByNearestDistance(step);
    if (stepRoad && sameRoadName(stepRoad, addressRoad)) {
      addressRoadStepIndex = index;
    }
  }
  if (addressRoadStepIndex < 0) {
    return false;
  }
  const addressRoadEnd = parseLngLat(getPolylineEndpoints(steps[addressRoadStepIndex]?.polyline).end);
  const remainingDistance = (steps || [])
    .slice(addressRoadStepIndex + 1)
    .reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  return Boolean(
    addressRoadEnd
    && distanceMeters(entrance, addressRoadEnd) <= 50
    && remainingDistance <= 50
  );
}

function extractAddressRoadName(address) {
  const text = normalizeTextValue(address);
  const laneAddressMatch = text.match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:路|街|大道))\s*\d{1,5}\s*弄/);
  if (laneAddressMatch) {
    return normalizeRoadBase(laneAddressMatch[1]);
  }
  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:路|街|大道|巷|弄))\s*\d{1,5}(?:[-－]\d+)?\s*号/);
  return match ? normalizeRoadBase(match[1]) : '';
}

function normalizeRoadBase(road) {
  return normalizeTextValue(road)
    .replace(/辅路$/, '')
    .replace(/主路$/, '')
    .trim();
}

function sameRoadName(left, right) {
  const a = normalizeRoadBase(left);
  const b = normalizeRoadBase(right);
  return Boolean(a && b && a === b);
}

function describeAccessibleTurn(step) {
  const actionText = `${step.action || ''} ${step.assistantAction || ''} ${step.instruction || ''}`;
  if (/左转|向左/.test(actionText)) {
    return '左手转弯';
  }
  if (/右转|向右/.test(actionText)) {
    return '右手转弯';
  }
  if (/调头|掉头/.test(actionText)) {
    return '掉头；现场必须确认是否安全，不能直接执行';
  }
  if (/到达/.test(actionText)) {
    return '接近目的地';
  }
  if (/直行|向前|继续/.test(actionText)) {
    return '继续直行';
  }
  return '继续前进';
}

function describeCrossingUncertainty(step) {
  const text = `${step.action || ''} ${step.assistantAction || ''} ${step.instruction || ''}`;
  if (/过马路|人行横道|斑马线|通过/.test(text)) {
    return '地图提示可能涉及过街；但过几次、过完后沿哪一侧继续尚未锁定，现场必须停下确认。';
  }
  return '地图这一步没有明确要求过马路；默认不要主动过马路。';
}

async function enrichWalkingStepsWithRoadAnchors(steps) {
  const enriched = [];
  let regeoCalls = 0;
  const evidenceStepCount = steps.filter((step) => (
    (!normalizeTextValue(step?.road) && Number(step?.distance || 0) >= 80)
    || Number(step?.distance || 0) >= 120
  )).length;
  const maxRegeoCalls = Math.min(42, Math.max(18, evidenceStepCount * 7));
  for (const step of steps) {
    const copy = { ...step };
    const stepRoad = normalizeTextValue(copy.road);
    const shouldRecoverRoadNames = !stepRoad && copy.distance >= 80;
    const shouldRecoverCrossRoads = copy.distance >= 120;
    if ((shouldRecoverRoadNames || shouldRecoverCrossRoads) && copy.polyline && regeoCalls < maxRegeoCalls) {
      const samples = samplePolylinePointsWithProgress(copy.polyline, 7);
      const roadNames = [];
      const crossRoadCandidates = [];
      const nearestRoadSamples = [];
      const anchors = [];
      for (const sample of samples) {
        if (regeoCalls >= maxRegeoCalls) {
          break;
        }
        regeoCalls += 1;
        try {
          const data = await callAmap('/v3/geocode/regeo', {
            location: sample.location,
            extensions: 'all',
            radius: '100'
          });
          const nearbyRoads = Array.isArray(data.regeocode?.roads) ? data.regeocode.roads : [];
          const roadName = normalizeTextValue(nearbyRoads[0]?.name);
          const roadDistance = Number(nearbyRoads[0]?.distance);
          if (roadName && Number.isFinite(roadDistance)) {
            nearbyRoads.slice(0, 5).forEach((road, rank) => {
              const nearbyRoadName = normalizeTextValue(road?.name);
              const nearbyRoadDistance = Number(road?.distance);
              if (!nearbyRoadName || !Number.isFinite(nearbyRoadDistance)) {
                return;
              }
              const nearbyRoadLocation = normalizeCoordinate(road?.location) || sample.location;
              nearestRoadSamples.push({
                road: nearbyRoadName,
                distance: nearbyRoadDistance,
                progress: sample.progress,
                location: nearbyRoadLocation,
                rank
              });
            });
          }
          const canUseRoadNameAsRouteAnchor = Number.isFinite(roadDistance) && (roadDistance <= 60 || sample.progress >= 0.85);
          if (shouldRecoverRoadNames && roadName && canUseRoadNameAsRouteAnchor && !roadNames.includes(roadName)) {
            roadNames.push(roadName);
          }
          for (const crossRoad of extractCrossRoadCandidates(data.regeocode, stepRoad || roadName)) {
            if (sample.progress > 0.08 && sample.progress < 0.92) {
              crossRoadCandidates.push({
                ...crossRoad,
                sampleProgress: sample.progress,
                sampleLocation: sample.location
              });
            }
          }
          const nearestPoi = Array.isArray(data.regeocode?.pois) ? data.regeocode.pois[0] : null;
          const poiName = sample.progress >= 0.35 ? normalizeTextValue(nearestPoi?.name) : '';
          const poiDistance = Number(nearestPoi?.distance);
          if (shouldRecoverRoadNames && poiName && Number.isFinite(poiDistance) && poiDistance <= 60 && !anchors.includes(poiName)) {
            anchors.push(poiName);
          }
        } catch {
          // Keep the raw walking step if reverse geocoding fails.
        }
      }
      copy.inferredRoads = roadNames;
      copy.inferredAnchors = anchors;
      copy.nearestRoadSamples = nearestRoadSamples;
      copy.inferredEndRoad = inferBoundaryTransitionRoad(stepRoad, nearestRoadSamples, 'end');
      copy.inferredCrossRoads = filterPhysicallyPlausibleCrossRoads(crossRoadCandidates, nearestRoadSamples, copy.polyline);
    }
    enriched.push(copy);
  }
  return enriched;
}

function filterPhysicallyPlausibleCrossRoads(crossRoadCandidates = [], nearestRoadSamples = [], polyline = '') {
  const grouped = new Map();
  for (const candidate of crossRoadCandidates) {
    const name = normalizeTextValue(candidate?.name || candidate);
    const key = normalizeRoadBase(name);
    if (!key) {
      continue;
    }
    const current = grouped.get(key) || { road: name, candidates: [] };
    current.candidates.push({
      ...candidate,
      name
    });
    grouped.set(key, current);
  }
  return [...grouped.values()].filter(({ road, candidates }) => {
    const sameRoadSamples = nearestRoadSamples.filter((sample) => sameRoadName(sample.road, road));
    if (hasParallelRoadEvidence(sameRoadSamples)) {
      return false;
    }
    if (hasBoundaryOnlyRoadEvidence(sameRoadSamples)) {
      return false;
    }
    const candidateDistances = candidates.map((candidate) => Number(candidate.distance)).filter(Number.isFinite);
    const nearestCandidateDistance = candidateDistances.length ? Math.min(...candidateDistances) : Infinity;
    const projections = candidates
      .map((candidate) => projectCoordinateToPolyline(candidate.location, polyline))
      .filter((projection) => projection && Number.isFinite(projection.distanceMeters));
    const nearestProjection = projections.sort((a, b) => a.distanceMeters - b.distanceMeters)[0] || null;
    const nearestProjectionDistance = nearestProjection?.distanceMeters ?? Infinity;
    if (Number.isFinite(nearestCandidateDistance) && nearestCandidateDistance > 70) {
      return false;
    }
    if (Number.isFinite(nearestProjectionDistance) && nearestProjectionDistance > 35) {
      return false;
    }
    if (
      nearestProjection &&
      (nearestProjection.progress <= 0.08 || nearestProjection.progress >= 0.92)
    ) {
      return false;
    }
    if (!sameRoadSamples.length) {
      return true;
    }
    const nearestDistance = Math.min(...sameRoadSamples.map((sample) => Number(sample.distance)).filter(Number.isFinite));
    if (!Number.isFinite(nearestDistance)) {
      return true;
    }
    return nearestDistance <= 35 || nearestCandidateDistance <= 35 || nearestProjectionDistance <= 25;
  }).map(({ road }) => road);
}

function inferBoundaryTransitionRoad(currentRoad, nearestRoadSamples = [], boundary = 'end') {
  const candidates = nearestRoadSamples
    .map((sample) => ({
      road: normalizeTextValue(sample?.road),
      distance: Number(sample?.distance),
      progress: Number(sample?.progress),
      rank: Number(sample?.rank)
    }))
    .filter((sample) => sample.road && !sameRoadName(sample.road, currentRoad))
    .filter((sample) => Number.isFinite(sample.distance) && sample.distance <= 25)
    .filter((sample) => Number.isFinite(sample.progress))
    .filter((sample) => boundary === 'start' ? sample.progress <= 0.08 : sample.progress >= 0.92)
    .sort((left, right) => left.distance - right.distance || left.rank - right.rank);
  return candidates[0]?.road || '';
}

function hasBoundaryOnlyRoadEvidence(sameRoadSamples = []) {
  const closeSamples = sameRoadSamples
    .map((sample) => ({
      distance: Number(sample?.distance),
      progress: Number(sample?.progress)
    }))
    .filter((sample) => Number.isFinite(sample.distance) && sample.distance <= 25)
    .filter((sample) => Number.isFinite(sample.progress));
  if (!closeSamples.length) {
    return false;
  }
  const hasInteriorEvidence = closeSamples.some((sample) => sample.progress > 0.08 && sample.progress < 0.92);
  const hasBoundaryEvidence = closeSamples.some((sample) => sample.progress <= 0.08 || sample.progress >= 0.92);
  return hasBoundaryEvidence && !hasInteriorEvidence;
}

function hasParallelRoadEvidence(sameRoadSamples = []) {
  const valid = sameRoadSamples
    .map((sample) => ({
      distance: Number(sample.distance),
      progress: Number(sample.progress)
    }))
    .filter((sample) => Number.isFinite(sample.distance) && Number.isFinite(sample.progress));
  if (valid.length < 2) {
    return false;
  }
  const closeCount = valid.filter((sample) => sample.distance <= 25).length;
  if (closeCount > 0) {
    return false;
  }
  const farSamples = valid.filter((sample) => sample.distance >= 45);
  if (farSamples.length < 2) {
    return false;
  }
  const progresses = farSamples.map((sample) => sample.progress);
  return Math.max(...progresses) - Math.min(...progresses) >= 0.2;
}

function extractCrossRoadCandidates(regeocode, currentRoad) {
  const result = [];
  const intersections = Array.isArray(regeocode?.roadinters) ? regeocode.roadinters : [];
  for (const item of intersections) {
    const distance = Number(item.distance ?? item.dist ?? 9999);
    const location = normalizeCoordinate(item.location);
    if (Number.isFinite(distance) && distance > 70 && !location) {
      continue;
    }
    const names = [
      item.first_name,
      item.second_name,
      item.first_road_name,
      item.second_road_name,
      item.name
    ].map(normalizeTextValue).filter(Boolean);
    for (const name of names) {
      if (!sameRoadName(name, currentRoad) && !result.some((candidate) => sameRoadName(candidate.name, name))) {
        result.push({
          name,
          distance,
          location,
          direction: normalizeTextValue(item.direction)
        });
      }
    }
  }
  return result;
}

function samplePolylinePoints(polyline, maxCount) {
  return samplePolylinePointsWithProgress(polyline, maxCount).map((sample) => sample.location);
}

function samplePolylinePointsWithProgress(polyline, maxCount) {
  const points = String(polyline || '')
    .split(';')
    .map((item) => normalizeCoordinate(item))
    .filter(Boolean);
  if (!points.length) {
    return [];
  }
  if (points.length <= maxCount) {
    const denominator = Math.max(1, points.length - 1);
    return points.map((location, index) => ({
      location,
      progress: index / denominator
    }));
  }
  const count = Math.max(2, Number(maxCount || 3));
  const indexes = Array.from({ length: count }, (_, index) => Math.round(index * (points.length - 1) / (count - 1)));
  const uniqueIndexes = [...new Set(indexes)].filter((index) => points[index]);
  return uniqueIndexes.map((index) => ({
    location: points[index],
    progress: index / (points.length - 1)
  }));
}

function pointSideRelativeToPolyline(point, polyline) {
  const target = parseLngLat(point);
  const points = String(polyline || '')
    .split(';')
    .map(parseLngLat)
    .filter(Boolean);
  if (!target || points.length < 2) {
    return { side: '', distanceMeters: Infinity };
  }

  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const projection = projectPointOnSegment(target, start, end);
    if (!best || projection.distanceMeters < best.distanceMeters) {
      const cross = (end.x - start.x) * (target.y - start.y) - (end.y - start.y) * (target.x - start.x);
      best = {
        side: cross > 0 ? 'left' : cross < 0 ? 'right' : '',
        distanceMeters: projection.distanceMeters
      };
    }
  }
  return best || { side: '', distanceMeters: Infinity };
}

function projectCoordinateToPolyline(point, polyline) {
  const target = parseLngLat(point);
  const points = String(polyline || '')
    .split(';')
    .map(parseLngLat)
    .filter(Boolean);
  if (!target || points.length < 2) {
    return null;
  }
  const segmentLengths = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distanceMeters(points[index], points[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }
  let traveled = 0;
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const projection = projectPointOnSegment(target, points[index], points[index + 1]);
    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = {
        distanceMeters: projection.distanceMeters,
        segmentIndex: index,
        progress: totalLength > 0 ? (traveled + segmentLengths[index] * projection.t) / totalLength : 0
      };
    }
    traveled += segmentLengths[index];
  }
  return best;
}

function parseLngLat(value) {
  const coordinate = normalizeCoordinate(value);
  if (!coordinate) {
    return null;
  }
  const [lngText, latText] = coordinate.split(',');
  const lng = Number(lngText);
  const lat = Number(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  const scale = Math.cos(lat * Math.PI / 180);
  return {
    lng,
    lat,
    x: lng * 111320 * scale,
    y: lat * 110540
  };
}

function projectPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      distanceMeters: distanceMeters(point, start)
    };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };
  return {
    distanceMeters: distanceMeters(point, projected),
    t
  };
}

function distanceMeters(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function sumStepDistance(steps) {
  return steps.reduce((sum, step) => sum + Number(step.distance || 0), 0);
}

function buildBaseFacts(mode, request, extra) {
  return {
    provider: 'amap',
    mode,
    generatedAt: new Date().toISOString(),
    coordinateSystem: '高德 Web 服务默认使用 GCJ-02 坐标；浏览器定位可能不是同一坐标系，精确路侧测试前需要校准。',
    origin: request.origin,
    destination: request.destination,
    originPoi: request.originPoi || null,
    destinationPoi: request.destinationPoi || null,
    city: request.city,
    destinationCity: request.destinationCity || request.city,
    navigationRules: {
      doNotGuess: true,
      keepPoiPointAndRoadTouchPointSeparate: true,
      keepStopNameAndCurbsideStopPointSeparate: true,
      ifMapAndCameraConflictSayConflict: true,
      doNotGiveUnverifiedCrossingInstruction: true
    },
    ...extra
  };
}

function simplifyPoi(poi) {
  const address = normalizeTextValue(poi.address);
  const streetNumber = extractStreetNumberFromAddress(address);
  return {
    id: poi.id || '',
    name: poi.name || '',
    type: poi.type || '',
    address,
    streetNumber,
    streetNumberParity: streetNumber ? (Number(streetNumber) % 2 === 0 ? 'even' : 'odd') : '',
    location: poi.location || '',
    adname: poi.adname || '',
    cityname: poi.cityname || '',
    pname: poi.pname || '',
    entrLocation: normalizeTextValue(poi.entr_location),
    exitLocation: normalizeTextValue(poi.exit_location),
    tel: normalizeTextValue(poi.tel)
  };
}

function extractStreetNumberFromAddress(address) {
  const text = normalizeTextValue(address);
  if (!text) {
    return '';
  }
  const candidates = [...text.matchAll(/(\d{1,5})(?:[-－]\d+)?\s*号(?!线|口|楼|室|房)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (!candidates.length) {
    return '';
  }
  return String(candidates[0]);
}

function simplifyStop(stop) {
  if (!stop) {
    return {};
  }
  return {
    id: stop.id || '',
    name: stop.name || '',
    location: stop.location || ''
  };
}

function simplifyWalkingStep(step) {
  const road = step.road || '';
  const distance = step.distance || '';
  return {
    instruction: step.instruction || '',
    road,
    distance: Number(distance || 0),
    orientation: step.orientation || '',
    action: step.action || '',
    assistantAction: step.assistant_action || '',
    polyline: step.polyline || '',
    fallback: road ? `沿 ${road} 走约 ${formatMeters(distance)}` : `继续步行约 ${formatMeters(distance)}`
  };
}

function formatVisionSpeech(parsed) {
  const parts = [];
  if (parsed.seen !== undefined) {
    parts.push(`看到情况：${parsed.seen}`);
  }
  if (parsed.target_type) {
    parts.push(`目标类型：${parsed.target_type}`);
  }
  if (parsed.direction) {
    parts.push(`方向：${parsed.direction}`);
  }
  if (parsed.action) {
    parts.push(`下一步：${parsed.action}`);
  }
  if (parsed.reason) {
    parts.push(`依据：${parsed.reason}`);
  }
  return parts.join('。');
}

function tryParseJsonObject(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCoordinate(value) {
  const text = String(value || '').trim();
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return '';
  }
  return `${match[1]},${match[2]}`;
}

function normalizeTextValue(value) {
  if (Array.isArray(value)) {
    return value.join('、');
  }
  if (value === undefined || value === null || value === '[]') {
    return '';
  }
  return String(value);
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function formatMeters(value) {
  const meters = Number(value || 0);
  if (!Number.isFinite(meters) || meters <= 0) {
    return '0 米';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} 公里`;
  }
  return `${Math.round(meters)} 米`;
}

function formatDuration(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '时间未知';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `约 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `约 ${hours} 小时 ${rest} 分钟`;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw httpError(405, '只支持 GET。');
  }

  const publicRoot = path.resolve(PUBLIC_DIR);
  const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
  const filePath = path.resolve(publicRoot, relativePath);

  if (!filePath.startsWith(publicRoot)) {
    throw httpError(403, '拒绝访问。');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw httpError(404, '文件不存在。');
  }

  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': 'no-store'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  }[ext] || 'application/octet-stream';
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, '请求内容太大。');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, '请求 JSON 格式不正确。');
  }
}

async function readTextBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, '请求内容太大。');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readRawBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, '请求内容太大。');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

class SerialQueue {
  constructor(minIntervalMs) {
    this.minIntervalMs = Math.max(0, Number(minIntervalMs || 0));
    this.lastRunAt = 0;
    this.tail = Promise.resolve();
  }

  run(task) {
    const next = this.tail.then(async () => {
      const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - this.lastRunAt));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      try {
        return await task();
      } finally {
        this.lastRunAt = Date.now();
      }
    });
    this.tail = next.catch(() => {});
    return next;
  }
}

amapQueue = new SerialQueue(AMAP_MIN_INTERVAL_MS);
