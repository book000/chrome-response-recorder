# AI エージェント共通作業方針

## 目的

このドキュメントは、AI エージェント共通の作業方針を定義します。

## 基本方針

- **会話言語**: 日本語
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語
- **日本語と英数字の間**: 半角スペースを挿入
- **コミットメッセージ**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。`<description>` は日本語。
- **ブランチ命名**: [Conventional Branch](https://conventional-branch.github.io) に従う。`<type>` は短縮形（feat, fix）。

## 判断記録のルール

判断は必ずレビュー可能な形で記録すること：

1. 判断内容の要約を記載する
2. 検討した代替案を列挙する
3. 採用しなかった案とその理由を明記する
4. 前提条件・仮定・不確実性を明示する
5. 他エージェントによるレビュー可否を示す

**重要**: 前提・仮定・不確実性を明示し、仮定を事実のように扱ってはならない。

## 開発手順（概要）

1. **プロジェクト理解**: リポジトリの構造と技術スタックを理解する
2. **依存関係インストール**: `pnpm install` で依存パッケージをインストールする
3. **変更実装**: 要件に従ってコードを変更する
4. **テストと Lint/Format 実行**: `pnpm lint` でコード品質を確認し、`pnpm fix` で自動整形する
5. **コミット**: Conventional Commits に従ってコミットを作成する

## セキュリティ / 機密情報

- API キーや認証情報は環境変数で管理し、Git にコミットしない。
- ログに個人情報や認証情報を出力しない。
- センシティブな環境変数（`TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_OTP_SECRET` など）は Docker Compose または環境変数ファイル（`.env` など）で管理する。

## リポジトリ固有

### プロジェクト概要

- **プロジェクト名**: chrome-response-recorder
- **目的**: Puppeteer を用いた Chromium ブラウザの自動操作と HTTP レスポンスの記録・監視
- **ライセンス**: MIT

### 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js 24.13.0
- **パッケージマネージャー**: pnpm 10.28.1（強制）
- **主要な依存パッケージ**: puppeteer-core, tsx, otplib

### 開発コマンド

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

### コーディング規約

- **TypeScript**: `skipLibCheck` での回避は禁止
- **docstring**: すべての関数・インターフェースに JSDoc を日本語で記載する

### Docker 環境

- ベースイメージ: `zenika/alpine-chrome:with-puppeteer-xvfb`
- タイムゾーン: Asia/Tokyo（固定）
- VNC Web UI: http://localhost:8080 (noVNC)

### 環境変数

プロジェクト固有の環境変数が多数存在する。詳細は `src/main.ts` の ENVIRONMENT オブジェクトを参照。

### Renovate PR

Renovate が作成した既存のプルリクエストに対して、追加コミットや更新を行ってはならない。
