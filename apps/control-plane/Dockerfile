FROM node:20-slim AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY apps/control-plane/package.json ./apps/control-plane/package.json

RUN npm install

COPY packages ./packages
COPY apps/control-plane ./apps/control-plane

RUN npm run build --workspace @mars/control-plane

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@mars/control-plane"]