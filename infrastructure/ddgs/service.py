"""Private, key-free DDGS search bridge for the existing search JSON contract."""

import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from ddgs import DDGS
from ddgs.engines.yahoo import Yahoo
from ddgs.results import TextResult


BACKENDS = ('yahoo', 'brave', 'google')
SEARCH_BUDGET_SECONDS = 9
SEARCH_SLOTS = threading.BoundedSemaphore(2)
logging.getLogger('ddgs').setLevel(logging.ERROR)


class CompatibleYahoo(Yahoo):
    """Keep DDGS extraction, with support for Yahoo's other result layout."""

    def request(self, *args, **kwargs):
        response = self.http_client.request(*args, **kwargs)
        if response.status_code != 200:
            raise RuntimeError('Yahoo HTTP ' + str(response.status_code))
        return response.text

    def extract_results(self, html_text):
        original = super().extract_results(html_text)
        if self.post_extract_results(original):
            self.result_layout = 'relsrch'
            return original
        tree = self.extract_tree(html_text)
        # Match the complete class token, not algo-favicon or unrelated widgets.
        blocks = tree.xpath("//*[contains(concat(' ', normalize-space(@class), ' '), ' algo ')]")
        results = []
        for block in blocks:
            anchors = block.xpath('.//h3//a[@href]')
            if not anchors:
                continue
            anchor = anchors[0]
            title = anchor.get('aria-label')
            if not title:
                title = ' '.join(anchor.xpath(
                    ".//text()[not(ancestor::span[contains(concat(' ', normalize-space(@class), ' '), ' title-url ')])]"
                ))
            snippets = block.xpath(
                ".//*[contains(concat(' ', normalize-space(@class), ' '), ' compText ')]"
            )
            body = ''.join(snippets[0].itertext()) if snippets else ''
            results.append(TextResult(title=title, href=anchor.get('href', ''), body=body))
        self.result_layout = 'algo' if results else 'unrecognized_or_empty'
        return results


def search_backend(query, backend, timeout):
    proxy_options = {'proxy': os.environ['TEACHING_SEARCH_PROXY_URL']} if os.environ.get('TEACHING_SEARCH_PROXY_URL') else {}
    if backend == 'yahoo':
        engine = CompatibleYahoo(timeout=timeout, **proxy_options)
        found = engine.search(query, region='cn-zh') or []
        candidates = [vars(item) for item in found]
        layout = getattr(engine, 'result_layout', 'no_response')
    else:
        with DDGS(timeout=timeout, **proxy_options) as engine:
            candidates = engine.text(query, region='cn-zh', backend=backend, max_results=8)
        layout = 'ddgs'
    unique = {}
    for item in candidates or []:
        address = str(item.get('href', ''))
        parsed = urlsplit(address)
        if parsed.scheme in ('http', 'https') and parsed.netloc and item.get('title'):
            unique.setdefault(address, item)
    return list(unique.values())[:8], layout


def search_query(query, requester=search_backend, clock=time.monotonic):
    began = clock()
    attempts = []
    # One extra Yahoo request only after a failed/empty first request. A working
    # response returns immediately; there is no unbounded retry or auto mix.
    for backend in (BACKENDS[0], *BACKENDS):
        remaining = SEARCH_BUDGET_SECONDS - (clock() - began)
        if remaining <= 0:
            break
        attempt = {'backend': backend}
        try:
            candidates, layout = requester(query, backend, min(3, remaining))
            attempt.update({'count': len(candidates), 'layout': layout})
            attempts.append(attempt)
            if candidates:
                return candidates, backend, attempts
        except Exception as error:
            attempt.update({'count': 0, 'error': str(error)[:180]})
            attempts.append(attempt)
    failures = [item['backend'] + ': ' + item.get('error', 'No parsed results') for item in attempts]
    raise RuntimeError('; '.join(failures) or 'Search time budget exhausted')


class SearchHandler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/health':
            return self.reply(200, {'ok': True, 'adapter': 'ddgs'})
        if parsed.path != '/search':
            return self.reply(404, {'error': 'Not found'})
        query = parse_qs(parsed.query).get('q', [''])[0].strip()
        if not query or len(query) > 2000:
            return self.reply(400, {'error': 'Search query is empty or too long'})
        if not SEARCH_SLOTS.acquire(blocking=False):
            return self.reply(429, {'error': 'Search workers are busy; current conversation may continue'})
        began = time.monotonic()
        try:
            candidates, backend, attempts = search_query(query)
            results = [
                {'title': str(item.get('title', '')), 'url': str(item.get('href', '')),
                 'content': str(item.get('body', '')), 'engines': ['ddgs:' + backend]}
                for item in candidates
            ]
            self.reply(200, {'adapter': 'ddgs', 'results': results, 'unresponsive_engines': []})
            print(json.dumps({'adapter': 'ddgs', 'backend': backend, 'count': len(results), 'attempts': attempts,
                              'ms': round((time.monotonic() - began) * 1000)}), flush=True)
        except Exception as error:
            # A failed engine is a transport failure, never an empty success.
            message = str(error)[:500]
            self.reply(503, {'adapter': 'ddgs', 'results': [], 'error': message})
            print(json.dumps({'adapter': 'ddgs', 'error': message, 'ms': round((time.monotonic() - began) * 1000)}), flush=True)
        finally:
            SEARCH_SLOTS.release()

    def log_message(self, *_args):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('TEACHING_DDGS_PORT', '8798'))), SearchHandler).serve_forever()
