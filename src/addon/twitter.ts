import { ElementHandle, Page } from 'puppeteer-core'
import { BaseAddon } from '.'
import { setInterval } from 'node:timers/promises'
import { authenticator } from 'otplib'

interface TwitterAddonOptions {
  /** Twitterのユーザー名 */
  username?: string
  /** Twitterのパスワード */
  password?: string
  /** Twitterのメールアドレス */
  emailAddress?: string
  /** TwitterのOTPシークレット */
  otpSecret?: string
}

/**
 * Twitterでの操作に失敗した場合
 */
export class TwitterOperationError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'TwitterOperationError'
  }
}

export class TwitterAddon implements BaseAddon {
  readonly name = 'Twitter'
  readonly description = 'Automatically login to Twitter.'

  private loginUrls = ['https://x.com/i/flow/login']
  private controller = new AbortController()
  private options: TwitterAddonOptions
  constructor(options: TwitterAddonOptions) {
    this.options = options
  }

  register(page: Page): void {
    this.checkerPageChanged(page).catch((error: unknown) => {
      if (error instanceof TwitterOperationError) {
        console.error(`Twitter operation error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred:', error)
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unregister(_page: Page): void | Promise<void> {
    this.controller.abort()
  }

  async checkerPageChanged(page: Page) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(1 * 1000, {
      signal: this.controller.signal,
    })) {
      await this.login(page)
    }
  }

  private async login(page: Page) {
    const pageUrl = new URL(page.url())
    if (!this.loginUrls.includes(pageUrl.href)) {
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
      throw new TwitterOperationError('Username required.')
    }
    await usernameInput.type(username, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'div.css-175oi2r button.r-13qz1uu',
      3000
    )
    if (!nextButton) {
      throw new TwitterOperationError('Next button not found.')
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
      throw new TwitterOperationError('Password required.')
    }
    await passwordInput.type(password, { delay: 100 })

    const loginButton = await this.getElement(
      page,
      'button[role="button"][data-testid="LoginForm_Login_Button"]',
      3000
    )
    if (!loginButton) {
      throw new TwitterOperationError('Login button not found.')
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
      throw new TwitterOperationError('OTP secret required.')
    }
    const authCode = authenticator.generate(otpSecret)
    await authCodeInput.type(authCode, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'button[role="button"][data-testid="ocfEnterTextNextButton"]',
      3000
    )
    if (!nextButton) {
      throw new TwitterOperationError('Auth code next button not found.')
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
      throw new TwitterOperationError('Email address required.')
    }

    await emailInput.type(emailAddress, { delay: 100 })

    const nextButton = await this.getElement(
      page,
      'button[role="button"][data-testid="ocfEnterTextNextButton"]',
      3000
    )
    if (!nextButton) {
      throw new TwitterOperationError('Email next button not found.')
    }
    await nextButton.click()
  }

  /**
   * 指定したセレクタの要素を取得します。
   *
   * @param page Puppeteer ページインスタンス
   * @param selector セレクタ
   * @param timeout タイムアウトミリ秒
   * @returns 要素。見つからなかった場合は null
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
