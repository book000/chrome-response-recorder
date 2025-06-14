import { Page } from 'puppeteer-core'
import { BaseAddon } from '.'
import path from 'node:path'
import fs from 'node:fs'

export class ExportCookieAddon implements BaseAddon {
  readonly name = 'ExportCookie'
  readonly description = 'Exports cookies to file.'

  private cookieFilePath: string

  constructor(cookieFilePath: string | undefined) {
    if (!cookieFilePath) {
      throw new Error('cookieFilePath is required for ExportCookieAddon')
    }
    this.cookieFilePath = cookieFilePath
  }

  async register(page: Page): Promise<void> {
    const cookies = await page.browser().cookies()
    const cookieData = cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      size: cookie.size,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      session: cookie.session,
      sameSite: cookie.sameSite ?? null,
      priority: cookie.priority ?? null,
      sameParty: cookie.sameParty ?? null,
      sourceScheme: cookie.sourceScheme ?? null,
      partitionKey: cookie.partitionKey ?? null,
      partitionKeyOpaque: cookie.partitionKeyOpaque ?? null,
    }))

    const cookieDir = path.dirname(this.cookieFilePath)
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true })
    }
    fs.writeFileSync(this.cookieFilePath, JSON.stringify(cookieData, null, 2))
    console.log(`Cookies exported to ${this.cookieFilePath}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unregister(_page: Page): void | Promise<void> {
    // No specific unregistration logic needed for cookie export
  }
}
