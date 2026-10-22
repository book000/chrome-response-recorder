import fs from 'node:fs'
import path from 'node:path'

/** 同一ミリ秒の衝突を避けるために試行する連番サフィックスの上限 */
const MAX_COLLISION_RETRIES = 10_000

/**
 * 応答の保存先ディレクトリを排他的に作成する
 *
 * `{baseDirectory}/{timestamp}/` の作成を試みる。
 * 既に存在する場合は `{timestamp}-1/`、`{timestamp}-2/` … と連番を付けて再試行する。
 * 同一ドメイン・パス・メソッドの応答が同一ミリ秒に処理されると衝突する。
 * 衝突しなければ `{baseDirectory}/{timestamp}/` をそのまま使う。
 * 親ディレクトリのみ再帰的に作成し、末端は再帰オプションなしの `mkdirSync` で作成する。
 * 作成に成功したディレクトリは自分だけが所有するため、`existsSync` と `mkdirSync` の間の競合による上書き・混在が起きない。
 * @param baseDirectory - `/responses/{domain}/{path}/{method}` 形式の親ディレクトリ
 * @param timestamp - ディレクトリ名の基準となるタイムスタンプ（ミリ秒）
 * @returns 作成したディレクトリのパス（末尾にスラッシュを含む）
 * @throws EEXIST 以外のエラー、または連番の上限まで衝突し続けた場合
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
