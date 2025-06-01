FROM zenika/alpine-chrome:with-puppeteer-xvfb AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"

# hadolint ignore=DL3002
USER root

# hadolint ignore=DL3018,DL3016
RUN apk upgrade --no-cache --available && \
  apk update && \
  apk add --update --no-cache tzdata x11vnc && \
  cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
  echo "Asia/Tokyo" > /etc/timezone && \
  apk del tzdata && \
  apk add --no-cache supervisor bash && \
  npm install -g corepack@latest && \
  corepack enable

WORKDIR /opt
RUN git clone https://github.com/novnc/noVNC.git /opt/noVNC && \
  git clone https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify

WORKDIR /app

COPY pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

COPY package.json tsconfig.json ./
COPY src src

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline

COPY entrypoint.sh /
RUN chmod +x /entrypoint.sh

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ENV TZ=Asia/Tokyo
ENV NODE_ENV=production
ENV CONFIG_PATH=/data/config.json
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV VNC_SCREEN_SIZE=1024x768
ENV DISPLAY=:1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]