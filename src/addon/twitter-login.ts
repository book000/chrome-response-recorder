import { ElementHandle, Page } from 'puppeteer-core'
import { BaseAddon } from '.'
import { setInterval } from 'node:timers/promises'
import { generateSync as otpGenerateSync } from 'otplib'

interface TwitterLoginAddonOptions {
  /** Twitter username */
  username?: string
  /** Twitter password */
  password?: string
  /** Twitter email address, entered when the login flow asks for it */
  emailAddress?: string
  /** Twitter OTP secret, used to generate the code when the login flow asks for it */
  otpSecret?: string
}

/** Thrown when a step of the Twitter login flow fails (missing credential or element). */
export class TwitterLoginOperationError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'TwitterOperationError'
  }
}

/**
 * Logs in to Twitter automatically. Once registered on a page, it checks the page URL every second
 * and, on the login page, fills in username, email address, password and OTP code as the flow asks for them.
 * The selectors depend on Twitter's current markup.
 */
export class TwitterLoginAddon implements BaseAddon {
  readonly name = 'TwitterLogin'
  readonly description = 'Automatically login to Twitter.'

  private loginUrls = ['https://x.com/i/flow/login']
  private controller = new AbortController()
  private options: TwitterLoginAddonOptions
  constructor(options: TwitterLoginAddonOptions) {
    this.options = options
  }

  register(page: Page): void {
    // checkerPageChanged keeps polling until unregister() aborts it, so it is started without awaiting
    ;(async () => {
      try {
        await this.checkerPageChanged(page)
      } catch (error) {
        if (error instanceof TwitterLoginOperationError) {
          console.error(`Twitter operation error: ${error.message}`)
        } else {
          console.error('An unexpected error occurred:', error)
        }
      }
    })()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unregister(_page: Page): void | Promise<void> {
    this.controller.abort()
  }

  async checkerPageChanged(page: Page) {
    const interval = setInterval(1 * 1000, undefined, {
      signal: this.controller.signal,
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _tick of interval) {
      await this.login(page)
    }
  }

  private async login(page: Page) {
    const pageUrl = new URL(page.url())
    if (!this.loginUrls.includes(pageUrl.origin + pageUrl.pathname)) {
      // not the login page
      return
    }

    console.log('Twitter login page detected. Attempting to log in...')

    // username
    await this.inputUsername(page, this.options.username)

    // need email address ?
    await this.inputEmailAddress(page, this.options.emailAddress)

    // password
    await this.inputPassword(page, this.options.password)

    // need auth code ?
    await this.inputAuthCode(page, this.options.otpSecret)

    console.log('Twitter login process completed.')
  }

  private async inputUsername(page: Page, username: string | undefined) {
    const usernameInput = await this.getElement(
      page,
      'input[autocomplete="username"]',
      3000
    )
    if (!usernameInput) {
      return
    }
    if (!username) {
      throw new TwitterLoginOperationError('Username required.')
    }
    await usernameInput.click({ count: 3 })
    await usernameInput.press('Backspace')
    await usernameInput.focus()
    await usernameInput.type(username, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'div.css-175oi2r button.r-13qz1uu',
      3000
    )
    if (!nextButton) {
      throw new TwitterLoginOperationError('Next button not found.')
    }
    await nextButton.click()
  }

  private async inputPassword(page: Page, password: string | undefined) {
    const passwordInput = await this.getElement(
      page,
      'input[autocomplete="current-password"]',
      3000
    )
    if (!passwordInput) {
      return
    }
    if (!password) {
      throw new TwitterLoginOperationError('Password required.')
    }
    await passwordInput.click({ count: 3 })
    await passwordInput.press('Backspace')
    await passwordInput.focus()
    await passwordInput.type(password, { delay: 100 })

    const loginButton = await this.getElement(
      page,
      'button[role="button"][data-testid="LoginForm_Login_Button"]',
      3000
    )
    if (!loginButton) {
      throw new TwitterLoginOperationError('Login button not found.')
    }
    await loginButton.click()
  }

  private async inputAuthCode(
    page: Page,
    otpSecret: string | undefined
  ): Promise<void> {
    const authCodeInput = await this.getElement(
      page,
      'input[data-testid="ocfEnterTextTextInput"][inputmode="numeric"]',
      3000
    )
    if (!authCodeInput) {
      return
    }
    if (!otpSecret) {
      throw new TwitterLoginOperationError('OTP secret required.')
    }
    const authCode = otpGenerateSync({ secret: otpSecret })
    await authCodeInput.click({ count: 3 })
    await authCodeInput.press('Backspace')
    await authCodeInput.focus()
    await authCodeInput.type(authCode, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'button[role="button"][data-testid="ocfEnterTextNextButton"]',
      3000
    )
    if (!nextButton) {
      throw new TwitterLoginOperationError('Auth code next button not found.')
    }
    await nextButton.click()
  }

  private async inputEmailAddress(
    page: Page,
    emailAddress: string | undefined
  ): Promise<void> {
    const emailInput = await this.getElement(
      page,
      'input[data-testid="ocfEnterTextTextInput"][inputmode="text"]',
      3000
    )
    if (!emailInput) {
      return
    }

    if (!emailAddress) {
      throw new TwitterLoginOperationError('Email address required.')
    }

    await emailInput.click({ count: 3 })
    await emailInput.press('Backspace')
    await emailInput.focus()
    await emailInput.type(emailAddress, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'button[role="button"][data-testid="ocfEnterTextNextButton"]',
      3000
    )
    if (!nextButton) {
      throw new TwitterLoginOperationError('Email next button not found.')
    }
    await nextButton.click()
  }

  /**
   * Waits for an element matching the selector.
   *
   * @param page Puppeteer page
   * @param selector CSS selector
   * @param timeout Timeout in milliseconds
   * @returns The element, or null if it did not appear within the timeout
   */
  private async getElement(
    page: Page,
    selector: string,
    timeout = 3000
  ): Promise<ElementHandle | null> {
    try {
      return await page.waitForSelector(selector, { timeout })
    } catch {
      return null
    }
  }
}
