FROM oven/bun:1-alpine

ENV PORT=3000
ENV HISTORY_SIZE=20
ENV DATA_ROOT=/app/data

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production
ENTRYPOINT [ "bun", "run", "index.ts" ]
