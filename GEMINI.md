# Gemini CLI 作業方針

## 目的

このドキュメントは、Gemini CLI 向けのコンテキストと作業方針を定義します。

## 出力スタイル

- **言語**: 日本語
- **トーン**: 簡潔で明確な技術的コミュニケーション
- **形式**: マークダウン形式で構造化された出力

## 共通ルール

- 会話は日本語で行う。
- PR とコミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。ただし、`<description>` は日本語で記載する。
- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) に従う。ただし、`<type>` は短縮形（feat, fix）を使用する。
- 日本語と英数字の間には半角スペースを入れる。

## プロジェクト概要

- **プロジェクト名**: chrome-response-recorder
- **目的**: Puppeteer を用いた Chromium ブラウザの自動操作と HTTP レスポンスの記録・監視
- **主な機能**:
  - HTTP レスポンスの自動キャプチャと構造化ファイルシステム保存
  - ブラウザコンソールログの JSONL 形式での記録
  - Twitter 自動ログイン機能（ユーザー名・パスワード・OTP 対応）
  - Cookie エクスポート機能
  - VNC/noVNC による GUI 操作監視
- **ライセンス**: MIT

## コーディング規約

- **フォーマット**: Prettier 3.8.1 を使用
- **Lint**: ESLint 9.39.2 + `@book000/eslint-config` 1.12.40 を使用
- **命名規則**: キャメルケース（変数・関数）、パスカルケース（クラス・インターフェース）
- **コメント言語**: 日本語
- **エラーメッセージ言語**: 英語
- **TypeScript**: `skipLibCheck` での回避は禁止
- **docstring**: すべての関数・インターフェースに JSDoc を日本語で記載する

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

## 注意事項

### セキュリティ / 機密情報

- API キーや認証情報（`TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET` など）は環境変数で管理し、Git にコミットしない。
- ログに個人情報や認証情報を出力しない。
- センシティブな環境変数は Docker Compose または環境変数ファイル（`.env` など）で管理する。

### 既存ルールの優先

- プロジェクトに既存の ESLint、Prettier 設定がある場合は、それらを優先する。
- 既存のコーディングスタイルと一貫性を保つ。

### 既知の制約

- **pnpm 強制**: `preinstall` スクリプトで `only-allow pnpm` を実行し、npm/yarn の使用を防止している。
- **Docker 環境**: ベースイメージは `zenika/alpine-chrome:with-puppeteer-xvfb`。プロセス管理は supervisord。
- **テストフレームワーク**: 未実装（package.json に test スクリプトなし）
- **Renovate PR**: Renovate が作成した既存のプルリクエストに対して、追加コミットや更新を行ってはならない。

## リポジトリ固有

### 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js 24.13.0
- **パッケージマネージャー**: pnpm 10.28.1（強制）
- **主要な依存パッケージ**: puppeteer-core 24.35.0, tsx 4.21.0, otplib 13.1.1

### アーキテクチャ

- **エントリーポイント**: `src/main.ts`
- **アドオンシステム**: `src/addon/` 配下に抽象ベースクラス `BaseAddon` を継承したアドオンを配置
- **コンソールログ記録**: `src/console-logging.ts`

### 環境変数

プロジェクト固有の環境変数が多数存在する。詳細は `src/main.ts` の ENVIRONMENT オブジェクトを参照。

主要な環境変数：

- `VNC_SCREEN_SIZE` - VNC スクリーンサイズ（デフォルト: `1024x768`）
- `CHROMIUM_PATH` - Chromium 実行ファイルパス
- `TARGET_URL_REGEXS` - 監視対象 URL の正規表現
- `STARTUP_URLS` - 起動時に開く URL
- `ACTIVE_ADDONS` - 有効アドオン
- `TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET` - Twitter 認証情報
- `EXPORT_COOKIE_FILE_PATH` - Cookie エクスポートファイルパス
- `CONSOLE_LOG_DIR` - コンソールログ出力ディレクトリ

### Docker 環境

- ベースイメージ: `zenika/alpine-chrome:with-puppeteer-xvfb`
- タイムゾーン: Asia/Tokyo（固定）
- VNC Web UI: http://localhost:8080 (noVNC)
- VNC Protocol: localhost:5900 (x11vnc)

### 実装パターン

- **イベントリスナー管理**: WeakMap を使用したページごとのリスナー管理
- **グレースフルシャットダウン**: SIGINT/SIGTERM キャッチ + リソースクリーンアップ
- **アドオンパターン**: 抽象ベースクラス `BaseAddon` + register/unregister ライフサイクル
