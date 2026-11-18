/**
 * fetch for the Supabase client that never crashes the app (2026-10-26).
 *
 * React Native's built-in fetch (whatwg-fetch 3.6.20) builds `new Response(…)`
 * inside a setTimeout when a request ends. When the connection drops and the
 * request ends with status 0, that throws "RangeError: Failed to construct
 * 'Response': The status provided (0) is outside the range [200, 599]" where
 * no code can catch it — the app shows a red error and the call never finishes.
 *
 * This version makes the same request with XMLHttpRequest and turns any status
 * outside 200–599 into a normal network error (TypeError, like fetch does),
 * which the Supabase client returns as `{ error }` and our code already handles.
 */

function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  raw.replace(/\r?\n[\t ]+/g, ' ').split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) {
      try { headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); } catch { /* skip a bad header */ }
    }
  });
  return headers;
}

/** React Native has no DOMException: an Error named AbortError, as fetch callers expect */
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });

export function safeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // Outside the phone (Node: the recommendations test tool) there is no XMLHttpRequest — use the normal fetch
  if (typeof XMLHttpRequest === 'undefined') return fetch(input as any, init);
  return new Promise<Response>((resolve, reject) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();
    const signal = init.signal ?? undefined;
    if (signal?.aborted) { reject(abortError()); return; }

    const xhr = new XMLHttpRequest();
    const fail = (msg: string) => () => setTimeout(() => reject(new TypeError(msg)), 0);
    xhr.onload = () => {
      const status = xhr.status;
      if (status < 200 || status > 599) { fail('Network request failed')(); return; }
      const body = status === 204 || status === 205 || status === 304 ? null : xhr.responseText;
      setTimeout(() => {
        try {
          resolve(new Response(body, { status, statusText: xhr.statusText, headers: parseHeaders(xhr.getAllResponseHeaders() || '') }));
        } catch (e) {
          reject(new TypeError(`Network request failed (${String(e)})`));
        }
      }, 0);
    };
    xhr.onerror = fail('Network request failed');
    xhr.ontimeout = fail('Network request timed out');
    xhr.onabort = () => setTimeout(() => reject(abortError()), 0);

    xhr.open(method, url, true);
    new Headers(init.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined))
      .forEach((value, name) => xhr.setRequestHeader(name, value));
    if (signal) {
      const onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort);
      xhr.onloadend = () => signal.removeEventListener('abort', onAbort);
    }
    xhr.send((init.body as any) ?? null);
  });
}
