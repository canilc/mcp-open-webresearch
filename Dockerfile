FROM node:lts-bullseye-slim

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=America/Los_Angeles
ARG DOCKER_IMAGE_NAME_TEMPLATE="mcr.microsoft.com/playwright:v%version%-jammy"

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

RUN mkdir -p /var/lib/apt/lists/partial && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    gpg \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libexpat1 \
    libxcb1 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libcairo2 \
    libpango-1.0-0 \
    libasound2 \
    fonts-liberation \
    libdrm2 \
    xdg-utils \
 && apt-get clean && rm -rf /var/lib/apt/lists/*


ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN mkdir /ms-playwright && \
    mkdir /ms-playwright-agent && \
    cd /ms-playwright-agent && npm init -y && \
    npm i playwright && \
    npm exec --no -- playwright install --with-deps && rm -rf /var/lib/apt/lists/* && \
    # Workaround for https://github.com/microsoft/playwright/issues/27313
    # While the gstreamer plugin load process can be in-process, it ended up throwing
    # an error that it can't have libsoup2 and libsoup3 in the same process because
    # libgstwebrtc is linked against libsoup2. So we just remove the plugin.
    if [ "$(uname -m)" = "aarch64" ]; then \
        rm /usr/lib/aarch64-linux-gnu/gstreamer-1.0/libgstwebrtc.so; \
    else \
        rm /usr/lib/x86_64-linux-gnu/gstreamer-1.0/libgstwebrtc.so; \
    fi && \
    rm -rf /ms-playwright-agent && \
    rm -rf ~/.npm/ && \
    npm cache clean --force \
    chmod -R 777 /ms-playwright

RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nodejs

COPY package*.json ./

RUN npm ci || npm install && npm cache clean --force

COPY . .

RUN npm run build

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE ${PORT}

CMD ["node", "build/index.js"]
