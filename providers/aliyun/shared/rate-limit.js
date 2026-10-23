function createSearchRateLimiter(options = {}) {
  const windowMs = Math.max(60000, Number(options.windowMs || 600000));
  const maxRequests = Math.max(1, Number(options.maxRequests || (process.env.TEACHING_SEARCH_PROVIDER === 'searxng' ? 60 : 6)));
  const entries = new Map();
  return function beginSearchRequest(req) {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const key = forwarded || String(req?.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    let entry = entries.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0, active: false };
      entries.set(key, entry);
    }
    if (entry.active || entry.count >= maxRequests) {
      throw Object.assign(new Error('网页搜索请求过于频繁，请稍后再试'), { statusCode: 429 });
    }
    entry.count += 1;
    entry.active = true;
    return () => { entry.active = false; };
  };
}


module.exports = { createSearchRateLimiter };
