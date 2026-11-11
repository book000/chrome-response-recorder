import { ConsoleMessage, HTTPRequest, Page, Protocol } from 'puppeteer-core'
import fs from 'node:fs'
// eslint-disable-next-line unicorn/import-style
import { dirname } from 'node:path'

/**
 * Records a page's console output, page errors, failed requests and CDP `Runtime.consoleAPICalled` events
 * as JSON Lines under `{logDirectory}/{domain}/{path}/{timestamp}.jsonl`.
 * `{domain}` and `{path}` come from the page URL at the time of each event;
 * `{timestamp}` is when this instance was created (once per tab), so every page load in the tab appends to the same file for a given URL.
 */
export class ConsoleLogging {
  private page: Page
  private timestamp: number = Date.now()
  private logDirectory: string | undefined
  private listeners: (() => void)[] = []

  /**
   * @param page - Page to record
   * @param logDirectory - Output directory. When undefined, start() does nothing
   */
  constructor(page: Page, logDirectory: string | undefined) {
    this.page = page
    this.logDirectory = logDirectory
  }

  /** Registers the handlers. Skipped with a warning when no log directory is set. */
  public async start() {
    if (!this.logDirectory) {
      console.warn(
        'ConsoleLogging: logDirectory is not set. Skipping console logging.'
      )
      return
    }
    await this.registerHandlers()
  }

  /** @returns Functions that detach the registered handlers */
  public getListeners() {
    return this.listeners
  }

  private async registerHandlers() {
    const consoleHandlerFunc = this.consoleHandler.bind(this)
    const errorHandlerFunc = this.errorHandler.bind(this)
    const requestFailedHandlerFunc = this.requestFailedHandler.bind(this)
    const consoleApiCalledHandlerFunc = this.consoleApiCalledHandler.bind(this)

    this.page.on('console', consoleHandlerFunc)
    this.page.on('pageerror', errorHandlerFunc)
    this.page.on('requestfailed', requestFailedHandlerFunc)
    const client = await this.page.createCDPSession()
    await client.send('Runtime.enable')
    client.on('Runtime.consoleAPICalled', consoleApiCalledHandlerFunc)

    this.listeners.push(
      () => this.page.off('console', consoleHandlerFunc),
      () => this.page.off('pageerror', errorHandlerFunc),
      () => this.page.off('requestfailed', requestFailedHandlerFunc),
      () => client.off('Runtime.consoleAPICalled', consoleApiCalledHandlerFunc)
    )
  }

  private consoleHandler(message: ConsoleMessage) {
    this.logMessage('console', message.type(), message.text(), {
      args: message.args().map((arg) => arg.toString()),
      location: {
        url: message.location().url ?? null,
        lineNumber: message.location().lineNumber ?? null,
        columnNumber: message.location().columnNumber ?? null,
      },
      stackTraces: message.stackTrace().map((frame) => ({
        url: frame.url ?? null,
        lineNumber: frame.lineNumber ?? null,
        columnNumber: frame.columnNumber ?? null,
      })),
    })
  }

  private errorHandler(error: unknown) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error))

    this.logMessage('pageerror', 'error', normalizedError.message, {
      stack: normalizedError.stack ?? null,
    })
  }

  private requestFailedHandler(request: HTTPRequest) {
    this.logMessage(
      'requestfailed',
      'error',
      `Request failed: ${request.url()}`,
      {
        method: request.method(),
        response: request.response()
          ? {
              status: request.response()?.status() ?? null,
              statusText: request.response()?.statusText() ?? null,
              headers: request.response()?.headers() ?? null,
              url: request.response()?.url() ?? null,
            }
          : null,
        failureText: request.failure()?.errorText ?? null,
      }
    )
  }

  private consoleApiCalledHandler(event: unknown) {
    if (!event || typeof event !== 'object') {
      return
    }

    const { type, args, stackTrace } =
      event as Protocol.Runtime.ConsoleAPICalledEvent
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const message = args.map((arg) => arg.value).join(' ')
    this.logMessage('consoleApiCalled', type, message, {
      args,
      stackTraces: stackTrace
        ? stackTrace.callFrames.map((frame) => ({
            url: frame.url,
            lineNumber: frame.lineNumber,
            columnNumber: frame.columnNumber,
            functionName: frame.functionName,
            scriptId: frame.scriptId,
          }))
        : [],
    })
  }

  private logMessage(
    eventName: string,
    type: string,
    message: string,
    extra: Record<string, any>
  ): void {
    const log = {
      timestamp: new Date().toISOString(),
      eventName,
      type,
      message,
      extra,
    }

    // {logDirectory}/{browsing_domain}/{browsing_path}/{timestamp}.jsonl
    const pageUrl = new URL(this.page.url())
    const browsingDomain = pageUrl.hostname
    const pathname = pageUrl.pathname.replace(/^\//, '') // strip the leading slash
    const path = pathname || '__root__' // use '__root__' for an empty path
    const logFilePath = `${this.logDirectory}/${browsingDomain}/${path}/${this.timestamp}.jsonl`
    const logFileDirectory = dirname(logFilePath)
    const logEntry = JSON.stringify(log) + '\n'

    fs.mkdirSync(logFileDirectory, {
      recursive: true,
    })

    fs.appendFileSync(logFilePath, logEntry, 'utf8')
  }
}
