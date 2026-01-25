# Claude Code 作業方針

## 目的

このドキュメントは、Claude Code がこのプロジェクトで作業を行う際の方針とプロジェクト固有のルールを示します。

## 判断記録のルール

判断は必ずレビュー可能な形で記録すること：

1. 判断内容の要約を記載する
2. 検討した代替案を列挙する
3. 採用しなかった案とその理由を明記する
4. 前提条件・仮定・不確実性を明示する
5. 他エージェントによるレビュー可否を示す

**重要**: 前提・仮定・不確実性を明示し、仮定を事実のように扱ってはならない。

## プロジェクト概要

- **プロジェクト名**: chrome-response-recorder
- **目的**: Puppeteer を用いた Chromium ブラウザの自動操作と HTTP レスポンスの記録・監視
- **主な機能**:
  - HTTP レスポンスの自動キャプチャと構造化ファイルシステム保存（detail.json + data.raw）
  - ブラウザコンソールログの JSONL 形式での記録
  - Twitter 自動ログイン機能（ユーザー名・パスワード・ OTP 対応）
  - Cookie エクスポート機能
  - 複数 URL の同時ブラウジング対応
  - グレースフルシャットダウン処理（SIGINT/SIGTERM）
  - 定期的なブラウザ再起動機能
  - VNC/noVNC による GUI 操作監視
- **ライセンス**: MIT

## 重要ルール

- **会話言語**: 日本語（途中経過は主要・重要なところ以外は英語で説明可能）
- **コード内コメント**: 日本語
- **エラーメッセージ**: 原則英語
- **日本語と英数字の間**: 半角スペースを挿入
- **コミットメッセージ**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。`<description>` は日本語。
- **ブランチ命名**: [Conventional Branch](https://conventional-branch.github.io) に従う。`<type>` は短縮形（feat, fix）。

## 環境のルール

- **Git Bash 環境**: Windows 環境だが Git Bash で動作。bash コマンドを使用する。PowerShell コマンドを使用する場合は、明示的に `powershell -Command ...` か `pwsh -Command ...` を使用する。
- **GitHub リポジトリ調査**: 調査のために参照する場合、テンポラリディレクトリに git clone して、そこでコード検索する。
- **Renovate PR**: Renovate が作成した既存のプルリクエストに対して、追加コミットや更新を行ってはならない。

## Git Worktree

このプロジェクトでは、Git Worktree は使用していません。通常のブランチ運用を行います。

## コード改修時のルール

- 日本語と英数字の間には、半角スペースを挿入しなければならない。
- 既存のエラーメッセージで、先頭に絵文字がある場合は、全体でエラーメッセージに絵文字を設定する。絵文字はエラーメッセージに即した一文字の絵文字である必要がある。
- TypeScript プロジェクトにおいて、`skipLibCheck` を有効にして回避することは絶対にしてはならない。
- 関数やインターフェースには、docstring（JSDoc など）を記載・更新する。日本語で記載する必要がある。

## 相談ルール

Codex CLI や Gemini CLI の他エージェントに相談することができる。以下の観点で使い分ける：

- **Codex CLI (ask-codex)**:
  - 実装コードに対するソースコードレビュー
  - 関数設計、モジュール内部の実装方針などの局所的な技術判断
  - アーキテクチャ、モジュール間契約、パフォーマンス／セキュリティといった全体影響の判断
  - 実装の正当性確認、機械的ミスの検出、既存コードとの整合性確認
- **Gemini CLI (ask-gemini)**:
  - SaaS 仕様、言語・ランタイムのバージョン差、料金・制限・クォータといった、最新の適切な情報が必要な外部依存の判断
  - 外部一次情報の確認、最新仕様の調査、外部前提条件の検証

他エージェントが指摘・異議を提示した場合、Claude Code は必ず以下のいずれかを行う。**黙殺・無言での不採用は禁止する**。

- 指摘を受け入れ、判断を修正する
- 指摘を退け、その理由を明示する

以下は必ず実施する：

- 他エージェントの提案を鵜呑みにせず、その根拠や理由を理解する
- 自身の分析結果と他エージェントの意見が異なる場合は、双方の視点を比較検討する
- 最終的な判断は、両者の意見を総合的に評価した上で、自身で下す

## 開発コマンド

```bash
# 依存関係のインストール（必ず pnpm を使用）
pnpm install

# 開発（ホットリロード対応）
pnpm dev

# 本番実行
pnpm start

# Lint チェック（Prettier + ESLint + TypeScript 型チェック）
pnpm lint

# 自動整形（Prettier + ESLint --fix）
pnpm fix
```

## アーキテクチャと主要ファイル

### アーキテクチャサマリー

- **エントリーポイント**: `src/main.ts`
- **アドオンシステム**: `src/addon/` 配下に抽象ベースクラス `BaseAddon` を継承したアドオンを配置
- **コンソールログ記録**: `src/console-logging.ts`
- **イベントリスナー管理**: WeakMap を使用したページごとのリスナー管理

### 主要ファイル

| ファイル | 目的 |
|---------|------|
| `src/main.ts` | Puppeteer ブラウザ初期化、イベントリスナー登録、HTTP レスポンス監視、グレースフルシャットダウン |
| `src/console-logging.ts` | ブラウザコンソール出力を JSONL 形式で記録（ページ毎のタイムスタンプ付きログディレクトリ） |
| `src/addon/index.ts` | BaseAddon 抽象クラス定義 |
| `src/addon/twitter-login.ts` | Twitter ログインフロー自動化（セレクタベースの要素待機・入力） |
| `src/addon/export-cookie.ts` | ブラウザ Cookie を JSON ファイルにエクスポート |

### 主要ディレクトリ

```
src/
├── main.ts                 # エントリーポイント
├── console-logging.ts      # コンソールログ記録
└── addon/                  # アドオンシステム
    ├── index.ts            # BaseAddon 抽象クラス
    ├── twitter-login.ts    # Twitter 自動ログイン
    └── export-cookie.ts    # Cookie エクスポート
```

## 実装パターン

### 推奨パターン

1. **イベントリスナークリーンアップ**: WeakMap を使用したページごとのリスナー管理

   ```typescript
   const pageEventListeners = new WeakMap<Page, Set<() => void | Promise<void>>>()
   appendPageCleanup(page, cleanup1, cleanup2, ...)
   ```

2. **グレースフルシャットダウン**: SIGINT/SIGTERM キャッチ + リソースクリーンアップ

   ```typescript
   process.on('SIGINT', () => gracefulShutdown(...))
   ```

3. **エラーハンドリング**: async/await + try/catch + エラー正規化

   ```typescript
   try {
     const result = cleanup()
     if (result instanceof Promise) await result
   } catch (error) {
     const normalizedError = error instanceof Error ? error : new Error(String(error))
     console.error(..., normalizedError)
   }
   ```

4. **アドオンパターン**: 抽象ベースクラス + register/unregister ライフサイクル

   ```typescript
   export abstract class BaseAddon {
     abstract register(page: Page): void | Promise<void>
     abstract unregister(page: Page): void | Promise<void>
   }
   ```

5. **ストリーム書き込み**: タイムアウト付きの安全な writeStream 処理

   ```typescript
   const timeout = setTimeout(() => cleanup(error), 30_000)
   writeStream.on('finish', () => { clearTimeout(timeout); cleanup() })
   ```

6. **コンソールログ構造化**: タイムスタンプ + イベント型 + JSONL 形式

   ```typescript
   const log = {
     timestamp: new Date().toISOString(),
     eventName: 'console' | 'pageerror' | 'requestfailed' | 'consoleApiCalled',
     type: string,
     message: string,
     extra: Record<string, any>
   }
   ```

### 非推奨パターン

1. ❌ **skipLibCheck の有効化**: 型検証は必ず実施する
2. ❌ **グローバル変数の過度な使用**: 環境変数への参照は ENVIRONMENT オブジェクト化を推奨
3. ❌ **非同期処理の火起こし忘れ**: `.catch()` で必ずエラーハンドリング（Puppeteer の target/page 操作は非同期）
4. ❌ **ページリーク**: ページクローズ時に必ずイベントリスナーをクリーンアップ
5. ❌ **タイムアウトなしの長時間待機**: `waitForSelector` 等は常にタイムアウト指定

## テスト

### テスト方針

- **テストフレームワーク**: 未実装（package.json に test スクリプトなし）
- **品質保証方法**:
  - Lint（ESLint + Prettier）によるコード品質管理
  - TypeScript 型チェック（strict mode）
  - GitHub Renovate による依存パッケージ自動更新
- **CI/CD**:
  - Node.js ビルド・Lint チェック（GitHub Actions のリユーザブルワークフロー）
  - Docker ビルドテスト（別ワークフロー）

### 追加テスト条件

機能追加時には、以下のテストを手動で実施することを推奨する：

- ブラウザの起動とシャットダウンが正常に動作すること
- HTTP レスポンスの記録が正しく保存されること
- アドオンの register/unregister が正しく動作すること
- グレースフルシャットダウンが正常に動作すること

## ドキュメント更新ルール

### 更新対象

- `README.md` - 機能説明、使用方法
- `package.json` - scripts、dependencies の変更
- JSDoc コメント - 関数・インターフェースの変更
- 環境変数の追加・変更があった場合は、`src/main.ts` のコメントを更新

### 更新タイミング

- 機能追加・変更時
- API 変更時
- 環境変数の追加・変更時

## 作業チェックリスト

### 新規改修時

1. プロジェクトについて詳細に探索し理解すること
2. 作業を行うブランチが適切であること。すでに PR を提出しクローズされたブランチでないこと
3. 最新のリモートブランチに基づいた新規ブランチであること
4. PR がクローズされ、不要となったブランチは削除されていること
5. プロジェクトで指定されたパッケージマネージャ（pnpm）により、依存パッケージをインストールしたこと

### コミット・プッシュする前

1. コミットメッセージが [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従っていること。ただし、`<description>` は日本語で記載する
2. コミット内容にセンシティブな情報が含まれていないこと
3. Lint / Format エラーが発生しないこと（`pnpm lint` で確認）
4. 動作確認を行い、期待通り動作すること

### プルリクエストを作成する前

1. プルリクエストの作成をユーザーから依頼されていること
2. コミット内容にセンシティブな情報が含まれていないこと
3. コンフリクトする恐れが無いこと

### プルリクエストを作成したあと

プルリクエストを作成したあとは、以下を必ず実施する。PR 作成後のプッシュ時に毎回実施する。時間がかかる処理が多いため、Task を使って並列実行する。

1. コンフリクトが発生していないこと
2. PR 本文の内容は、ブランチの現在の状態を、今までのこの PR での更新履歴を含むことなく、最新の状態のみ、漏れなく日本語で記載されていること。この PR を見たユーザーが、最終的にどのような変更を含む PR なのかをわかりやすく、細かく記載されていること
3. `gh pr checks <PR ID> --watch` で GitHub Actions CI を待ち、その結果がエラーとなっていないこと。成功している場合でも、ログを確認し、誤って成功扱いになっていないこと。もし GitHub Actions が動作しない場合は、ローカルで CI と同等のテストを行い、CI が成功することを保証しなければならない
4. `request-review-copilot` コマンドが存在する場合、`request-review-copilot https://github.com/$OWNER/$REPO/pull/$PR_NUMBER` で GitHub Copilot へレビューを依頼すること。レビュー依頼は自動で行われる場合もあるし、制約により `request-review-copilot` を実行しても GitHub Copilot がレビューしないケースがある
5. 10 分以内に投稿される GitHub Copilot レビューへの対応を行うこと。対応したら、レビューコメントそれぞれに対して返信を行うこと。レビュアーに GitHub Copilot がアサインされていない場合はスキップして構わない
6. `/code-review:code-review` によるコードレビューを実施したこと。コードレビュー内容に対しては、**スコアが 50 以上の指摘事項** に対して対応する（80 がボーダーラインではない）

## リポジトリ固有

### pnpm 強制

`preinstall` スクリプトで `only-allow pnpm` を実行し、npm/yarn の使用を防止している。

### Docker 環境

- ベースイメージ: `zenika/alpine-chrome:with-puppeteer-xvfb`
- プロセス管理: supervisord で 4 プロセス管理（xvfb, x11vnc, novnc, app）
- タイムゾーン: Asia/Tokyo（固定）
- VNC Web UI: http://localhost:8080 (noVNC)
- VNC Protocol: localhost:5900 (x11vnc)

### 環境変数

プロジェクト固有の環境変数が多数存在する。詳細は `src/main.ts` の ENVIRONMENT オブジェクトを参照。

主要な環境変数：

- `VNC_SCREEN_SIZE` - VNC スクリーンサイズ（デフォルト: `1024x768`）
- `CHROMIUM_PATH` - Chromium 実行ファイルパス（デフォルト: `/usr/bin/chromium-browser`）
- `VNC_USER_DATA_DIR` - ブラウザユーザーデータディレクトリ（デフォルト: `/userdata`）
- `BROWSER_USER_AGENT` - カスタム User-Agent
- `TARGET_URL_REGEXS` - 監視対象 URL の正規表現（カンマ/改行区切り）
- `STARTUP_URLS` - 起動時に開く URL（カンマ区切り）
- `RESTART_INTERVAL_SECONDS` - ブラウザ自動再起動間隔（0=無効）
- `ACTIVE_ADDONS` - 有効アドオン（カンマ区切り）
- `TWITTER_USERNAME` - Twitter ユーザー名
- `TWITTER_PASSWORD` - Twitter パスワード
- `TWITTER_EMAIL_ADDRESS` - Twitter メールアドレス
- `TWITTER_OTP_SECRET` - Twitter OTP シークレット
- `EXPORT_COOKIE_FILE_PATH` - Cookie エクスポートファイルパス
- `OPEN_DEVTOOLS` - 開発ツール自動オープン（デフォルト: `false`）
- `CONSOLE_LOG_DIR` - コンソールログ出力ディレクトリ

### セキュリティ

- API キーや認証情報（`TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET` など）は環境変数で管理し、Git にコミットしない。
- ログに個人情報や認証情報を出力しない。

### 保存ディレクトリ構造

- **レスポンス**: `/responses/{domain}/{path}/{method}/{timestamp}/`
  - `detail.json` - レスポンスメタデータ（ステータス、ヘッダ、タイミング）
  - `data.raw` - レスポンスボディ（バイナリ）
- **コンソールログ**: `{CONSOLE_LOG_DIR}/{domain}/{path}/{timestamp}.jsonl`

### Puppeteer 起動引数

- `--no-sandbox --disable-setuid-sandbox` - サンドボックス無効化
- `--disable-dev-shm-usage` - メモリ効率化
- `--disable-breakpad` - クラッシュレポート無効
- `--disable-backing-store-limit` - バッキングストア制限解除
- `--disable-accelerated-2d-canvas` - GPU アクセラレーション無効
- `--mute-audio` - オーディオミュート
- `--lang=ja` - 日本語ロケール
