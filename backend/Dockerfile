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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

RUN useradd --system --uid 1001 nodeuser && chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 4000
CMD ["sh", "-c", "npm run migrate:up && node dist/server.js"]
