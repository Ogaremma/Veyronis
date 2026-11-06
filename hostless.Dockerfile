FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci

COPY backend ./backend
COPY packages/shared ./packages/shared

RUN npm run build --workspace @veyronis/backend \
  && mkdir -p backend/dist/contracts \
  && cp backend/contracts/VeyronisEscrow.json backend/dist/contracts/VeyronisEscrow.json

ENV NODE_ENV=production
ENV APP_ENV=production

EXPOSE 3001

CMD ["node", "backend/dist/agreements/live-agreement-server.js"]
