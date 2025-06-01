import puppeteer, { Page, TargetType } from 'puppeteer-core'
import fs from 'node:fs'

const ENVIRONMENT = {
  VNC_SCREEN_SIZE: process.env.VNC_SCREEN_SIZE ?? '1024x768',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
  USER_DATA_DIR: process.env.VNC_USER_DATA_DIR ?? '/userdata',
  BROWSER_USER_AGENT:
    process.env.BROWSER_USER_AGENT ??
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
  TARGET_URL_REGEXS: process.env.TARGET_URL_REGEXS
    ? process.env.TARGET_URL_REGEXS.split(/[,\n]/).map(
        (regex) => new RegExp(regex.trim())
      )
    : [],
  STARTUP_URLS: process.env.STARTUP_URLS ?? '',
} as const

function registerResponseListener(page: Page) {
  page.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    const statusText = response.statusText()
    const method = response.request().method()
    const isTargetUrl = ENVIRONMENT.TARGET_URL_REGEXS.some((regex) =>
      regex.test(url)
    )
    if (!isTargetUrl) {
      return
    }

    // preflightリクエストは無視する
    if (response.request().method() === 'OPTIONS') {
      console.log(`Ignoring preflight request: ${url}`)
      return
    }

    console.log(
      `Response received: ${method} ${url} - Status: ${status} ${statusText}`
    )

    // ファイルに保存する
    // /responses/{domain}/{path}/{timestamp}.json
    // {domain}: jaoafa.com
    // {path}: /api/v1/jaoafacraft/players
    // {timestamp}: 1700000000000
    const urlObj = new URL(url)
    const domain = urlObj.hostname
    const pathname = urlObj.pathname.replace(/^\//, '') // パスの先頭のスラッシュを削除
    const path = pathname || '__root__' // パスが空の場合は 'root' とする
    const timestamp = Date.now()
    const directory = `/responses/${domain}/${path}/${method}/${timestamp}/`
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }

    const detailFilePath = `${directory}detail.json`
    const dataFilePath = `${directory}data.raw`
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
    // レスポンスの詳細を detail.json に保存
    fs.writeFileSync(
      detailFilePath,
      JSON.stringify(responseData, null, 2),
      'utf8'
    )

    // レスポンスのデータを data.raw に保存
    response
      .buffer()
      .then((buffer) => {
        fs.writeFileSync(dataFilePath, buffer)
        console.log(`Response data saved to: ${dataFilePath}`)
      })
      .catch((error: unknown) => {
        console.error('Error saving response data:', error)
      })
  })
}

async function main() {
  const [width, height] = ENVIRONMENT.VNC_SCREEN_SIZE.split('x').map(Number)
  const executablePath = ENVIRONMENT.CHROMIUM_PATH

  console.log(`Launching browser with executable path: ${executablePath}`)
  console.log(`Screen size: ${width}x${height}`)
  console.log(`User agent: ${ENVIRONMENT.BROWSER_USER_AGENT}`)
  console.log(`User data directory: ${ENVIRONMENT.USER_DATA_DIR}`)
  console.log(
    `Target URL regexes: ${ENVIRONMENT.TARGET_URL_REGEXS.map((regex) => regex.toString()).join(', ')}`
  )

  const puppeteerArguments = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--lang=ja',
    `--window-size=${width},${height}`,
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    '--auto-open-devtools-for-tabs',
  ]

  const userDataDirectory = ENVIRONMENT.USER_DATA_DIR

  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    channel: 'chrome',
    args: puppeteerArguments,
    userDataDir: userDataDirectory,
    enableExtensions: true,
  })

  // 最初に存在するタブに対してリスナーを登録
  const [initialPage] = await browser.pages()
  console.log(`Initial page opened: ${initialPage.url()}`)
  registerResponseListener(initialPage)

  // 新しいタブが開いたら、page.onでリスナーを追加
  browser.on('targetcreated', (target) => {
    console.log(`New target created: ${target.url()}`)
    if (target.type() !== TargetType.PAGE) {
      return
    }
    target
      .page()
      .then((page) => {
        if (!page) {
          return
        }

        console.log(`New page opened: ${page.url()}`)
        registerResponseListener(page)
      })
      .catch((error: unknown) => {
        console.error('Error getting page:', error)
      })
  })

  // 初期URLを開く。2つ以上のURLが指定されている場合は、タブを新規に開いてアクセス
  // 1つ目のURLは最初のタブで開く
  const startupUrls = ENVIRONMENT.STARTUP_URLS.split(',').map((url) =>
    url.trim()
  )
  if (startupUrls.length > 0) {
    const firstUrl = startupUrls[0]
    console.log(`Opening initial URL: ${firstUrl}`)
    await initialPage.goto(firstUrl, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    })
  }
  // 残りのURLは新しいタブで開く
  for (const url of startupUrls.slice(1)) {
    console.log(`Opening additional URL in new tab: ${url}`)
    const newPage = await browser.newPage()
    registerResponseListener(newPage)
    await newPage.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    })
  }
}

;(async () => {
  try {
    await main()
  } catch (error) {
    console.error('Error in main function:', error)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
})()
