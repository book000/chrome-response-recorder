# GitHub Copilot Instructions

## プロジェクト概要

- **目的**: Puppeteer を用いた Chromium ブラウザの自動操作と HTTP レスポンスの記録・監視
- **主な機能**:
  - HTTP レスポンスの自動キャプチャと構造化ファイルシステム保存
  - ブラウザコンソールログの JSONL 形式での記録
  - Twitter 自動ログイン機能（ユーザー名・パスワード・ OTP 対応）
  - Cookie エクスポート機能
  - 複数 URL の同時ブラウジング対応
  - VNC/noVNC による GUI 操作監視
- **対象ユーザー**: 開発者、テスター、HTTP トラフィック監視を必要とするユーザー
- **ライセンス**: MIT

## 共通ルール

- 会話は日本語で行う。
- PR とコミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。ただし、`<description>` は日本語で記載する。
- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) に従う。ただし、`<type>` は短縮形（feat, fix）を使用する。
- 日本語と英数字の間には半角スペースを入れる。

## 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js 24.13.0
- **パッケージマネージャー**: pnpm 10.28.1（強制）
- **主要な依存パッケージ**:
  - `puppeteer-core` 24.35.0 - ブラウザ自動化
  - `tsx` 4.21.0 - TypeScript 実行
  - `otplib` 13.1.1 - OTP（One-Time Password）生成
- **Docker**: イメージベースは `zenika/alpine-chrome:with-puppeteer-xvfb`
- **プロセス管理**: supervisord（Xvfb, x11vnc, noVNC, app）

## コーディング規約

- **コメント**: 日本語で記載する
- **エラーメッセージ**: 英語で記載する
- **フォーマット**: Prettier 3.8.1 を使用
- **Lint**: ESLint 9.39.2 + `@book000/eslint-config` 1.12.40 を使用
- **TypeScript**: `skipLibCheck` での回避は禁止
- **docstring**: すべての関数・インターフェースに JSDoc を日本語で記載・更新する

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

## テスト方針

- **テストフレームワーク**: 未実装（package.json に test スクリプトなし）
- **品質保証方法**:
  - Lint（ESLint + Prettier）によるコード品質管理
  - TypeScript 型チェック（strict mode）
  - GitHub Renovate による依存パッケージ自動更新
- **CI/CD**:
  - Node.js ビルド・Lint チェック（GitHub Actions のリユーザブルワークフロー）
  - Docker ビルドテスト（別ワークフロー）

## セキュリティ / 機密情報

- API キーや認証情報（`TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET` など）は環境変数で管理し、Git にコミットしない。
- ログに個人情報や認証情報を出力しない。
- センシティブな環境変数は Docker Compose または環境変数ファイル（`.env` など）で管理する。

## ドキュメント更新

機能追加・変更時には以下のドキュメントを更新する：

- `README.md` - 機能説明、使用方法
- `package.json` - scripts、dependencies の変更
- JSDoc コメント - 関数・インターフェースの変更

## リポジトリ固有

- **pnpm 強制**: `preinstall` スクリプトで `only-allow pnpm` を実行し、npm/yarn の使用を防止している。
- **Docker 環境**:
  - ベースイメージ: `zenika/alpine-chrome:with-puppeteer-xvfb`
  - タイムゾーン: Asia/Tokyo（固定）
  - VNC Web UI: http://localhost:8080 (noVNC)
  - VNC Protocol: localhost:5900 (x11vnc)
- **環境変数**: プロジェクト固有の環境変数が多数存在する（`VNC_SCREEN_SIZE`, `CHROMIUM_PATH`, `TARGET_URL_REGEXS`, `STARTUP_URLS`, `ACTIVE_ADDONS` など）。詳細は `src/main.ts` を参照。
- **アドオンパターン**: 抽象ベースクラス `BaseAddon` を継承してアドオンを実装する（`src/addon/` 配下）。
- **イベントリスナー管理**: WeakMap を使用したページごとのリスナー管理とクリーンアップを実施する。
- **Renovate PR**: Renovate が作成した PR に対して、追加コミットや更新を行ってはならない。
