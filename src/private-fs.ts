import fs from 'node:fs'

/** Mode of files that can hold secrets: readable and writable by the owner only. */
export const PRIVATE_FILE_MODE = 0o600

/** Mode of directories created for secret-bearing files: accessible by the owner only. */
export const PRIVATE_DIRECTORY_MODE = 0o700

/**
 * Creates a directory and any missing parents with {@link PRIVATE_DIRECTORY_MODE}.
 * Directories that already exist keep their mode.
 * @param directory - Directory to create
 */
export function mkdirPrivate(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
}

/**
 * Writes a file that ends up with {@link PRIVATE_FILE_MODE}, also when it already existed with a wider mode.
 * The mode is fixed before any data is written, so the new contents are never exposed through the old mode.
 * The file is rewritten in place (no rename) so that a single-file bind mount keeps working.
 * @param filePath - File to create or truncate
 * @param data - UTF-8 text to write
 * @throws Any I/O error, including a filesystem that cannot apply the mode
 */
export function writePrivateFile(filePath: string, data: string): void {
  const descriptor = fs.openSync(filePath, 'w', PRIVATE_FILE_MODE)
  try {
    fs.fchmodSync(descriptor, PRIVATE_FILE_MODE)
    fs.writeSync(descriptor, data)
  } finally {
    fs.closeSync(descriptor)
  }
}

/**
 * Appends UTF-8 text to a file, creating it with {@link PRIVATE_FILE_MODE}.
 * The mode of a file that already exists is not changed.
 * @param filePath - File to append to
 * @param data - UTF-8 text to append
 */
export function appendPrivateFile(filePath: string, data: string): void {
  fs.appendFileSync(filePath, data, {
    encoding: 'utf8',
    mode: PRIVATE_FILE_MODE,
  })
}
