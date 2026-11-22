/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Page } from 'puppeteer-core'
import { TwitterLoginAddon } from './twitter-login'

/** Minimal page that records polling without visiting the login flow. */
class PollingPage {
  closed = false
  checks = 0

  /** @returns Whether this tab has closed */
  isClosed() {
    return this.closed
  }

  /** @returns A URL outside the login flow */
  url() {
    this.checks++
    return 'about:blank'
  }
}

describe('TwitterLoginAddon polling ownership', () => {
  it('stops one tab without interrupting other tabs or later registrations', async (context) => {
    const addon = new TwitterLoginAddon({})
    const tabs = [new PollingPage(), new PollingPage(), new PollingPage()]
    const pages = tabs.map((tab) => tab as unknown as Page)
    const errors = context.mock.method(console, 'error', () => undefined)
    context.after(async () => {
      await Promise.all(pages.map((page) => addon.unregister(page)))
    })

    addon.register(pages[0])
    addon.register(pages[1])
    await context.waitFor(
      () => {
        assert.ok(tabs[0].checks > 0)
        assert.ok(tabs[1].checks > 0)
      },
      { timeout: 5000 }
    )

    tabs[0].closed = true
    await addon.unregister(pages[0])
    const closedChecks = tabs[0].checks
    const otherChecks = tabs[1].checks
    addon.register(pages[2])
    await context.waitFor(
      () => {
        assert.ok(tabs[1].checks > otherChecks)
        assert.ok(tabs[2].checks > 0)
      },
      { timeout: 5000 }
    )

    assert.equal(tabs[0].checks, closedChecks)
    await Promise.all(pages.map((page) => addon.unregister(page)))
    assert.equal(errors.mock.callCount(), 0)
  })

  it('registers each page once and allows a fresh registration after cancellation', async (context) => {
    const addon = new TwitterLoginAddon({})
    const page = new PollingPage() as unknown as Page
    const checker = context.mock.method(addon, 'checkerPageChanged')
    const errors = context.mock.method(console, 'error', () => undefined)
    context.after(() => addon.unregister(page))

    addon.register(page)
    addon.register(page)
    assert.equal(checker.mock.callCount(), 1)
    const firstSignal = checker.mock.calls[0].arguments[1]
    await Promise.all([addon.unregister(page), addon.unregister(page)])
    assert.equal(firstSignal.aborted, true)

    addon.register(page)
    assert.equal(checker.mock.callCount(), 2)
    const secondSignal = checker.mock.calls[1].arguments[1]
    assert.notEqual(secondSignal, firstSignal)
    assert.equal(secondSignal.aborted, false)
    await addon.unregister(page)
    assert.equal(secondSignal.aborted, true)
    assert.equal(errors.mock.callCount(), 0)
  })

  it('ignores closed pages and unregistration of unknown pages', async (context) => {
    const addon = new TwitterLoginAddon({})
    const tab = new PollingPage()
    tab.closed = true
    const page = tab as unknown as Page
    const checker = context.mock.method(addon, 'checkerPageChanged')

    addon.register(page)
    await addon.unregister(page)
    assert.equal(checker.mock.callCount(), 0)
  })
})
