FROM node:20-alpine AS builder
RUN corepack enable pnpm && apk add --no-cache openssl python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:20-alpine AS runner
RUN corepack enable pnpm && apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies directly in the runner (avoids pnpm symlink issues)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile --prod

# Copy build artifacts
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN npx --yes prisma@5.22.0 generate

EXPOSE 3000

# Migrations are handled by fly.toml release_command (npx prisma migrate deploy)
CMD ["./node_modules/.bin/remix-serve", "build/server/index.js"]
