// node:test's describe / it return Promises, but the test runner manages them, so they need no await
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  appendPrivateFile,
  mkdirPrivate,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  writePrivateFile,
} from './private-fs'

/** Permission bits of a path */
const modeOf = (target: string) => fs.statSync(target).mode & 0o777

describe('private-fs', () => {
  let rootDirectory: string
  let originalUmask: number

  beforeEach(() => {
    rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'private-fs-'))
    originalUmask = process.umask(0o022)
  })

  afterEach(() => {
    process.umask(originalUmask)
    fs.rmSync(rootDirectory, { recursive: true, force: true })
  })

  it('uses 0600 for files and 0700 for directories', () => {
    assert.equal(PRIVATE_FILE_MODE, 0o600)
    assert.equal(PRIVATE_DIRECTORY_MODE, 0o700)
  })

  it('mkdirPrivate creates every new nested directory with mode 0700', () => {
    const leaf = path.join(rootDirectory, 'a', 'b', 'c')

    mkdirPrivate(leaf)

    for (const directory of [
      path.join(rootDirectory, 'a'),
      path.join(rootDirectory, 'a', 'b'),
      leaf,
    ]) {
      assert.equal(modeOf(directory), 0o700)
    }
  })

  it('mkdirPrivate leaves an existing directory untouched', () => {
    const existing = path.join(rootDirectory, 'existing')
    fs.mkdirSync(existing, { mode: 0o755 })

    mkdirPrivate(existing)

    assert.equal(modeOf(existing), 0o755)
  })

  it('writePrivateFile creates a new file with mode 0600', () => {
    const file = path.join(rootDirectory, 'new.json')

    writePrivateFile(file, 'secret')

    assert.equal(modeOf(file), 0o600)
    assert.equal(fs.readFileSync(file, 'utf8'), 'secret')
  })

  it('writePrivateFile tightens an existing 0644 file and replaces its content', () => {
    const file = path.join(rootDirectory, 'existing.json')
    fs.writeFileSync(file, 'old content that is longer', { mode: 0o644 })
    fs.chmodSync(file, 0o644)

    writePrivateFile(file, 'new')

    assert.equal(modeOf(file), 0o600)
    assert.equal(fs.readFileSync(file, 'utf8'), 'new')
  })

  it('appendPrivateFile creates a file with mode 0600 and appends', () => {
    const file = path.join(rootDirectory, 'log.jsonl')

    appendPrivateFile(file, 'one\n')
    appendPrivateFile(file, 'two\n')

    assert.equal(modeOf(file), 0o600)
    assert.equal(fs.readFileSync(file, 'utf8'), 'one\ntwo\n')
  })
})
