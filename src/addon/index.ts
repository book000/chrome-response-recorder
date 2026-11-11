import { Page } from 'puppeteer-core'

/** Base class for addons that hook into a page. main.ts registers the enabled addons on every page. */
export abstract class BaseAddon {
  /**
   * Addon name. ACTIVE_ADDONS entries are matched against it case-insensitively.
   * @returns The addon name
   */
  abstract get name(): string

  /**
   * Addon description
   * @returns The addon description
   */
  abstract get description(): string

  /**
   * Registers the addon on a page
   * @param page Page to operate on
   * @returns void or Promise<void>
   */
  abstract register(page: Page): void | Promise<void>

  /**
   * Unregisters the addon from a page. Called when the page is cleaned up
   * @param page Page to operate on
   * @returns void or Promise<void>
   */
  abstract unregister(page: Page): void | Promise<void>
}
