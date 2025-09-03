FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm ci || npm install

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]

