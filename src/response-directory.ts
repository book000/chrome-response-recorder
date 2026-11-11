import fs from 'node:fs'
import path from 'node:path'

/** Maximum numeric suffix tried when directories for the same millisecond already exist */
const MAX_COLLISION_RETRIES = 10_000

/**
 * Exclusively creates the directory for one recorded response.
 *
 * Tries `{baseDirectory}/{timestamp}/` first and, if it already exists, `{timestamp}-1/`, `{timestamp}-2/`, ...
 * Responses for the same domain, path and method handled within the same millisecond collide.
 * Only the parent directories are created recursively; the leaf is created with a non-recursive `mkdirSync`,
 * so a successful call owns the directory and there is no check-then-create race that could overwrite or mix responses.
 * @param baseDirectory - Parent directory, `/responses/{domain}/{path}/{method}`
 * @param timestamp - Timestamp in milliseconds used as the base directory name
 * @returns Path of the created directory, with a trailing slash
 * @throws Any error other than EEXIST, or an Error when every suffix up to the retry limit is taken
 */
export function createResponseDirectory(
  baseDirectory: string,
  timestamp: number
): string {
  fs.mkdirSync(baseDirectory, { recursive: true })

  for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt++) {
    const name = attempt === 0 ? String(timestamp) : `${timestamp}-${attempt}`
    const directory = path.join(baseDirectory, name)
    try {
      fs.mkdirSync(directory)
      return `${directory}/`
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }

  throw new Error(
    `Failed to create a unique response directory: ${baseDirectory}/${timestamp}`
  )
}
