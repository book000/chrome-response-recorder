// node:test's describe / it return Promises, but the test runner manages them, so they need no await
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseTargetUrlRegexes } from './target-url-regexes'

describe('parseTargetUrlRegexes', () => {
  it('returns no patterns when unset or empty', () => {
    assert.deepEqual(parseTargetUrlRegexes(undefined), [])
    assert.deepEqual(parseTargetUrlRegexes(''), [])
  })

  it('splits on commas and newlines and trims each entry', () => {
    const regexes = parseTargetUrlRegexes(
      ' ^https://a\\.example/ ,\n^https://b\\.example/ '
    )
    assert.deepEqual(
      regexes.map((regex) => regex.source),
      ['^https:\\/\\/a\\.example\\/', '^https:\\/\\/b\\.example\\/']
    )
  })

  it('ignores blank entries from a trailing newline or doubled separators', () => {
    const regexes = parseTargetUrlRegexes('https://allowed.example/\n,, \n')
    assert.equal(regexes.length, 1)
    assert.equal(
      regexes.some((regex) => regex.test('https://unrelated.example/private')),
      false
    )
  })

  it('returns no patterns when every entry is blank', () => {
    assert.deepEqual(parseTargetUrlRegexes(' \n,\n'), [])
  })

  it('throws a configuration error naming the malformed pattern', () => {
    assert.throws(
      () => parseTargetUrlRegexes('https://ok\\.example/,(unclosed'),
      {
        message:
          'Invalid TARGET_URL_REGEXS pattern "(unclosed": Invalid regular expression: /(unclosed/: Unterminated group',
      }
    )
  })
})
