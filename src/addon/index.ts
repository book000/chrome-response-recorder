import { Page } from 'puppeteer-core'

export abstract class BaseAddon {
  /**
   * Addonの名前
   * @returns Addonの名前
   */
  abstract get name(): string

  /**
   * Addonの説明
   * @returns Addonの説明
   */
  abstract get description(): string

  /**
   * Addonを登録する
   * @param page 操作対象のページ
   * @returns void もしくは Promise<void>
   */
  abstract register(page: Page): void | Promise<void>

  /**
   * Addonを登録解除する
   * @param page 操作対象のページ
   * @returns void もしくは Promise<void>
   */
  abstract unregister(page: Page): void | Promise<void>
}
