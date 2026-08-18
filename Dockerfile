FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_PATH=/app/data/thin-file-credit-builder.sqlite \
	BANKING_API_BASE_URL=https://btq03nn21b.execute-api.eu-central-1.amazonaws.com/ \
	BANKING_API_KEY=development

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY db ./db
COPY docker-entrypoint.js ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=6 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/users/user_1001/reliability?from=2026-02-20').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.js"]
