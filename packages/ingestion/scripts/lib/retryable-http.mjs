const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

// Delay bounded retries without imposing a wait on deterministic tests.
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry transient transport/status failures for reads or explicitly idempotent writes, including response-body resets.
export async function fetchTextWithRetry(url, init, {
  label, fetchImpl = fetch, sleep = wait, log = console.warn, maxAttempts = 3, timeoutMs = 20000,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let failure;
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        error.status = response.status;
        throw error;
      }
      return text;
    } catch (error) {
      const code = error?.cause?.code ?? error?.code;
      const retryable = controller.signal.aborted || RETRY_NETWORK_CODES.has(code) || RETRY_STATUS_CODES.has(error?.status);
      failure = new Error(`${label} failed on attempt ${attempt}/${maxAttempts}: ${controller.signal.aborted ? "request timed out" : code ?? error.message}`, { cause: error });
      if (!retryable || attempt === maxAttempts) throw failure;
    } finally {
      clearTimeout(timer);
    }
    log(`${failure.message}; retrying.`);
    await sleep(attempt * 1000);
  }
}
