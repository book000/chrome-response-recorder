# GEMINI.md

## 目的
- Gemini CLI 向けのコンテキストと作業方針を定義する。

## 出力スタイル
- 言語: 日本語
- トーン: 簡潔で事実ベース
- 形式: Markdown

## 共通ルール
- 会話は日本語で行う。
- PR とコミットは Conventional Commits に従う。
- PR タイトルとコミット本文の言語: PR タイトルは Conventional Commits 形式（英語推奨）。PR 本文は日本語。コミットは Conventional Commits 形式（description は日本語）。
- 日本語と英数字の間には半角スペースを入れる。

## プロジェクト概要
Records HTTP responses using Puppeteer to interact with Chrome browser. Useful for capturing network responses and automating browser tasks with OTP support.

### 技術スタック
- **言語**: TypeScript
- **フレームワーク**: Puppeteer, tsx
- **パッケージマネージャー**: pnpm@10.28.1
- **主要な依存関係**:
  - production:
    - puppeteer-core@24.35.0
    - tsx@4.21.0
    - otplib@13.1.1
  - development:
    - @book000/eslint-config@1.12.40
    - @types/node@24.10.9
    - typescript@5.9.3
    - prettier@3.8.0
    - run-z@2.1.0

## コーディング規約
- フォーマット: 既存設定（ESLint / Prettier / formatter）に従う。
- 命名規則: 既存のコード規約に従う。
- コメント言語: 日本語
- エラーメッセージ: 英語

### 開発コマンド
```bash
# dev
tsx watch ./src/main.ts

# start
tsx ./src/main.ts

# lint
run-z lint:prettier,lint:eslint,lint:tsc

# fix
run-z fix:prettier fix:eslint

```

## 注意事項
- 認証情報やトークンはコミットしない。
- ログに機密情報を出力しない。
- 既存のプロジェクトルールがある場合はそれを優先する。

## リポジトリ固有
- **type**: CLI Tool
- **entry_point**: src/main.ts
**features:**
  - OTP support (otplib)
  - Console logging utilities
  - Browser addons (cookie export, Twitter login)
- **output**: dist/main.js
- **note**: Compiled TypeScript with source maps and declaration files