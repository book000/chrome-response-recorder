const REDACTED = 'REDACTED'

/** Keys whose values are treated as credentials; deliberately broad because the result is only logged. */
const SENSITIVE_KEY_PATTERN =
  /token|secret|pass|pwd|auth|key|sig|session|credential|cookie|code/i

/**
 * Replaces the values of sensitive keys in a `key=value&...` string.
 * @param pairs - Query string or fragment body without the leading `?` / `#`
 * @returns The re-serialized pairs, with duplicate keys and order preserved
 */
function redactPairs(pairs: string): string {
  const original = new URLSearchParams(pairs)
  const redacted = new URLSearchParams()
  for (const [key, value] of original) {
    redacted.append(key, SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value)
  }
  return redacted.toString()
}

/**
 * Makes a URL safe to write to operational logs.
 * Userinfo, sensitive query values and sensitive fragment values become `REDACTED`;
 * scheme, host, port and path are kept. The output may differ from the input in percent-encoding.
 * @param url - URL to redact
 * @returns The redacted URL, or `[unparseable URL]` when the input is not a valid URL (the input is never echoed)
 */
export function redactUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return '[unparseable URL]'
  }

  if (parsed.username || parsed.password) {
    parsed.username = REDACTED
    parsed.password = REDACTED
  }
  if (parsed.search) {
    parsed.search = redactPairs(parsed.search.slice(1))
  }
  if (parsed.hash.includes('=')) {
    parsed.hash = redactPairs(parsed.hash.slice(1))
  }
  return parsed.href
}
