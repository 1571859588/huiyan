'use strict';

const { createSelfHostedTeachingSearch } = require('./selfhosted-search');

function createHuiyanWebSearchService(options = {}) {
  const teachingFallback = options.teachingFallbackEndpoint ?? process.env.TEACHING_SEARCH_FALLBACK_ENDPOINT;
  const fallbackEndpoint = options.fallbackEndpoint ?? (teachingFallback
    ? new URL('/api/web-search', teachingFallback).toString()
    : '');
  const search = createSelfHostedTeachingSearch({
    ...options, sourceSelectionEnabled: false, fallbackEndpoint, resultLimit: 8,
    fallbackTimeoutMs: options.fallbackTimeoutMs || 13000
  });

  return async function searchWeb(input = {}) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query || query.length > 500) {
      throw Object.assign(new Error('搜索问题需为1至500字的文本'), { statusCode: 400 });
    }
    // The Live model interprets the results itself. No course profile, planner,
    // paid search or extra model is involved in this read-only request.
    const result = await search({ query, goal: query, queries: [query], _skipSearchFallback: input._skipSearchFallback === true });
    return {
      ...result, query,
      results: result.sourceAssets.map((source) => ({
        title: source.title, url: source.storageRef,
        snippet: source.notes.filter((note) => note.origin === 'source').map((note) => note.text).join('\n')
      })),
      searchSummary: result.sourceAssets.length
        ? '已取得网页搜索摘要和网址，尚未读取网页全文。'
        : '本次未取得网页资料，可自行简化关键词或换种表述再查，也可如实说明并继续问答。'
    };
  };
}

module.exports = { createHuiyanWebSearchService };
