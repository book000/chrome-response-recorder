import puppeteer, {
  Page,
  TargetType,
  HTTPResponse,
  Target,
  Browser,
} from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { BaseAddon } from './addon'
import { TwitterLoginAddon } from './addon/twitter-login'
import { ConsoleLogging } from './console-logging'
import { ExportCookieAddon } from './addon/export-cookie'
import { createResponseDirectory } from './response-directory'

/** Settings read from environment variables. */
const ENVIRONMENT = {
  /** Screen size as `{width}x{height}`. */
  VNC_SCREEN_SIZE: process.env.VNC_SCREEN_SIZE ?? '1024x768',
  /** Path to the Chromium executable. */
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
  /** Browser user data directory (profile). */
  USER_DATA_DIR: process.env.VNC_USER_DATA_DIR ?? '/userdata',
  /** Browser User-Agent string. */
  BROWSER_USER_AGENT:
    process.env.BROWSER_USER_AGENT ??
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
  /** Regular expressions (comma- or newline-separated) for URLs whose responses are recorded. When empty, nothing is recorded. */
  TARGET_URL_REGEXS: process.env.TARGET_URL_REGEXS
    ? process.env.TARGET_URL_REGEXS.split(/[,\n]/).map(
        (regex) => new RegExp(regex.trim())
      )
    : [],
  /** Comma-separated URLs to open at startup. */
  STARTUP_URLS: process.env.STARTUP_URLS ?? '',
  /** Interval in seconds after which the process shuts down so that supervisord restarts it. 0 disables it. */
  RESTART_INTERVAL_SECONDS: Number(process.env.RESTART_INTERVAL_SECONDS) || 0,
  /** Viewport width in pixels. Defaults to the width of VNC_SCREEN_SIZE. */
  VIEWPORT_WIDTH: process.env.VIEWPORT_WIDTH
    ? Number(process.env.VIEWPORT_WIDTH)
    : null,
  /** Viewport height in pixels. Defaults to the height of VNC_SCREEN_SIZE. */
  VIEWPORT_HEIGHT: process.env.VIEWPORT_HEIGHT
    ? Number(process.env.VIEWPORT_HEIGHT)
    : null,
  /** Comma-separated names of the addons to enable (case-insensitive). */
  ACTIVE_ADDONS: process.env.ACTIVE_ADDONS
    ? process.env.ACTIVE_ADDONS.split(',').map((addon) => addon.trim())
    : [],
  /** Twitter username (TwitterLogin addon). */
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  /** Twitter password (TwitterLogin addon). */
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  /** Twitter email address, used when the login flow asks for it (TwitterLogin addon). */
  TWITTER_EMAIL_ADDRESS: process.env.TWITTER_EMAIL_ADDRESS,
  /** Twitter OTP secret, used when the login flow asks for a code (TwitterLogin addon). */
  TWITTER_OTP_SECRET: process.env.TWITTER_OTP_SECRET,
  /** File path the ExportCookie addon writes cookies to. */
  EXPORT_COOKIE_FILE_PATH: process.env.EXPORT_COOKIE_FILE_PATH,
  /** Whether to open DevTools automatically for each tab. */
  IS_OPEN_DEV_TOOLS: process.env.OPEN_DEVTOOLS === 'true',
  /** Output directory for browser console logs. When unset, console logging is skipped. */
  CONSOLE_LOG_DIR: process.env.CONSOLE_LOG_DIR,
} as const

// Per-page cleanup functions, keyed weakly so closed pages can be garbage collected
const pageEventListeners = new WeakMap<Page, Set<() => void | Promise<void>>>()

function appendPageCleanup(
  page: Page,
  ...cleanup: (() => void | Promise<void>)[]
) {
  const existing = pageEventListeners.get(page)
  if (existing) {
    for (const cleanupFunction of cleanup) {
      existing.add(cleanupFunction)
    }
    return
  }

  pageEventListeners.set(page, new Set(cleanup))
}

/**
 * Saves the response to `/responses` when its URL matches TARGET_URL_REGEXS. Preflight (OPTIONS) requests are ignored.
 * @param response - HTTP response received from Puppeteer
 */
async function responseHandler(response: HTTPResponse) {
  const url = response.url()
  const status = response.status()
  const statusText = response.statusText()
  const method = response.request().method()

  const isTargetUrl = ENVIRONMENT.TARGET_URL_REGEXS.some((regex) =>
    regex.test(url)
  )
  if (!isTargetUrl) {
    return
  }

  // Ignore CORS preflight requests
  if (response.request().method() === 'OPTIONS') {
    console.log(`Ignoring preflight request: ${url}`)
    return
  }

  console.log(
    `Response received: ${method} ${url} - Status: ${status} ${statusText}`
  )

  // Layout: /responses/{domain}/{path}/{method}/{timestamp}/
  // e.g. /responses/example.com/api/v1/users/GET/1700000000000/
  // Responses for the same domain, path and method within the same millisecond get a numeric suffix (see createResponseDirectory)
  const urlObj = new URL(url)
  const domain = urlObj.hostname
  const pathname = urlObj.pathname.replace(/^\//, '') // strip the leading slash
  const path = pathname || '__root__' // use '__root__' for an empty path
  const timestamp = Date.now()

  const directory = createResponseDirectory(
    `/responses/${domain}/${path}/${method}`,
    timestamp
  )

  const detailFilePath = `${directory}detail.json`
  const dataFilePath = `${directory}data.raw`

  const postData = await response.request().fetchPostData()

  const responseData = {
    url,
    status,
    statusText,
    headers: response.headers(),
    timing: response.timing(),
    request: {
      method,
      headers: response.request().headers(),
      postData,
    },
  }

  // detail.json: response metadata
  try {
    fs.writeFileSync(
      detailFilePath,
      JSON.stringify(responseData, null, 2),
      'utf8'
    )
  } catch (error) {
    console.error('Error writing detail file:', error)
    return
  }

  // data.raw: response body
  try {
    const buffer = await response.buffer()

    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(dataFilePath)
      let isSettled = false

      // Settle the promise exactly once (error, finish, close and timeout can all fire)
      const cleanup = (error?: Error) => {
        if (isSettled) {
          return
        }

        isSettled = true

        if (error) {
          writeStream.destroy()
          reject(error)
        } else {
          resolve()
        }
      }

      // Give up if the write does not finish within 30 seconds
      const timeout = setTimeout(() => {
        console.error(`Timeout writing response data: ${dataFilePath}`)
        cleanup(new Error('Write stream timeout'))
      }, 30_000)

      writeStream.on('error', (error) => {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error))
        console.error('Error writing response data:', normalizedError)
        clearTimeout(timeout)
        cleanup(normalizedError)
      })

      writeStream.on('finish', () => {
        console.log(`Response data saved to: ${dataFilePath}`)
        clearTimeout(timeout)
        cleanup()
      })

      writeStream.on('close', () => {
        clearTimeout(timeout)
        cleanup()
      })

      writeStream.end(buffer)
    })
  } catch (error) {
    console.error('Error saving response data:', error)
  }
}

/**
 * `response` event listener. Runs responseHandler and logs any error instead of letting it propagate.
 * @param response - HTTP response
 */
function responseEventHandler(response: HTTPResponse) {
  // Page.on expects a void listener, so the async work is started without awaiting it
  ;(async () => {
    try {
      await responseHandler(response)
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error))
      console.error('Unhandled error in response handler:', normalizedError)
    }
  })()
}

/**
 * Creates the `close` listener that detaches the page's response and close listeners.
 * @param page - Target page
 * @param responseListener - Response listener to detach
 * @returns The close listener
 */
function createCloseHandler(
  page: Page,
  responseListener: (response: HTTPResponse) => void
) {
  return function closeHandler() {
    page.off('response', responseListener)
    page.off('close', closeHandler)
    pageEventListeners.delete(page)
    console.log(`Cleaned up event listeners for page: ${page.url()}`)
  }
}

/**
 * Registers the response listener on a page and schedules its removal when the page closes or is cleaned up.
 * @param page - Page to monitor
 */
function registerResponseListener(page: Page) {
  page.on('response', responseEventHandler)

  const closeHandler = createCloseHandler(page, responseEventHandler)

  page.on('close', closeHandler)

  appendPageCleanup(page, () => {
    page.off('response', responseEventHandler)
    page.off('close', closeHandler)
  })
}

/**
 * Registers addons on a page and schedules their unregistration. A failing addon is logged and skipped.
 *
 * @param addons - Addons to register
 * @param page - Target page
 */
async function registerAddons(addons: BaseAddon[], page: Page) {
  for (const addon of addons) {
    try {
      console.log(`Registering addon: ${addon.name}`)
      await addon.register(page)
      console.log(`Addon ${addon.name} registered successfully.`)
      appendPageCleanup(page, async () => {
        try {
          const result = addon.unregister(page)
          if (result instanceof Promise) {
            await result
          }
        } catch (error) {
          console.error(`Error unregistering addon ${addon.name}:`, error)
        }
      })
    } catch (error) {
      console.error(`Error registering addon ${addon.name}:`, error)
    }
  }
}

/**
 * Runs and clears all cleanup functions registered for a page.
 * @param page - Page to clean up
 */
async function cleanupPage(page: Page) {
  const cleanupFunctions = pageEventListeners.get(page)
  if (!cleanupFunctions) {
    return
  }

  const pendingCleanup: Promise<void>[] = []
  for (const cleanup of cleanupFunctions) {
    try {
      const result = cleanup()
      if (result instanceof Promise) {
        pendingCleanup.push(
          (async () => {
            try {
              await result
            } catch (error) {
              console.error('Error during page cleanup:', error)
            }
          })()
        )
      }
    } catch (error) {
      console.error('Error during page cleanup:', error)
    }
  }
  pageEventListeners.delete(page)
  if (pendingCleanup.length > 0) {
    await Promise.all(pendingCleanup)
  }
}

/**
 * Releases resources (restart timer, page and browser listeners, browser) and then throws,
 * which ends the process. Also used for the periodic restart, where supervisord starts the process again.
 * @param signal - Name of the signal or reason that triggered the shutdown
 * @param browser - Browser instance
 * @param restartIntervalId - ID of the restart timer
 * @param browserEventListeners - Functions that detach the browser-level listeners
 * @throws Always throws `Process terminated by {signal}` after cleanup
 */
async function gracefulShutdown(
  signal: string,
  browser: Browser,
  restartIntervalId: NodeJS.Timeout | null,
  browserEventListeners: (() => void)[]
) {
  console.log(`${signal} received. Shutting down gracefully...`)

  if (restartIntervalId) {
    clearInterval(restartIntervalId)
  }

  try {
    const pages = await browser.pages()
    for (const page of pages) {
      await cleanupPage(page)
    }
  } catch (error) {
    console.error('Error cleaning up pages:', error)
  }

  for (const cleanup of browserEventListeners) {
    cleanup()
  }

  try {
    await browser.close()
    console.log('Browser closed successfully.')
  } catch (error) {
    console.error('Error closing browser:', error)
  }

  throw new Error(`Process terminated by ${signal}`)
}

/**
 * Creates the `targetcreated` listener that sets up response recording, console logging and addons for each new tab.
 * @param addons - Addons to register on the new page
 * @returns The `targetcreated` listener
 */
function createTargetCreatedHandler(addons: BaseAddon[]) {
  return (target: Target) => {
    console.log(`New target created: ${target.url()}`)
    // Only page targets (tabs)
    if (target.type() !== TargetType.PAGE) {
      return
    }
    // targetcreated expects a void listener, so the async work is started without awaiting it
    ;(async () => {
      try {
        const page = await target.page()
        if (!page) {
          return
        }

        console.log(`New page opened: ${page.url()}`)
        registerResponseListener(page)
        const consoleLogging = new ConsoleLogging(
          page,
          ENVIRONMENT.CONSOLE_LOG_DIR
        )
        // Console logging and addon registration run concurrently
        ;(async () => {
          try {
            await consoleLogging.start()
            console.log(`Console logging started for page: ${page.url()}`)
            appendPageCleanup(page, ...consoleLogging.getListeners())
          } catch (error) {
            console.error('Error starting console logging:', error)
          }
        })()
        ;(async () => {
          try {
            await registerAddons(addons, page)
            console.log(`Addons registered for page: ${page.url()}`)
          } catch (error) {
            console.error('Error registering addons:', error)
          }
        })()
      } catch (error) {
        console.error('Error getting page:', error)
      }
    })()
  }
}

/**
 * Creates the `disconnected` listener that shuts the process down when the browser goes away.
 * @param browser - Browser instance
 * @param restartIntervalId - ID of the restart timer
 * @param browserEventListeners - Functions that detach the browser-level listeners
 * @returns The `disconnected` listener
 */
function createDisconnectedHandler(
  browser: Browser,
  restartIntervalId: NodeJS.Timeout | null,
  browserEventListeners: (() => void)[]
) {
  return () => {
    console.log('Browser disconnected. Exiting process...')
    // disconnected expects a void listener, so the async work is started without awaiting it
    ;(async () => {
      try {
        await gracefulShutdown(
          'BROWSER_DISCONNECTED',
          browser,
          restartIntervalId,
          browserEventListeners
        )
      } catch (error) {
        console.error('Error during disconnection shutdown:', error)
        throw error
      }
    })()
  }
}

/**
 * Sets `exit_type` to `normal` in Chrome's Preferences file so that the "restore pages" prompt
 * does not appear after the browser was killed. Does nothing if the file does not exist.
 */
function setPreferenceExitType() {
  const preferencesPath = path.join(
    ENVIRONMENT.USER_DATA_DIR,
    'Default',
    'Preferences'
  )
  if (!fs.existsSync(preferencesPath)) {
    console.warn(`Preferences file not found: ${preferencesPath}`)
    return
  }

  try {
    const preferences: {
      exit_type: string
      [key: string]: any // keep unknown properties
    } = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'))
    preferences.exit_type = 'normal'
    fs.writeFileSync(
      preferencesPath,
      JSON.stringify(preferences, null, 2),
      'utf8'
    )
    console.log('Set exit_type to "normal" in Preferences file.')
  } catch (error) {
    console.error('Error setting exit_type in Preferences:', error)
  }
}

/**
 * Launches the browser, registers the listeners and addons, and opens the startup URLs.
 */
async function main() {
  const [width, height] = ENVIRONMENT.VNC_SCREEN_SIZE.split('x').map(Number)
  const executablePath = ENVIRONMENT.CHROMIUM_PATH

  console.log(`Launching browser with executable path: ${executablePath}`)
  console.log(`Screen size: ${width}x${height}`)
  console.log(`User agent: ${ENVIRONMENT.BROWSER_USER_AGENT}`)
  console.log(`User data directory: ${ENVIRONMENT.USER_DATA_DIR}`)
  console.log(
    `Target URL regexes: ${ENVIRONMENT.TARGET_URL_REGEXS.map((regex) => regex.toString()).join(', ')}`
  )

  // Chromium launch arguments
  const puppeteerArguments = [
    // Sandbox (disabled: the browser runs as root inside the container)
    '--no-sandbox',
    '--disable-setuid-sandbox',

    // Memory
    '--disable-dev-shm-usage',
    '--disable-breakpad',
    '--disable-backing-store-limit',

    // Performance
    '--disable-accelerated-2d-canvas',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees,AudioServiceOutOfProcess',
    '--disable-notifications',
    '--mute-audio',
    '--use-gl=angle',
    '--use-angle=gl-egl',

    // Browser behavior
    '--no-first-run',
    '--no-zygote',
    '--lang=ja',
    `--window-size=${width},${height}`,
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-infobars',
    '--disable-default-apps',
    '--disable-sync',
    '--force-dark-mode',
  ]

  const isOpenDevTools = ENVIRONMENT.IS_OPEN_DEV_TOOLS
  if (isOpenDevTools) {
    puppeteerArguments.push('--auto-open-devtools-for-tabs')
  }

  const userDataDirectory = ENVIRONMENT.USER_DATA_DIR

  const viewportWidth = ENVIRONMENT.VIEWPORT_WIDTH ?? width
  const viewportHeight = ENVIRONMENT.VIEWPORT_HEIGHT ?? height
  console.log(`Viewport size: ${viewportWidth}x${viewportHeight}`)

  if (fs.existsSync(userDataDirectory)) {
    setPreferenceExitType()
  }

  const browser = await puppeteer.launch({
    headless: false, // runs on the Xvfb display so it can be watched over VNC
    executablePath,
    channel: 'chrome',
    args: puppeteerArguments,
    userDataDir: userDataDirectory,
    enableExtensions: true,
    defaultViewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
  })

  // All available addons. Every addon is constructed whether or not it is enabled,
  // so ExportCookieAddon throws unless EXPORT_COOKIE_FILE_PATH is set
  const addons: BaseAddon[] = [
    new TwitterLoginAddon({
      username: ENVIRONMENT.TWITTER_USERNAME,
      password: ENVIRONMENT.TWITTER_PASSWORD,
      emailAddress: ENVIRONMENT.TWITTER_EMAIL_ADDRESS,
      otpSecret: ENVIRONMENT.TWITTER_OTP_SECRET,
    }),
    new ExportCookieAddon(ENVIRONMENT.EXPORT_COOKIE_FILE_PATH),
  ]
  const activeAddons: BaseAddon[] = addons.filter((addon) =>
    ENVIRONMENT.ACTIVE_ADDONS.map((name) =>
      name.trim().toLocaleLowerCase()
    ).includes(addon.name.toLocaleLowerCase())
  )

  let restartIntervalId: NodeJS.Timeout | null = null
  const browserEventListeners: (() => void)[] = []

  process.on('SIGINT', () => {
    // process.on expects a void listener, so the async work is started without awaiting it
    ;(async () => {
      try {
        await gracefulShutdown(
          'SIGINT',
          browser,
          restartIntervalId,
          browserEventListeners
        )
      } catch (error) {
        console.error('Error during graceful shutdown:', error)
        throw error
      }
    })()
  })
  process.on('SIGTERM', () => {
    // process.on expects a void listener, so the async work is started without awaiting it
    ;(async () => {
      try {
        await gracefulShutdown(
          'SIGTERM',
          browser,
          restartIntervalId,
          browserEventListeners
        )
      } catch (error) {
        console.error('Error during graceful shutdown:', error)
        throw error
      }
    })()
  })

  // Periodic restart: shut down so that supervisord starts the process again
  if (ENVIRONMENT.RESTART_INTERVAL_SECONDS > 0) {
    restartIntervalId = setInterval(() => {
      console.log(
        `Restarting browser after ${ENVIRONMENT.RESTART_INTERVAL_SECONDS} seconds...`
      )
      // setInterval expects a void callback, so the async work is started without awaiting it
      ;(async () => {
        try {
          await gracefulShutdown(
            'RESTART_INTERVAL',
            browser,
            restartIntervalId,
            browserEventListeners
          )
        } catch (error) {
          console.error('Error during restart:', error)
          throw error
        }
      })()
    }, ENVIRONMENT.RESTART_INTERVAL_SECONDS * 1000)
  }

  // Set up the tab that already exists at launch
  const [initialPage] = await browser.pages()
  console.log(`Initial page opened: ${initialPage.url()}`)
  registerResponseListener(initialPage)
  const consoleLogging = new ConsoleLogging(
    initialPage,
    ENVIRONMENT.CONSOLE_LOG_DIR
  )
  // Console logging starts without waiting for addon registration
  ;(async () => {
    try {
      await consoleLogging.start()
      console.log(`Console logging started for page: ${initialPage.url()}`)
      appendPageCleanup(initialPage, ...consoleLogging.getListeners())
    } catch (error) {
      console.error('Error starting console logging:', error)
    }
  })()
  await registerAddons(activeAddons, initialPage)

  // Handle tabs opened later
  const targetCreatedHandler = createTargetCreatedHandler(activeAddons)

  browser.on('targetcreated', targetCreatedHandler)
  browserEventListeners.push(() => {
    console.log('Removing target created handler')
    browser.off('targetcreated', targetCreatedHandler)
  })

  const disconnectedHandler = createDisconnectedHandler(
    browser,
    restartIntervalId,
    browserEventListeners
  )

  browser.on('disconnected', disconnectedHandler)
  browserEventListeners.push(() => {
    console.log('Removing disconnected handler')
    browser.off('disconnected', disconnectedHandler)
  })

  // The first startup URL opens in the existing tab, the rest in new tabs
  const startupUrls = ENVIRONMENT.STARTUP_URLS.split(',').map((url) =>
    url.trim()
  )
  if (startupUrls.length > 0) {
    const firstUrl = startupUrls[0]
    console.log(`Opening initial URL: ${firstUrl}`)
    try {
      await initialPage.goto(firstUrl, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      })
    } catch (error) {
      console.error(`Error opening initial URL ${firstUrl}:`, error)
    }
  }

  for (const url of startupUrls.slice(1)) {
    console.log(`Opening additional URL in new tab: ${url}`)
    try {
      const newPage = await browser.newPage()
      registerResponseListener(newPage)
      const consoleLogging = new ConsoleLogging(
        newPage,
        ENVIRONMENT.CONSOLE_LOG_DIR
      )
      // Console logging starts without waiting for addon registration
      ;(async () => {
        try {
          await consoleLogging.start()
          console.log(`Console logging started for page: ${newPage.url()}`)
          appendPageCleanup(newPage, ...consoleLogging.getListeners())
        } catch (error) {
          console.error('Error starting console logging:', error)
        }
      })()
      await registerAddons(activeAddons, newPage)
      await newPage.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      })
    } catch (error) {
      console.error(`Error opening URL ${url}:`, error)
    }
  }
}

/** Entry point: runs main() and exits with code 1 on failure. */
;(async () => {
  try {
    await main()
  } catch (error) {
    console.error('Error in main function:', error)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
})()
