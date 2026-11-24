/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable unicorn/prefer-event-target */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { Page } from 'puppeteer-core'
import { ConsoleLogging } from './console-logging'

it('disables logging after a filesystem failure for every event listener', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-logging-'))
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })
  const output = path.join(root, 'output')
  fs.writeFileSync(output, '')
  const errors = context.mock.method(console, 'error', () => undefined)
  const client = Object.assign(new EventEmitter(), {
    send: () => Promise.resolve(),
  })
  const page = Object.assign(new EventEmitter(), {
    url: () => 'https://example.com/',
    createCDPSession: () => Promise.resolve(client),
  })
  const logger = new ConsoleLogging(page as unknown as Page, output)
  await logger.start()
  const events = [
    () =>
      page.emit('console', {
        type: () => 'log',
        text: () => 'message',
        args: () => [],
        location: () => ({}),
        stackTrace: () => [],
      }),
    () => page.emit('pageerror', new Error('page error')),
    () =>
      page.emit('requestfailed', {
        url: () => 'https://example.com/',
        method: () => 'GET',
        response: () => undefined,
        failure: () => undefined,
      }),
    () => client.emit('Runtime.consoleAPICalled', { type: 'log', args: [] }),
  ]
  for (const emit of events) assert.doesNotThrow(emit)
  assert.equal(errors.mock.callCount(), 1)
  fs.unlinkSync(output)
  for (const emit of events) assert.doesNotThrow(emit)
  assert.equal(fs.existsSync(output), false)
  assert.equal(errors.mock.callCount(), 1)
  for (const remove of logger.getListeners()) remove()
})

it('records events when the output directory is writable', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-logging-'))
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })
  const client = Object.assign(new EventEmitter(), {
    send: () => Promise.resolve(),
  })
  const page = Object.assign(new EventEmitter(), {
    url: () => 'https://example.com/',
    createCDPSession: () => Promise.resolve(client),
  })
  const logger = new ConsoleLogging(page as unknown as Page, root)
  await logger.start()
  page.emit('pageerror', new Error('page error'))
  const directory = path.join(root, 'example.com', '__root__')
  const files = fs.readdirSync(directory)
  assert.equal(files.length, 1)
  const record = JSON.parse(
    fs.readFileSync(path.join(directory, files[0]), 'utf8')
  ) as { eventName: string; message: string }
  assert.equal(record.eventName, 'pageerror')
  assert.equal(record.message, 'page error')
  for (const remove of logger.getListeners()) remove()
})
