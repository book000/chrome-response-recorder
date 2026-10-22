// node:test の describe / it は Promise を返すが、実行はテストランナーが管理するため await 不要
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { createResponseDirectory } from './response-directory'

/** 固定するタイムスタンプ（ミリ秒） */
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

  /** 作成されるディレクトリのパス（OS のパス区切りに依存せず、末尾にスラッシュを含む） */
  const expectedPath = (name: string) => `${path.join(baseDirectory, name)}/`

  it('衝突しない単発応答は {timestamp}/ のパスに作成する', () => {
    const directory = createResponseDirectory(baseDirectory, TIMESTAMP)

    assert.equal(directory, expectedPath(String(TIMESTAMP)))
    assert.ok(fs.statSync(directory).isDirectory())
  })

  it('同一タイムスタンプでは連番サフィックスを付けて一意にする', () => {
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

  it('既存ディレクトリの内容を上書きしない', () => {
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

  it('同一タイムスタンプの応答を並行処理しても保存先が一意で、内容を取り違えない', async () => {
    const count = 100

    const results = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const directory = createResponseDirectory(baseDirectory, TIMESTAMP)
        // 書き込みの完了順がバラバラになるように待機する
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

  it('EEXIST 以外のエラーは再試行せずそのまま送出する', () => {
    // 親の再帰作成は実処理に委譲し、末端の作成だけを EACCES で失敗させる
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
      // 親の再帰作成 1 回と末端の作成 1 回のみで、連番を進めて再試行しない
      assert.equal(mkdirMock.mock.callCount(), 2)
    } finally {
      mkdirMock.mock.restore()
    }
  })
})
