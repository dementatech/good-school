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
# create-super-admin.ts and reset-password.ts run directly via tsx (not the
# compiled dist/ output) and import from src/ by relative path, so both need
# to exist in the runtime image alongside dist/.
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./

RUN useradd --system --uid 1001 nodeuser && chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 4000
CMD ["sh", "-c", "npm run migrate:up && node dist/server.js"]
