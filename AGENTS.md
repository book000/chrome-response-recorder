# AGENTS.md

Guidance for AI coding agents and contributors. `CLAUDE.md` imports this file, and `.github/copilot-instructions.md` adds the review checklist.

## Language

- All deliverables are written in **English**: commit messages, PR/Issue titles and bodies, review comments, code comments and docstrings, and documentation (`README.md`, `AGENTS.md`, etc.).
- Exceptions (keep as is): quotations, technical identifiers, generated files, and external source text.
- Runtime messages (logs, errors) are English.
- Do not rewrite Git history to change the language of past commits.

## Overview

A TypeScript / Node.js app that drives a visible Chromium through `puppeteer-core` inside a Docker container (Xvfb + x11vnc + noVNC, managed by supervisord). It records HTTP responses matching `TARGET_URL_REGEXS` to `/responses/{domain}/{path}/{method}/{timestamp}/` (`detail.json` + `data.raw`) and optionally records console logs as JSONL. Addons add Twitter auto-login and cookie export. Usage and configuration are documented in `README.md`.

## Commands

```bash
pnpm install   # install dependencies (only pnpm is allowed by preinstall)
pnpm dev       # tsx watch src/main.ts
pnpm start     # tsx src/main.ts
pnpm test      # node:test via tsx (src/response-directory.test.ts only)
pnpm lint      # prettier --check + eslint + tsc
pnpm fix       # prettier --write + eslint --fix
```

Run `pnpm lint` and `pnpm test` before committing. Node.js is pinned in `.node-version` and pnpm in `package.json`. CI (`nodejs-ci-pnpm.yml`, `docker.yml`) uses reusable workflows from `book000/templates`.

## Structure

- `src/main.ts`: entry point and the `ENVIRONMENT` object (all environment variables), browser launch, response recording, shutdown handling
- `src/response-directory.ts`: exclusive creation of the per-response directory (numeric suffix on same-millisecond collisions); tested in `src/response-directory.test.ts`
- `src/console-logging.ts`: `ConsoleLogging`, JSONL console logs
- `src/addon/`: `BaseAddon` (`index.ts`), `TwitterLoginAddon`, `ExportCookieAddon`
- `Dockerfile`, `entrypoint.sh`, `supervisord.conf`, `compose.yaml`: container setup

## Conventions

- Add environment variables to the `ENVIRONMENT` object in `src/main.ts` and document them in `README.md`.
- Per-page cleanup functions go through `appendPageCleanup` (a `WeakMap` keyed by page) so listeners are removed when the page closes or on shutdown.
- Event listeners that Puppeteer expects to return `void` start async work in an IIFE with try/catch; never leave a rejection unhandled.
- Always pass a timeout to `waitForSelector` and similar waits.
- Normalize caught errors with `error instanceof Error ? error : new Error(String(error))` before logging.
- Do not enable `skipLibCheck` in `tsconfig.json`, and avoid `any`.
- Write JSDoc for functions and interfaces.
- Add a `*.test.ts` next to code with testable logic (`node:test`).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/); branches follow [Conventional Branch](https://conventional-branch.github.io) short form (`feat/...`, `fix/...`).
- Do not commit to Renovate PRs. Never commit secrets (Twitter credentials, OTP secret, cookies) and never log them.
- Chromium launch flags such as `--no-sandbox` are intentional (the browser runs as root in a container).
