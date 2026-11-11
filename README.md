# chrome-response-recorder

Runs a visible Chromium (driven by Puppeteer) inside a Docker container and records the HTTP responses whose URLs match configurable regular expressions. For every matching response it saves the metadata and the raw body to disk. It can also record the browser console, log in to Twitter/X automatically, and export cookies. The browser is shown over VNC (noVNC in the browser), so you can operate it by hand, for example to log in.

## Quick start

1. Create a `.env` file next to `compose.yaml` (the compose file requires it, even if empty) and set at least `EXPORT_COOKIE_FILE_PATH` (see [Configuration](#configuration)).
2. Start the container:

   ```bash
   docker compose up --build
   ```

3. Open <http://localhost:8080> to see and control the browser through noVNC.

`compose.yaml` builds the image from the `Dockerfile` and mounts these host directories:

| Host path | Container path | Purpose |
| --- | --- | --- |
| `./userdata` | `/userdata` | Chromium user data directory (profile, cookies, logins persist across restarts) |
| `./responses` | `/responses` | Recorded responses (see [Output](#output)) |
| `./downloads` | `/root/Downloads` | Browser downloads |
| `./extension` | `/extension` | Mounted read-only, but nothing in this repository loads it |

The sample `compose.yaml` publishes only port 8080 (noVNC). x11vnc listens on 5900 inside the container but runs without a password (`-nopw`), so do not expose either port to an untrusted network.

The `Docker` workflow builds the image with `book000/templates` and targets `ghcr.io/book000/chrome-response-recorder`.

## Configuration

All settings are environment variables. The container sets `TZ=Asia/Tokyo`, `CHROMIUM_PATH`, `VNC_SCREEN_SIZE` and `DISPLAY=:1` itself.

| Variable | Default | Description |
| --- | --- | --- |
| `TARGET_URL_REGEXS` | (empty) | Regular expressions, separated by commas or newlines. Only responses whose URL matches one of them are recorded. When empty, nothing is recorded. Because commas split the value, a regex cannot contain a comma |
| `STARTUP_URLS` | (empty) | Comma-separated URLs. The first opens in the initial tab, the others in new tabs |
| `VNC_SCREEN_SIZE` | `1024x768` | Screen size as `{width}x{height}`; also the window size and the default viewport |
| `VIEWPORT_WIDTH`, `VIEWPORT_HEIGHT` | screen size | Override the viewport size in pixels |
| `VNC_USER_DATA_DIR` | `/userdata` | Chromium user data directory |
| `CHROMIUM_PATH` | `/usr/bin/chromium-browser` | Chromium executable |
| `BROWSER_USER_AGENT` | an old Chrome 58 string | User-Agent string defined in `src/main.ts` |
| `RESTART_INTERVAL_SECONDS` | `0` (disabled) | After this many seconds the process shuts the browser down and exits, and supervisord starts it again |
| `OPEN_DEVTOOLS` | `false` | `true` opens DevTools for every tab |
| `CONSOLE_LOG_DIR` | (unset) | Directory for browser console logs. When unset, console logging is skipped |
| `ACTIVE_ADDONS` | (empty) | Comma-separated addon names to enable, case-insensitive: `TwitterLogin`, `ExportCookie` |
| `TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_EMAIL_ADDRESS`, `TWITTER_OTP_SECRET` | (unset) | Credentials for the `TwitterLogin` addon. The email address and the OTP secret are used only when the login flow asks for them |
| `EXPORT_COOKIE_FILE_PATH` | (unset) | Output file of the `ExportCookie` addon. **Required in practice:** every addon is constructed at startup, and `ExportCookie` throws when this is unset, even if the addon is not enabled |

Example `.env`:

```env
EXPORT_COOKIE_FILE_PATH=/userdata/cookies.json
CONSOLE_LOG_DIR=/responses/console
ACTIVE_ADDONS=TwitterLogin
TWITTER_USERNAME=your-username
TWITTER_PASSWORD=your-password
```

Keep credentials in `.env` (git-ignored) and never commit them.

## Addons

| Name | Behavior |
| --- | --- |
| `TwitterLogin` | Polls the page URL every second. On `https://x.com/i/flow/login` it types the username, the email address (if asked), the password and an OTP code generated from `TWITTER_OTP_SECRET` (if asked). It depends on Twitter's current page markup and may break when that changes |
| `ExportCookie` | When registered on a page, writes all browser cookies to `EXPORT_COOKIE_FILE_PATH` as JSON |

## Output

### Responses

Saved under the fixed path `/responses` inside the container:

```
/responses/{domain}/{path}/{method}/{timestamp}/
├── detail.json   # url, status, statusText, response headers, timing, request method/headers/postData
└── data.raw      # response body (binary)
```

- `{path}` is the URL path without the leading slash, or `__root__` for an empty path. The query string is not part of the path.
- `{timestamp}` is `Date.now()` in milliseconds. If a directory for the same domain, path, method and millisecond already exists, a numeric suffix is added: `{timestamp}-1`, `{timestamp}-2`, and so on.
- CORS preflight (`OPTIONS`) requests are ignored.

### Console logs

When `CONSOLE_LOG_DIR` is set, each page's console messages, page errors, failed requests and `Runtime.consoleAPICalled` events are appended as JSON Lines to `{CONSOLE_LOG_DIR}/{domain}/{path}/{timestamp}.jsonl`. Each line has `timestamp`, `eventName` (`console`, `pageerror`, `requestfailed` or `consoleApiCalled`), `type`, `message` and `extra`. Here `{timestamp}` is when logging for the page started.

## Development

Requires the Node.js version in `.node-version` and pnpm (other package managers are rejected by `preinstall`).

```bash
pnpm install
pnpm test     # node:test via tsx
pnpm lint     # prettier --check, eslint and tsc
pnpm fix      # prettier --write and eslint --fix
pnpm dev      # run src/main.ts with tsx watch
```

Running `pnpm start` outside the container needs a Chromium at `CHROMIUM_PATH`, a display, and writable `/responses` and `/userdata` directories.

## License

MIT
