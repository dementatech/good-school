FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# report-card-pdf.ts needs a real Chromium to render PDFs. Puppeteer's own
# postinstall (which downloads one) silently never runs under `npm ci` —
# it's an install script, and this npm version won't execute unlisted
# packages' install scripts without explicit approval, so a fresh `npm ci`
# here produces a puppeteer with no browser at all ("Could not find Chrome").
# Using Debian's own `chromium` package instead sidesteps that entirely and
# also brings its own shared-library dependencies (libnss3, libgtk-3-0, ...)
# that bookworm-slim doesn't have — Puppeteer's downloaded binary would need
# them installed by hand regardless.
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
# create-super-admin.ts and reset-password.ts run directly via tsx (not the
# compiled dist/ output) and import from src/ by relative path, so both need
# to exist in the runtime image alongside dist/.
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./

# --create-home: Chromium's crash handler needs a writable $HOME to init its
# crash database and refuses to launch at all otherwise ("chrome_crashpad_handler:
# --database is required") — without -m, useradd --system leaves $HOME
# (/home/nodeuser) pointing at a directory that doesn't exist.
RUN useradd --system --create-home --uid 1001 nodeuser && chown -R nodeuser:nodeuser /app /home/nodeuser
USER nodeuser

EXPOSE 4000
CMD ["sh", "-c", "npm run migrate:up && node dist/server.js"]
