// node:test's describe / it return Promises, but the test runner manages them, so they need no await
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { redactUrl } from './redact-url'

describe('redactUrl', () => {
  it('redacts userinfo, sensitive query values and sensitive fragment values', () => {
    assert.equal(
      redactUrl('https://u:p@example.com/a?token=abc&q=1#access_token=x&y=2'),
      'https://REDACTED:REDACTED@example.com/a?token=REDACTED&q=1#access_token=REDACTED&y=2'
    )
  })

  it('matches sensitive keys case-insensitively', () => {
    assert.equal(
      redactUrl('https://example.com/?ApiKey=1&SIGNATURE=2&Session_Id=3'),
      'https://example.com/?ApiKey=REDACTED&SIGNATURE=REDACTED&Session_Id=REDACTED'
    )
  })

  it('keeps non-sensitive keys, duplicate keys and their order', () => {
    assert.equal(
      redactUrl('https://example.com/p?a=1&token=x&a=2&token=y&b=3'),
      'https://example.com/p?a=1&token=REDACTED&a=2&token=REDACTED&b=3'
    )
  })

  it('leaves a URL without credentials unchanged', () => {
    assert.equal(
      redactUrl('https://example.com:8443/a/b?page=2'),
      'https://example.com:8443/a/b?page=2'
    )
  })

  it('leaves a fragment without key-value pairs as is', () => {
    assert.equal(
      redactUrl('https://example.com/doc#section'),
      'https://example.com/doc#section'
    )
  })

  it('returns a fixed placeholder for unparseable input', () => {
    assert.equal(redactUrl(''), '[unparseable URL]')
    assert.equal(redactUrl('not a url'), '[unparseable URL]')
  })
})
