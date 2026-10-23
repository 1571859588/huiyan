'use strict';

const webSearch = require('../public/live-web-search');
function lowerSchema(value) {
  if (Array.isArray(value)) return value.map(lowerSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'behavior')
    .map(([key, item]) => [key, key === 'type' && typeof item === 'string' ? item.toLowerCase() : lowerSchema(item)]));
}
function declaration() {
  const tool = webSearch.declaration();
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: lowerSchema(tool.parameters) } };
}
async function executeSearch(search, args, signal, timeoutMs = 20000) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  let timer, onAbort;
  try {
    if (!query || query.length > 500) throw new Error('搜索问题为空或过长，请重新提炼关键词');
    if (signal?.aborted) throw new Error('搜索已取消');
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('联网搜索超时，可继续当前对话')), timeoutMs);
      onAbort = () => reject(new Error('搜索已取消'));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    const result = await Promise.race([Promise.resolve().then(() => search({ query, signal })), expiry]);
    return { ok: true, query, results: Array.isArray(result.results) ? result.results : [],
      fetchedAt: result.fetchedAt || null, summary: result.searchSummary || '',
      evidenceType: 'web_search_snippets_not_live_observation_or_full_pages' };
  } catch (error) { return { ok: false, query, results: [], error: error.message }; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

// The experiment proxy owns only search calls. Existing reminder outputs still
// travel through the browser's established acceptance/lifecycle path.
function createRealtimeSearchBridge(options) {
  const searches = new Map(), external = new Set(), seen = new Set(), completed = new Set();
  let active = false, requested = false, queued = null, closed = false;
  let hadSearch = false, hadExternal = false, cancelled = false;
  const send = event => { if (!closed) options.send(JSON.stringify(event)); };
  function flush() {
    if (closed || active || requested || searches.size || external.size || !queued) return;
    const event = queued; queued = null; requested = true; send(event);
  }
  function cancelSearches() {
    for (const [id, operation] of searches) {
      operation.abort();
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: id,
        output: JSON.stringify({ ok: false, results: [], error: '本轮搜索已取消' }) } });
    }
    searches.clear(); queued = null; cancelled = true;
  }
  function client(raw) {
    let event; try { event = JSON.parse(raw); } catch (_) { options.send(raw); return; }
    if (event.type === 'session.update') {
      const session = event.session || (event.session = {});
      if (!session.tools?.some(tool => (tool.function?.name || tool.name) === webSearch.TOOL_NAME))
        session.tools = [...(session.tools || []), declaration()];
      session.enable_search = false;
      if (!String(session.instructions || '').includes(webSearch.INSTRUCTION))
        session.instructions = (session.instructions || '') + '\n' + webSearch.INSTRUCTION;
    } else if (event.type === 'response.create') {
      queued = event; flush(); return;
    } else if (event.type === 'response.cancel') cancelSearches();
    else if (event.type === 'conversation.item.create' && event.item?.type === 'function_call_output')
      external.delete(event.item.call_id);
    send(event);
  }
  function upstream(raw) {
    let event; try { event = JSON.parse(raw); } catch (_) { return true; }
    if (event.type === 'response.created') {
      active = true; requested = false; hadSearch = false; hadExternal = false; cancelled = false;
    } else if (event.type === 'response.function_call_arguments.done') {
      if (event.name !== webSearch.TOOL_NAME) { external.add(event.call_id); hadExternal = true; return true; }
      hadSearch = true;
      if (seen.has(event.call_id)) return false;
      seen.add(event.call_id);
      const controller = new AbortController(); searches.set(event.call_id, controller);
      let args; try { args = JSON.parse(event.arguments || '{}'); } catch (_) { args = {}; }
      options.log?.('ali_realtime_search_started', { callId: event.call_id, query: args.query || '' });
      void executeSearch(options.search, args, controller.signal, options.timeoutMs).then(result => {
        if (closed || searches.get(event.call_id) !== controller) return;
        searches.delete(event.call_id);
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(result) } });
        options.log?.('ali_realtime_search_completed', { callId: event.call_id, ok: result.ok, results: result.results.length });
        if (!cancelled) queued ||= { type: 'response.create' };
        flush();
      });
      return false;
    } else if (event.type === 'response.done') {
      if (event.response?.id && completed.has(event.response.id)) return false;
      if (event.response?.id) completed.add(event.response.id);
      active = false; requested = false;
      if (event.response?.status === 'failed') { cancelSearches(); return true; }
      const suppress = hadSearch && !hadExternal && !cancelled && event.response?.status !== 'failed' && event.response?.status !== 'cancelled';
      if (suppress) queued ||= { type: 'response.create' };
      flush(); return !suppress;
    }
    return true;
  }
  function close() { if (!closed) { cancelSearches(); closed = true; external.clear(); } }
  return { client, upstream, close };
}
module.exports = { createRealtimeSearchBridge, executeSearch, declaration, instruction: webSearch.INSTRUCTION };
