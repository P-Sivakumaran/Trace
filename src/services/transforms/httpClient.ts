export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  ok: boolean;
  data: T;
  text: string;
}

/**
 * Universal HTTP requester supporting Electron IPC (bypassing CORS) and browser fetch with graceful fallbacks.
 */
export async function requestHttp<T = any>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const method = options.method || 'GET';
  const headers = options.headers || {};

  // Check if running in Electron with IPC proxy support
  if (typeof window !== 'undefined' && window.electronAPI?.sendApiRequest) {
    try {
      const resp = await window.electronAPI.sendApiRequest({
        url,
        method,
        headers,
        body: options.body,
      });

      const status = typeof resp.status === 'number' ? resp.status : 200;
      const ok = (status >= 200 && status < 300) || status === 304;
      let text = '';
      if (typeof resp.data === 'string') {
        text = resp.data;
      } else if (resp.data !== undefined) {
        text = JSON.stringify(resp.data);
      }

      return {
        status,
        statusText: resp.statusText || (ok ? 'OK' : 'Error'),
        ok,
        data: (resp.data as T) ?? (text as unknown as T),
        text,
      };
    } catch (err: any) {
      console.warn('Electron IPC request failed, attempting browser fetch fallback:', err);
    }
  }

  // Browser fetch fallback with AbortController timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: options.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON, keep as text
    }

    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      data: data as T,
      text,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Network request failed: ${err.message || String(err)}`);
  }
}
