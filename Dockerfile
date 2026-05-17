FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig.json vite.config.ts postcss.config.js tailwind.config.js ./
COPY src ./src
COPY web ./web
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web-dist ./web-dist
COPY migrations ./migrations
COPY package.json ./
EXPOSE 8080
ENTRYPOINT ["node", "dist/index.js"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8080", "--database-url", "postgresql://docsynchub:docsynchub@postgres:5432/docsynchub"]
