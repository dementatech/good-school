FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
# Baked in at build time: Next.js resolves rewrites() once and freezes the
# result into the standalone build's routes manifest, so this can't be
# supplied as a plain runtime env var the way BACKEND_URL sounds like it should be.
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time too.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Needed while running too, not only at build time: server code such as the
# public event page (/e/<token>) and its preview image calls the backend
# directly. Without it they fall back to localhost:4000, which in this
# container is nothing, and every shared event link says "not available".
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}

RUN useradd --system --uid 1001 nodeuser
COPY --from=build /app/public ./public
COPY --from=build --chown=nodeuser:nodeuser /app/.next/standalone ./
COPY --from=build --chown=nodeuser:nodeuser /app/.next/static ./.next/static

USER nodeuser
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
