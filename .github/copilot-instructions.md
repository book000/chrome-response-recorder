# GitHub Copilot Instructions

GitHub Copilot によるコードレビュー向けの指示。このリポジトリの変更をレビューする際に
重点的に確認すべき観点を示す。開発作業全体の方針は `CLAUDE.md` を参照。

## プロジェクト概要

Puppeteer (puppeteer-core) を用いて Chromium を自動操作し、HTTP レスポンスやブラウザ
コンソールログを構造化ファイルとして記録・監視する TypeScript / Node.js アプリケーション。
Docker (VNC/noVNC + supervisord) 上での常駐実行を前提とする。

## レビュー時の言語・記述規約

- コード内コメントと JSDoc は日本語。エラーメッセージは英語。
- 日本語と英数字の間には半角スペースを入れる。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  に従う（`<description>` は日本語）。この規約から外れた PR タイトル・コミットは指摘する。
- すべての関数・インターフェースに JSDoc（日本語）があること。追加・変更された関数に
  JSDoc が欠けている場合は指摘する。

## 重点確認ポイント

- **非同期エラーハンドリング**: Puppeteer の target/page 操作は非同期で失敗しうる。
  `await` 漏れや `.catch()` の欠落、try/catch なしの await を指摘する。エラーは
  `error instanceof Error ? error : new Error(String(error))` で正規化する慣習に従っているか。
- **イベントリスナーのクリーンアップ**: ページごとのリスナーは WeakMap で管理し、
  ページクローズ時に確実に解除する。リスナー登録に対応する解除処理が無い変更（ページ
  リーク）を指摘する。
- **タイムアウト**: `waitForSelector` など待機系 API はタイムアウト指定必須。無制限待機を指摘する。
- **グレースフルシャットダウン**: SIGINT/SIGTERM 時のリソース解放漏れを指摘する。
- **型検査の回避禁止**: `skipLibCheck` の有効化や `@ts-ignore` / `any` による型エラー握り
  つぶしは指摘する（`tsc` は strict でレビュー・CI 対象）。

## セキュリティ

- 認証情報（`TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET`, Cookie など）を
  ソースコードやログにハードコード・出力していないか。これらは環境変数で管理する。
- ログや保存ファイルに個人情報・認証情報が混入していないか。

## 誤検知しやすい既知パターン（フラグ不要）

- `--no-sandbox` / `--disable-setuid-sandbox` などの Puppeteer 起動引数は、コンテナ内
  実行のため意図的に付与している。セキュリティ上の指摘として挙げない。
- テストフレームワークは未導入。品質保証は Lint（Prettier + ESLint）と `tsc` 型チェックで
  行う。「テストが無い」ことを一律に指摘しない。
- パッケージマネージャは pnpm のみ（`preinstall` の `only-allow pnpm` で強制）。npm/yarn の
  利用を提案しない。
- 依存パッケージのバージョンは Renovate が自動更新する。バージョン固定に関する一般的な
  指摘は不要。

## 補足

- Lint/Format は `@book000/eslint-config` ベースの ESLint と Prettier で強制される。
  スタイル面の細かな指摘より、上記の設計・安全性の観点を優先する。
- 具体的な依存バージョンやアーキテクチャ詳細は陳腐化を避けるためここには固定しない。
  `package.json` および `CLAUDE.md` を参照。
