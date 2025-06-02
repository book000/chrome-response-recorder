import puppeteer, {
  Page,
  TargetType,
  HTTPResponse,
  Target,
  Browser,
} from 'puppeteer-core'
import fs from 'node:fs'

/**
 * 環境変数から取得する設定値
 * 各種設定項目をまとめて管理
 */
const ENVIRONMENT = {
  /** VNCスクリーンサイズ（幅x高さ） */
  VNC_SCREEN_SIZE: process.env.VNC_SCREEN_SIZE ?? '1024x768',
  /** Chromiumブラウザの実行ファイルパス */
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
  /** ブラウザのユーザーデータディレクトリ */
  USER_DATA_DIR: process.env.VNC_USER_DATA_DIR ?? '/userdata',
  /** ブラウザのUser-Agent文字列 */
  BROWSER_USER_AGENT:
    process.env.BROWSER_USER_AGENT ??
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
  /** 監視対象URLの正規表現リスト */
  TARGET_URL_REGEXS: process.env.TARGET_URL_REGEXS
    ? process.env.TARGET_URL_REGEXS.split(/[,\n]/).map(
        (regex) => new RegExp(regex.trim())
      )
    : [],
  /** 起動時に開くURLのリスト（カンマ区切り） */
  STARTUP_URLS: process.env.STARTUP_URLS ?? '',
  /** ブラウザの自動再起動間隔（秒）。0の場合は再起動しない */
  RESTART_INTERVAL_SECONDS:
    Number.parseInt(process.env.RESTART_INTERVAL_SECONDS ?? '0', 10) || 0,
  /** ビューポートの幅（ピクセル）。未指定の場合はVNC_SCREEN_SIZEの幅を使用 */
  VIEWPORT_WIDTH: process.env.VIEWPORT_WIDTH
    ? Number(process.env.VIEWPORT_WIDTH)
    : null,
  /** ビューポートの高さ（ピクセル）。未指定の場合はVNC_SCREEN_SIZEの高さを使用 */
  VIEWPORT_HEIGHT: process.env.VIEWPORT_HEIGHT
    ? Number(process.env.VIEWPORT_HEIGHT)
    : null,
} as const

// ページごとにイベントリスナーを管理するためのWeakMap
const pageEventListeners = new WeakMap<Page, (() => void)[]>()

// レスポンスハンドラーを外部スコープに移動
/**
 * HTTPレスポンスを処理し、条件に合致するレスポンスをファイルシステムに保存する
 * @param response - Puppeteerから受信したHTTPResponse
 */
function responseHandler(response: HTTPResponse) {
  const url = response.url()
  const status = response.status()
  const statusText = response.statusText()
  const method = response.request().method()

  // URLが監視対象の正規表現にマッチするかチェック
  const isTargetUrl = ENVIRONMENT.TARGET_URL_REGEXS.some((regex) =>
    regex.test(url)
  )
  if (!isTargetUrl) {
    return
  }

  // preflightリクエスト（CORS）は無視する
  if (response.request().method() === 'OPTIONS') {
    console.log(`Ignoring preflight request: ${url}`)
    return
  }

  console.log(
    `Response received: ${method} ${url} - Status: ${status} ${statusText}`
  )

  // レスポンスデータを構造化されたディレクトリに保存
  // 保存形式: /responses/{domain}/{path}/{method}/{timestamp}/
  // 例: /responses/example.com/api/v1/users/GET/1700000000000/
  const urlObj = new URL(url)
  const domain = urlObj.hostname
  const pathname = urlObj.pathname.replace(/^\//, '') // パスの先頭のスラッシュを削除
  const path = pathname || '__root__' // パスが空の場合は '__root__' とする
  const timestamp = Date.now()
  const directory = `/responses/${domain}/${path}/${method}/${timestamp}/`

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }

  const detailFilePath = `${directory}detail.json`
  const dataFilePath = `${directory}data.raw`

  // レスポンスの詳細情報をまとめる
  const responseData = {
    url,
    status,
    statusText,
    headers: response.headers(),
    timing: response.timing(),
    request: {
      method,
      headers: response.request().headers(),
      postData: response.request().postData(),
    },
  }

  // レスポンスの詳細情報を detail.json に保存
  try {
    fs.writeFileSync(
      detailFilePath,
      JSON.stringify(responseData, null, 2),
      'utf8'
    )
  } catch (error) {
    console.error('Error writing detail file:', error)
    return
  }

  // レスポンスボディのバイナリデータを data.raw に保存
  response
    .buffer()
    .then((buffer) => {
      const writeStream = fs.createWriteStream(dataFilePath)
      let streamClosed = false

      // ストリームのクリーンアップ処理
      const cleanup = () => {
        if (!streamClosed) {
          streamClosed = true
          writeStream.destroy()
        }
      }

      // タイムアウトを設定してストリームの書き込みを制限（30秒）
      const timeout = setTimeout(() => {
        console.error(`Timeout writing response data: ${dataFilePath}`)
        cleanup()
      }, 30_000) // 30秒のタイムアウト

      writeStream.on('error', (error) => {
        console.error('Error writing response data:', error)
        clearTimeout(timeout)
        cleanup()
      })

      writeStream.on('finish', () => {
        console.log(`Response data saved to: ${dataFilePath}`)
        clearTimeout(timeout)
        streamClosed = true
      })

      writeStream.on('close', () => {
        clearTimeout(timeout)
        streamClosed = true
      })

      writeStream.end(buffer)
    })
    .catch((error: unknown) => {
      console.error('Error saving response data:', error)
    })
}

// ページクローズハンドラー
/**
 * ページが閉じられた時のイベントリスナークリーンアップハンドラーを作成
 * @param page - 対象のページオブジェクト
 * @returns クリーンアップ処理を行う関数
 */
function createCloseHandler(page: Page) {
  return function closeHandler() {
    // イベントリスナーを削除
    page.off('response', responseHandler)
    page.off('close', closeHandler)
    // WeakMapから削除（ガベージコレクションを促進）
    pageEventListeners.delete(page)
    console.log(`Cleaned up event listeners for page: ${page.url()}`)
  }
}

/**
 * ページにレスポンス監視リスナーを登録する
 * @param page - 監視対象のページ
 */
function registerResponseListener(page: Page) {
  // レスポンスイベントリスナーを登録
  page.on('response', responseHandler)

  // ページが閉じられた時のクリーンアップ処理
  const closeHandler = createCloseHandler(page)

  page.on('close', closeHandler)

  // クリーンアップ関数をWeakMapに保存（メモリリーク防止）
  const cleanupFunctions = pageEventListeners.get(page) ?? []
  cleanupFunctions.push(() => {
    page.off('response', responseHandler)
    page.off('close', closeHandler)
  })
  pageEventListeners.set(page, cleanupFunctions)
}

/**
 * ページのイベントリスナーを手動でクリーンアップする
 * @param page - クリーンアップ対象のページ
 */
function cleanupPage(page: Page) {
  const cleanupFunctions = pageEventListeners.get(page)
  if (cleanupFunctions) {
    for (const cleanup of cleanupFunctions) {
      cleanup()
    }
    pageEventListeners.delete(page)
  }
}

/**
 * グレースフルシャットダウン処理
 * プロセス終了シグナルを受信した際に、リソースを適切にクリーンアップしてから終了する
 * @param signal - 受信したシグナル名
 * @param browser - ブラウザインスタンス
 * @param restartIntervalId - 再起動タイマーのID
 * @param browserEventListeners - ブラウザのイベントリスナークリーンアップ関数配列
 */
async function gracefulShutdown(
  signal: string,
  browser: Browser,
  restartIntervalId: NodeJS.Timeout | null,
  browserEventListeners: (() => void)[]
) {
  console.log(`${signal} received. Shutting down gracefully...`)

  // インターバルタイマーをクリア
  if (restartIntervalId) {
    clearInterval(restartIntervalId)
  }

  // すべてのページのイベントリスナーをクリーンアップ
  try {
    const pages = await browser.pages()
    for (const page of pages) {
      cleanupPage(page)
    }
  } catch (error) {
    console.error('Error cleaning up pages:', error)
  }

  // ブラウザのイベントリスナーをクリーンアップ
  for (const cleanup of browserEventListeners) {
    cleanup()
  }

  // ブラウザを閉じる
  try {
    await browser.close()
    console.log('Browser closed successfully.')
  } catch (error) {
    console.error('Error closing browser:', error)
  }

  throw new Error(`Process terminated by ${signal}`)
}

/**
 * 新しいターゲット（タブ）が作成された時のハンドラーを生成
 * @returns ターゲット作成イベントハンドラー
 */
function createTargetCreatedHandler() {
  return (target: Target) => {
    console.log(`New target created: ${target.url()}`)
    // ページタイプのターゲットのみ処理
    if (target.type() !== TargetType.PAGE) {
      return
    }
    target
      .page()
      .then((page: Page | null) => {
        if (!page) {
          return
        }

        console.log(`New page opened: ${page.url()}`)
        // 新しいページにレスポンス監視リスナーを登録
        registerResponseListener(page)
      })
      .catch((error: unknown) => {
        console.error('Error getting page:', error)
      })
  }
}

/**
 * ブラウザ切断時のハンドラーを生成
 * @param browser - ブラウザインスタンス
 * @param restartIntervalId - 再起動タイマーのID
 * @param browserEventListeners - ブラウザのイベントリスナークリーンアップ関数配列
 * @returns ブラウザ切断イベントハンドラー
 */
function createDisconnectedHandler(
  browser: Browser,
  restartIntervalId: NodeJS.Timeout | null,
  browserEventListeners: (() => void)[]
) {
  return () => {
    console.log('Browser disconnected. Exiting process...')
    gracefulShutdown(
      'BROWSER_DISCONNECTED',
      browser,
      restartIntervalId,
      browserEventListeners
    ).catch((error: unknown) => {
      console.error('Error during disconnection shutdown:', error)
      throw error
    })
  }
}

/**
 * メイン処理
 * Puppeteerを使用してブラウザを起動し、レスポンス監視を開始する
 */
async function main() {
  // 画面サイズとブラウザパスの設定
  const [width, height] = ENVIRONMENT.VNC_SCREEN_SIZE.split('x').map(Number)
  const executablePath = ENVIRONMENT.CHROMIUM_PATH

  console.log(`Launching browser with executable path: ${executablePath}`)
  console.log(`Screen size: ${width}x${height}`)
  console.log(`User agent: ${ENVIRONMENT.BROWSER_USER_AGENT}`)
  console.log(`User data directory: ${ENVIRONMENT.USER_DATA_DIR}`)
  console.log(
    `Target URL regexes: ${ENVIRONMENT.TARGET_URL_REGEXS.map((regex) => regex.toString()).join(', ')}`
  )

  // Puppeteerの起動引数設定
  const puppeteerArguments = [
    // コアセキュリティ・サンドボックス設定
    '--no-sandbox',
    '--disable-setuid-sandbox',

    // メモリ最適化設定
    '--disable-dev-shm-usage',
    '--disable-site-isolation-trials',
    '--single-process',
    '--disable-renderer-backgrounding',
    '--disable-breakpad',
    '--disable-backing-store-limit',

    // パフォーマンス設定
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees,AudioServiceOutOfProcess',
    '--disable-notifications',
    '--mute-audio',

    // ブラウザの動作設定
    '--no-first-run',
    '--no-zygote',
    '--lang=ja',
    `--window-size=${width},${height}`,
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disk-cache-size=1',
  ]

  // 開発ツールの自動オープン設定
  const isOpenDevTools = process.env.OPEN_DEVTOOLS === 'true'
  if (isOpenDevTools) {
    puppeteerArguments.push('--auto-open-devtools-for-tabs')
  }

  const userDataDirectory = ENVIRONMENT.USER_DATA_DIR

  // ビューポートサイズの設定（環境変数で上書き可能）
  const viewportWidth = ENVIRONMENT.VIEWPORT_WIDTH ?? width
  const viewportHeight = ENVIRONMENT.VIEWPORT_HEIGHT ?? height

  // Puppeteerブラウザインスタンスの起動
  const browser = await puppeteer.launch({
    headless: false, // GUI表示モード
    executablePath,
    channel: 'chrome',
    args: puppeteerArguments,
    userDataDir: userDataDirectory,
    enableExtensions: true, // 拡張機能を有効化
    defaultViewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
  })

  // リソースのクリーンアップを管理する
  let restartIntervalId: NodeJS.Timeout | null = null
  const browserEventListeners: (() => void)[] = []

  // プロセス終了シグナルをリッスン
  process.on('SIGINT', () => {
    gracefulShutdown(
      'SIGINT',
      browser,
      restartIntervalId,
      browserEventListeners
    ).catch((error: unknown) => {
      console.error('Error during graceful shutdown:', error)
      throw error
    })
  })
  process.on('SIGTERM', () => {
    gracefulShutdown(
      'SIGTERM',
      browser,
      restartIntervalId,
      browserEventListeners
    ).catch((error: unknown) => {
      console.error('Error during graceful shutdown:', error)
      throw error
    })
  })

  // 定期的なブラウザの再起動設定
  if (ENVIRONMENT.RESTART_INTERVAL_SECONDS > 0) {
    restartIntervalId = setInterval(() => {
      console.log(
        `Restarting browser after ${ENVIRONMENT.RESTART_INTERVAL_SECONDS} seconds...`
      )
      gracefulShutdown(
        'RESTART_INTERVAL',
        browser,
        restartIntervalId,
        browserEventListeners
      ).catch((error: unknown) => {
        console.error('Error during restart:', error)
        throw error
      })
    }, ENVIRONMENT.RESTART_INTERVAL_SECONDS * 1000)
  }

  // 最初に存在するタブに対してレスポンス監視リスナーを登録
  const [initialPage] = await browser.pages()
  console.log(`Initial page opened: ${initialPage.url()}`)
  registerResponseListener(initialPage)

  // 新しいタブが開いた際のイベントリスナー設定
  const targetCreatedHandler = createTargetCreatedHandler()

  browser.on('targetcreated', targetCreatedHandler)
  browserEventListeners.push(() => {
    console.log('Removing target created handler')
    browser.off('targetcreated', targetCreatedHandler)
  })

  // ブラウザが切断された場合のハンドラー
  const disconnectedHandler = createDisconnectedHandler(
    browser,
    restartIntervalId,
    browserEventListeners
  )

  browser.on('disconnected', disconnectedHandler)
  browserEventListeners.push(() => {
    console.log('Removing disconnected handler')
    browser.off('disconnected', disconnectedHandler)
  })

  // 起動時URLの処理
  // 複数URLが指定されている場合、1つ目は既存タブで開き、残りは新しいタブで開く
  const startupUrls = ENVIRONMENT.STARTUP_URLS.split(',').map((url) =>
    url.trim()
  )
  if (startupUrls.length > 0) {
    const firstUrl = startupUrls[0]
    console.log(`Opening initial URL: ${firstUrl}`)
    try {
      await initialPage.goto(firstUrl, {
        waitUntil: 'networkidle2', // ネットワークが安定するまで待機
        timeout: 30_000,
      })
    } catch (error) {
      console.error(`Error opening initial URL ${firstUrl}:`, error)
    }
  }

  // 残りのURLは新しいタブで開く
  for (const url of startupUrls.slice(1)) {
    console.log(`Opening additional URL in new tab: ${url}`)
    try {
      const newPage = await browser.newPage()
      registerResponseListener(newPage)
      await newPage.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      })
    } catch (error) {
      console.error(`Error opening URL ${url}:`, error)
    }
  }
}

/**
 * アプリケーションエントリーポイント
 * メイン処理を実行し、エラーハンドリングを行う
 */
;(async () => {
  try {
    await main()
  } catch (error) {
    console.error('Error in main function:', error)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
})()
