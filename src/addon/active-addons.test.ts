/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createActiveAddons } from './active-addons'

const options = {
  twitterLogin: {},
  exportCookieFilePath: undefined,
}

describe('createActiveAddons', () => {
  it('does not require an export path when no addons are enabled', () => {
    assert.deepEqual(createActiveAddons([], options), [])
  })

  it('does not require an export path when only TwitterLogin is enabled', () => {
    const addons = createActiveAddons(['TwitterLogin'], options)

    assert.deepEqual(
      addons.map((addon) => addon.name),
      ['TwitterLogin']
    )
  })

  it('ignores unknown and empty addon names', () => {
    assert.deepEqual(
      createActiveAddons(['Twitter', '', 'unknown'], options),
      []
    )
  })

  it('requires an output path when ExportCookie is enabled', () => {
    for (const exportCookieFilePath of [undefined, '']) {
      assert.throws(
        () =>
          createActiveAddons(['ExportCookie'], {
            ...options,
            exportCookieFilePath,
          }),
        { message: 'cookieFilePath is required for ExportCookieAddon' }
      )
    }
  })

  it('validates ExportCookie even with mixed case and surrounding whitespace', () => {
    assert.throws(() => createActiveAddons([' eXpOrTcOoKiE '], options), {
      message: 'cookieFilePath is required for ExportCookieAddon',
    })
  })

  it('constructs enabled addons once in registration order', () => {
    const addons = createActiveAddons(
      [' ExportCookie ', 'TWITTERLOGIN', 'exportcookie'],
      { ...options, exportCookieFilePath: '/unused/cookies.json' }
    )

    assert.deepEqual(
      addons.map((addon) => addon.name),
      ['TwitterLogin', 'ExportCookie']
    )
  })
})
