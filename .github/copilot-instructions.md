# GitHub Copilot Instructions

Review checklist for this repository. Development guidance is in `AGENTS.md`; usage and configuration are in `README.md`.

## Language

- Deliverables (commits, PR text, review comments, code comments, JSDoc, docs) are in English; runtime messages are English. Flag non-English text, except quotations, technical identifiers, generated files and external text.
- Commit messages follow Conventional Commits.

## Review focus

- Async errors: missing `await` or `.catch()`, unhandled rejections in Puppeteer listeners.
- Listener cleanup: every listener registered on a page is removed on close (`appendPageCleanup`).
- Timeouts: waits such as `waitForSelector` must have a timeout.
- Shutdown: resources are released on SIGINT/SIGTERM.
- Type safety: no `skipLibCheck`, `@ts-ignore` or new `any` to silence errors.
- Secrets: no credentials, OTP secrets or cookies hard-coded or logged.
- Docs: new environment variables are added to the `ENVIRONMENT` object and to `README.md`.

## Known non-issues

- Chromium flags `--no-sandbox` and `--disable-setuid-sandbox` are intentional for container execution.
- pnpm is the only package manager (`only-allow pnpm`); dependency versions are updated by Renovate.
