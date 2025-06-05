import { ConsoleMessage, HTTPRequest, Page, Protocol } from 'puppeteer-core'
import fs from 'node:fs'
// eslint-disable-next-line unicorn/import-style
import { dirname } from 'node:path'

export class ConsoleLogging {
  private page: Page
  private logDirectory: string | undefined
  private listeners: (() => void)[] = []

  constructor(page: Page, logDirectory: string | undefined) {
    this.page = page
    this.logDirectory = logDirectory
  }

  public async start() {
    if (!this.logDirectory) {
      console.warn(
        'ConsoleLogging: logDirectory is not set. Skipping console logging.'
      )
      return
    }
    await this.registerHandlers()
  }

  public getListeners() {
    return this.listeners
  }

  private async registerHandlers() {
    this.page.on('console', this.consoleHandler.bind(this))
    this.page.on('pageerror', this.errorHandler.bind(this))
    this.page.on('requestfailed', this.requestFailedHandler.bind(this))
    const client = await this.page.createCDPSession()
    await client.send('Runtime.enable')
    client.on(
      'Runtime.consoleAPICalled',
      this.consoleApiCalledHandler.bind(this)
    )

    this.listeners.push(
      () => this.page.off('console', this.consoleHandler.bind(this)),
      () => this.page.off('pageerror', this.errorHandler.bind(this)),
      () =>
        this.page.off('requestfailed', this.requestFailedHandler.bind(this)),
      () =>
        client.off(
          'Runtime.consoleAPICalled',
          this.consoleApiCalledHandler.bind(this)
        )
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

  private errorHandler(error: Error) {
    this.logMessage('pageerror', 'error', error.message, {
      stack: error.stack ?? null,
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

  private consoleApiCalledHandler(
    event: Protocol.Runtime.ConsoleAPICalledEvent
  ) {
    const { type, args, stackTrace } = event
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

    // write to file
    // /logs/{browsing_domain}/{browsing_path}/{page_load_timestamp}.jsonl
    const pageUrl = new URL(this.page.url())
    const browsingDomain = pageUrl.hostname
    const pathname = pageUrl.pathname.replace(/^\//, '') // パスの先頭のスラッシュを削除
    const path = pathname || '__root__' // パスが空の場合は '__root__' とする
    const timestamp = Date.now()
    const logFilePath = `${this.logDirectory}/${browsingDomain}/${path}/${timestamp}.jsonl`
    const logFileDirectory = dirname(logFilePath)
    const logEntry = JSON.stringify(log) + '\n'

    fs.mkdirSync(logFileDirectory, {
      recursive: true,
    })

    fs.appendFileSync(logFilePath, logEntry, 'utf8')
  }
}
