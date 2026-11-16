/**
 * Parses the TARGET_URL_REGEXS setting into regular expressions.
 * Blank entries are dropped because an empty pattern matches every URL.
 * @param value - Comma- or newline-separated patterns; may be unset
 * @returns Compiled patterns; empty when no pattern is configured
 * @throws Error naming the offending pattern when one is not a valid regular expression
 */
export function parseTargetUrlRegexes(value = ''): RegExp[] {
  return value
    .split(/[,\n]/)
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern !== '')
    .map((pattern) => {
      try {
        return new RegExp(pattern)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Invalid TARGET_URL_REGEXS pattern "${pattern}": ${reason}`
        )
      }
    })
}
