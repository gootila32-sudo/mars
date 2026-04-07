FROM node:20-slim AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY apps/bot/package.json ./apps/bot/package.json

RUN npm install

COPY packages ./packages
COPY apps/bot ./apps/bot

RUN npm run build --workspace @mars/bot

EXPOSE 8080
CMD ["npm", "run", "start", "--workspace", "@mars/bot"]