/* eslint-disable @typescript-eslint/no-floating-promises */
// Puppeteer exposes EventEmitter-style page, browser and CDP APIs.
/* eslint-disable unicorn/prefer-event-target */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers/promises'
import { before, describe, it, TestContext } from 'node:test'
import puppeteer, { Browser, Page, TargetType } from 'puppeteer-core'
import { ExportCookieAddon } from './addon/export-cookie'

/** Browser page with observable listener and navigation state. */
class TestPage extends EventEmitter {
  closed = false
  navigations: string[] = []
  consoleGate: Promise<void> | undefined
  consoleFailure: 'session' | 'enable' | undefined
  client = new EventEmitter()
  consoleStarts = 0

  /** @returns A fixed URL for operational logging */
  url() {
    return 'https://example.com/'
  }

  /** @returns Whether the tab has closed */
  isClosed() {
    return this.closed
  }

  /** Emits the browser page close event. */
  close() {
    this.closed = true
    this.emit('close')
  }

  /** Records navigation attempts. */
  goto(url: string) {
    assert.equal(this.closed, false)
    this.navigations.push(url)
    return Promise.resolve(undefined)
  }

  /** Sets up console protocol events, optionally delaying or failing setup. */
  async createCDPSession() {
    this.consoleStarts++
    await this.consoleGate
    if (this.consoleFailure === 'session') {
      throw new Error('Session creation failed')
    }
    return Object.assign(this.client, {
      send: () => {
        return this.consoleFailure === 'enable'
          ? Promise.reject(new Error('Runtime enable failed'))
          : Promise.resolve(undefined)
      },
    })
  }
}

/** Browser that emits targetcreated from newPage like Puppeteer. */
class TestBrowser extends EventEmitter {
  tabs = [new TestPage(), new TestPage(), new TestPage()]
  opened = 1

  /** @returns Pages that currently exist */
  pages() {
    return Promise.resolve(this.tabs.slice(0, this.opened))
  }

  /** Opens a page and emits its target before resolving. */
  newPage() {
    const page = this.tabs[this.opened++]
    this.announce(page)
    return Promise.resolve(page)
  }

  /** Emits a page target, including repeated notifications for race tests. */
  announce(page: TestPage) {
    this.emit('targetcreated', {
      type: () => TargetType.PAGE,
      url: () => page.url(),
      page: () => Promise.resolve(page),
    })
  }
}

let main: typeof import('./main').main

before(async () => {
  const environment = { ...process.env }
  Object.assign(process.env, {
    STARTUP_URLS: 'https://example.com/first,https://example.com/second',
    ACTIVE_ADDONS: 'ExportCookie',
    EXPORT_COOKIE_FILE_PATH: '/unused/cookies.json',
    CONSOLE_LOG_DIR: '/unused/console',
    VNC_USER_DATA_DIR: '/unused/profile',
    TARGET_URL_REGEXS: '',
    RESTART_INTERVAL_SECONDS: '0',
  })
  try {
    ;({ main } = await import('./main'))
  } finally {
    process.env = environment
  }
})

/** Mocks external browser launch and addon I/O while running the real main. */
function setup(context: TestContext) {
  const browser = new TestBrowser()
  const registrations = new Map<Page, number>()
  const signalListeners = new Map(
    (['SIGINT', 'SIGTERM'] as const).map((signal) => [
      signal,
      new Set(process.listeners(signal)),
    ])
  )
  context.after(() => {
    for (const [signal, existing] of signalListeners) {
      for (const listener of process.listeners(signal)) {
        if (!existing.has(listener)) {
          process.off(signal, listener)
        }
      }
    }
  })
  context.mock.method(console, 'log', () => undefined)
  context.mock.method(console, 'warn', () => undefined)
  const errors = context.mock.method(console, 'error', () => undefined)
  context.mock.method(puppeteer, 'launch', () =>
    Promise.resolve(browser as unknown as Browser)
  )
  const register = context.mock.method(
    ExportCookieAddon.prototype,
    'register',
    (page: Page) => {
      registrations.set(page, (registrations.get(page) ?? 0) + 1)
      return Promise.resolve(undefined)
    }
  )
  const unregister = context.mock.method(
    ExportCookieAddon.prototype,
    'unregister',
    () => undefined
  )
  return { browser, registrations, register, unregister, errors }
}

/** Asserts all page and console listeners have been removed. */
function assertClean(page: TestPage) {
  for (const event of [
    'response',
    'close',
    'console',
    'pageerror',
    'requestfailed',
  ]) {
    assert.equal(page.listenerCount(event), 0, event)
  }
  assert.equal(page.client.listenerCount('Runtime.consoleAPICalled'), 0)
}

describe('page initialization through main', () => {
  for (const pending of ['console', 'addon'] as const) {
    it(`initializes startup tabs once and waits for pending ${pending} setup before navigation`, async (context) => {
      const { browser, register, registrations, errors } = setup(context)
      const additionalPage = browser.tabs[1]
      const consoleReady = Promise.withResolvers<undefined>()
      const addonReady = Promise.withResolvers<undefined>()
      additionalPage.consoleGate = consoleReady.promise
      register.mock.mockImplementation(async (page: Page) => {
        registrations.set(page, (registrations.get(page) ?? 0) + 1)
        if (page === (additionalPage as unknown as Page)) {
          await addonReady.promise
        }
      })

      const running = main()
      await context.waitFor(() => {
        assert.equal(additionalPage.consoleStarts, 1)
      })
      assert.deepEqual(additionalPage.navigations, [])
      const firstReady = pending === 'console' ? addonReady : consoleReady
      const lastReady = pending === 'console' ? consoleReady : addonReady
      firstReady.resolve(undefined)
      await setImmediate()
      assert.deepEqual(additionalPage.navigations, [])
      lastReady.resolve(undefined)
      await running

      browser.announce(additionalPage)
      await setImmediate()
      for (const page of browser.tabs.slice(0, 2)) {
        assert.equal(page.listenerCount('response'), 1)
        assert.equal(page.listenerCount('close'), 1)
        assert.equal(page.listenerCount('console'), 1)
        assert.equal(page.client.listenerCount('Runtime.consoleAPICalled'), 1)
        assert.equal(page.consoleStarts, 1)
        assert.equal(registrations.get(page as unknown as Page), 1)
      }
      assert.deepEqual(browser.tabs[0].navigations, [
        'https://example.com/first',
      ])
      assert.deepEqual(additionalPage.navigations, [
        'https://example.com/second',
      ])
      assert.equal(errors.mock.callCount(), 0)
    })
  }

  it('initializes later tabs and cleans up each page and addon once on close', async (context) => {
    const { browser, unregister, registrations } = setup(context)
    await main()
    const popup = await browser.newPage()
    await context.waitFor(() => {
      assert.equal(popup.client.listenerCount('Runtime.consoleAPICalled'), 1)
    })
    await setImmediate()
    for (const page of browser.tabs) {
      assert.equal(page.listenerCount('response'), 1)
      assert.equal(registrations.get(page as unknown as Page), 1)
      page.close()
      page.emit('close')
    }
    await context.waitFor(() => {
      assert.equal(unregister.mock.callCount(), 3)
    })
    for (const page of browser.tabs) {
      assertClean(page)
    }
  })

  it('cleans up resources when a page closes during initialization', async (context) => {
    const { browser, unregister } = setup(context)
    const ready = Promise.withResolvers<undefined>()
    const page = browser.tabs[1]
    page.consoleGate = ready.promise
    const running = main()
    await context.waitFor(() => {
      assert.equal(page.consoleStarts, 1)
    })
    page.close()
    ready.resolve(undefined)
    await running
    await context.waitFor(() => {
      assert.equal(unregister.mock.callCount(), 1)
    })
    assertClean(page)
    browser.announce(page)
    await setImmediate()
    assertClean(page)
    assert.equal(page.consoleStarts, 1)
  })

  for (const failure of ['session', 'enable'] as const) {
    it(`keeps recording and addons working after console ${failure} failure and cleans up partial listeners`, async (context) => {
      const { browser, registrations, unregister, errors } = setup(context)
      const page = browser.tabs[1]
      page.consoleFailure = failure
      await main()
      assert.equal(page.listenerCount('response'), 1)
      assert.equal(registrations.get(page as unknown as Page), 1)
      assert.deepEqual(page.navigations, ['https://example.com/second'])
      assert.equal(errors.mock.callCount(), 1)
      page.close()
      await context.waitFor(() => {
        assert.equal(unregister.mock.callCount(), 1)
      })
      assertClean(page)
    })
  }
})
