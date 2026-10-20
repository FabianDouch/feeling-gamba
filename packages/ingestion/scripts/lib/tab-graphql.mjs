const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

// Pause between bounded attempts; injectable so tests never need real delays.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read market GraphQL safely: invalid bodies are failures, never empty market lists.
export async function fetchTabGraphql(source, operationName, query, variables, headers, {
  fetchImpl = fetch, sleep = wait, log = console.warn, maxAttempts = 3, timeoutMs = 20000,
} = {}) {
  const label = `${source.label ?? source.source} ${operationName}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let failure;
    let retryable = false;
    let diagnostic = 'no HTTP response';
    try {
      const response = await fetchImpl(source.endpoint, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ operationName, query, variables }),
      });
      diagnostic = `HTTP ${response.status}; content-type=${response.headers.get('content-type') ?? 'missing'}; content-length=${response.headers.get('content-length') ?? 'unknown'}; server=${response.headers.get('server') ?? 'unknown'}`;
      const text = await response.text();
      diagnostic += `; body-bytes=${Buffer.byteLength(text)}`;
      if (!response.ok) {
        retryable = RETRY_STATUSES.has(response.status);
        throw new Error('source rejected request');
      }
      if (!text.trim()) {
        retryable = true;
        throw new Error('empty response body');
      }
      let payload;
      try { payload = JSON.parse(text); } catch {
        retryable = true;
        throw new Error('invalid JSON response');
      }
      if (payload?.errors?.length) throw new Error(`GraphQL errors: ${payload.errors.map((error) => error.message).join('; ')}`);
      if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('missing GraphQL data object');
      }
      return payload;
    } catch (error) {
      const code = error?.cause?.code ?? error?.code;
      retryable ||= controller.signal.aborted || NETWORK_CODES.has(code);
      failure = new Error(`${label} attempt ${attempt}/${maxAttempts}: ${controller.signal.aborted ? 'request timed out' : error.message} (${diagnostic})`, { cause: error });
      if (!retryable || attempt === maxAttempts) throw failure;
    } finally {
      clearTimeout(timer);
    }
    log(`${failure.message}; retrying.`);
    await sleep(attempt * 1000);
  }
}
