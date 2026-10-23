'use strict';

const { createHash } = require('node:crypto');

// Engines return real URLs; Google may select among those candidates. A failed
// engine or selection response cannot become a course gate or paid Aliyun retry.
function createSelfHostedTeachingSearch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.searxngUrl || process.env.TEACHING_SEARXNG_URL || '';
  const fallbackEndpoint = options.fallbackEndpoint ?? process.env.TEACHING_SEARCH_FALLBACK_ENDPOINT ?? '';
  const engines = String(options.engines || process.env.TEACHING_SEARXNG_ENGINES || 'baidu,duckduckgo')
    .split(',').map(engine => engine.trim()).filter(engine => engine && engine !== '360search').join(',') || 'baidu';
  const timeoutMs = Number(options.searchTimeoutMs || 12000);
  const cacheMs = Number(options.cacheMs || 300000);
  const resultLimit = Math.min(12, Math.max(1, Number(options.resultLimit || 3)));
  const cache = new Map();
  const pending = new Map();
  const selectSources = null;

  async function requestJson(url, init = {}, budgetMs = timeoutMs) {
    const controller = new AbortController();
    let timer;
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('搜索请求超时'));
      }, budgetMs);
    });
    try {
      return await Promise.race([expiry, (async () => {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error(`搜索请求失败：${response.status}`);
        return response.json();
      })()]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function search(input) {
    const fetchedAt = new Date().toISOString();
    const candidates = new Map();
    const unavailableEngines = new Set();
    const searchAdapters = new Set();
    const failures = [];
    let searchCallCount = 0;
    for (const query of input.queries) {
      if (!endpoint) break;
      const url = new URL('search', endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
      url.search = new URLSearchParams({ q: query, format: 'json', language: 'zh-CN', engines }).toString();
      searchCallCount += 1;
      try {
        const data = await requestJson(url.toString());
        searchAdapters.add(data.adapter || 'searxng');
        for (const failure of data.unresponsive_engines || []) unavailableEngines.add(String(failure[0]));
        for (const result of Array.isArray(data.results) ? data.results : []) {
          let storageRef;
          try {
            const sourceUrl = new URL(result.url);
            if (!['https:', 'http:'].includes(sourceUrl.protocol)) continue;
            storageRef = sourceUrl.toString();
          } catch { continue; }
          if (candidates.has(storageRef)) continue;
          candidates.set(storageRef, {
            sourceAssetId: `network-search:${createHash('sha256').update(storageRef).digest('hex').slice(0, 20)}`,
            type: /\.pdf(?:$|[?#])/i.test(storageRef) ? 'pdf' : 'text', title: String(result.title || new URL(storageRef).hostname).slice(0, 300),
            storageRef, sourcePurpose: 'supplemental', authority: 'other_network', specificity: 'general',
            goalRelation: 'supplemental', confidence: 'unknown', officialityVerified: false,
            officialityBasis: 'unverified', officialDomain: null, publisher: null,
            officialityEvidence: '搜索摘要不是官方身份或网页全文核验。',
            notes: [
              { text: String(result.content || '').slice(0, 2000), origin: 'source' },
              { text: `搜索引擎：${(result.engines || [result.engine || 'unknown']).join('、')}；取得时间：${fetchedAt}；尚未读取网页全文。`, origin: 'system' }
            ]
          });
        }
      } catch (error) { failures.push(error.message); }
      if (candidates.size >= 3) break;
    }
    if (candidates.size === 0 && fallbackEndpoint && input._skipSearchFallback !== true) {
      try {
        const fallback = await requestJson(fallbackEndpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, _skipSearchFallback: true })
        }, Number(options.fallbackTimeoutMs || 180000));
        if (fallback.provider === 'searxng' && Array.isArray(fallback.sourceAssets) && fallback.sourceAssets.length) {
          return { ...fallback, fallbackUsed: true, searchCallCount: searchCallCount + (fallback.searchCallCount || 0) };
        }
      } catch (error) { failures.push(error.message); }
    }
    let sourceAssets = [...candidates.values()].slice(0, resultLimit);
    let selectionProvider = null;
    let selectionModel = null;
    if (sourceAssets.length && selectSources) {
      try {
        const selected = await selectSources(input, [...candidates.values()].slice(0, 12));
        if (selected.sourceAssets.length) {
          sourceAssets = selected.sourceAssets;
          selectionProvider = 'google';
          selectionModel = selected.model;
        }
        else failures.push('模型未选出有效候选，保留实际搜索结果继续备课。');
      } catch (error) { failures.push(`资料筛选暂未完成，保留搜索结果：${error.message}`); }
    }
    return {
      provider: 'searxng', model: selectionModel, selectionProvider, sourceAssets, searchCallCount,
      fetchedAt, cacheHit: false, unavailableEngines: [...unavailableEngines],
      searchAdapters: [...searchAdapters],
      searchSummary: candidates.size
        ? '已取得实际搜索网址及摘要，网页全文由原素材流程继续读取。'
        : '本次未取得搜索资料，未调用付费搜索；可按原通用知识备课流程继续。',
      ...(failures.length ? { searchWarnings: failures } : {})
    };
  }

  return async function searchWithCache(input) {
    const key = JSON.stringify([input.goal, input.queries, input.identityContext, input.primaryExpertProfileId, input._skipSearchFallback === true]);
    const entry = cache.get(key);
    if (entry && Date.now() - entry.at < cacheMs) return { ...structuredClone(entry.result), cacheHit: true, searchCallCount: 0 };
    if (pending.has(key)) return structuredClone(await pending.get(key));
    const operation = search(input);
    pending.set(key, operation);
    try {
      const result = await operation;
      if (result.sourceAssets.length) {
        cache.delete(key);
        cache.set(key, { at: Date.now(), result: structuredClone(result) });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
      }
      return result;
    } finally { pending.delete(key); }
  };
}

module.exports = { createSelfHostedTeachingSearch };
