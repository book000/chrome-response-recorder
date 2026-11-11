// node:test's describe / it return Promises, but the test runner manages them, so they need no await
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { createResponseDirectory } from './response-directory'

/** Fixed timestamp in milliseconds */
const TIMESTAMP = 1_700_000_000_000

describe('createResponseDirectory', () => {
  let rootDirectory: string
  let baseDirectory: string

  beforeEach(() => {
    rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-dir-'))
    baseDirectory = path.join(rootDirectory, 'example.com', 'api', 'GET')
  })

  afterEach(() => {
    fs.rmSync(rootDirectory, { recursive: true, force: true })
  })

  /** Expected path of a created directory (independent of the OS path separator, with a trailing slash) */
  const expectedPath = (name: string) => `${path.join(baseDirectory, name)}/`

  it('creates {timestamp}/ for a single response without collision', () => {
    const directory = createResponseDirectory(baseDirectory, TIMESTAMP)

    assert.equal(directory, expectedPath(String(TIMESTAMP)))
    assert.ok(fs.statSync(directory).isDirectory())
  })

  it('adds numeric suffixes to keep directories unique for the same timestamp', () => {
    const directories = [
      createResponseDirectory(baseDirectory, TIMESTAMP),
      createResponseDirectory(baseDirectory, TIMESTAMP),
      createResponseDirectory(baseDirectory, TIMESTAMP),
    ]

    assert.deepEqual(directories, [
      expectedPath(String(TIMESTAMP)),
      expectedPath(`${TIMESTAMP}-1`),
      expectedPath(`${TIMESTAMP}-2`),
    ])
  })

  it('does not overwrite the contents of an existing directory', () => {
    const first = createResponseDirectory(baseDirectory, TIMESTAMP)
    fs.writeFileSync(path.join(first, 'detail.json'), 'first')

    const second = createResponseDirectory(baseDirectory, TIMESTAMP)

    assert.notEqual(second, first)
    assert.deepEqual(fs.readdirSync(second), [])
    assert.equal(
      fs.readFileSync(path.join(first, 'detail.json'), 'utf8'),
      'first'
    )
  })

  it('keeps directories unique and contents separate when responses with the same timestamp are processed concurrently', async () => {
    const count = 100

    const results = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const directory = createResponseDirectory(baseDirectory, TIMESTAMP)
        // wait a random time so that the write completion order varies
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5))
        fs.writeFileSync(
          path.join(directory, 'detail.json'),
          JSON.stringify({ index })
        )
        fs.writeFileSync(path.join(directory, 'data.raw'), String(index))
        return { directory, index }
      })
    )

    assert.equal(new Set(results.map((result) => result.directory)).size, count)
    for (const { directory, index } of results) {
      const detail = JSON.parse(
        fs.readFileSync(path.join(directory, 'detail.json'), 'utf8')
      ) as { index: number }
      assert.equal(detail.index, index)
      assert.equal(
        fs.readFileSync(path.join(directory, 'data.raw'), 'utf8'),
        String(index)
      )
    }
  })

  it('rethrows errors other than EEXIST without retrying', () => {
    // delegate the recursive parent creation to the real implementation and fail only the leaf creation with EACCES
    const originalMkdirSync = fs.mkdirSync
    const mkdirMock = mock.method(fs, 'mkdirSync', ((
      target: fs.PathLike,
      options?: fs.MakeDirectoryOptions
    ) => {
      if (options?.recursive) {
        return originalMkdirSync(target, options)
      }
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    }) as typeof fs.mkdirSync)

    try {
      assert.throws(() => createResponseDirectory(baseDirectory, TIMESTAMP), {
        code: 'EACCES',
      })
      // only one parent creation and one leaf creation: no retry with the next suffix
      assert.equal(mkdirMock.mock.callCount(), 2)
    } finally {
      mkdirMock.mock.restore()
    }
  })
})
