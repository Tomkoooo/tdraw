FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders so `docker build` (e.g. GitHub Actions) succeeds without injecting repo secrets.
# The final image does not inherit these; pass real values at `docker run` / compose time.
ENV AUTH_TRUST_HOST=true
ENV AUTH_SECRET=ci-docker-build-placeholder-secret-min-32-chars-long
ENV GOOGLE_CLIENT_ID=ci-build-dummy.apps.googleusercontent.com
ENV GOOGLE_CLIENT_SECRET=ci-build-dummy-google-oauth-secret
ENV NEXTAUTH_URL=http://127.0.0.1:3000
ENV MONGODB_URI=mongodb://127.0.0.1:27017/tdraw
ENV INVITE_TTL_HOURS=48
ENV SMTP_HOST=
ENV SMTP_PORT=587
ENV SMTP_SECURE=false
ENV SMTP_USER=
ENV SMTP_PASS=
ENV EMAIL_FROM="tDraw <noreply@ci-build.invalid>"
ENV REALTIME_PUBLIC_URL=
ENV NEXT_PUBLIC_REALTIME_URL=
ENV ENABLE_CHANGE_STREAMS=
ENV REALTIME_PORT=3001
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/server/prod.cjs ./server/prod.cjs

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server/prod.cjs"]
