import { BaseAddon } from '.'
import { ExportCookieAddon } from './export-cookie'
import { TwitterLoginAddon } from './twitter-login'

/** Configuration used only when the corresponding addon is enabled. */
interface AddonOptions {
  twitterLogin: ConstructorParameters<typeof TwitterLoginAddon>[0]
  exportCookieFilePath: string | undefined
}

/**
 * Constructs enabled addons in registration order, ignoring unknown names.
 * @param names - Addon names, matched case-insensitively after trimming
 * @param options - Configuration for the enabled addons
 * @returns Addon instances ready for page registration
 * @throws Error when ExportCookie is enabled without an output file path
 */
export function createActiveAddons(
  names: string[],
  options: AddonOptions
): BaseAddon[] {
  const activeNames = new Set(names.map((name) => name.trim().toLowerCase()))
  const factories: Record<string, () => BaseAddon> = {
    twitterlogin: () => new TwitterLoginAddon(options.twitterLogin),
    exportcookie: () => new ExportCookieAddon(options.exportCookieFilePath),
  }

  return Object.entries(factories)
    .filter(([name]) => activeNames.has(name))
    .map(([, createAddon]) => createAddon())
}
