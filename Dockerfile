# ---- build web client ----
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY client ./client
# API_BASE empty => web talks to the same origin (this server serves it)
RUN npm --prefix client run build

# ---- runtime: Express API + serves the built web ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# database stored on a mounted volume for persistence
ENV DB_PATH=/data/data.db
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev
COPY server ./server
COPY --from=web /app/client/dist ./client/dist
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4000
WORKDIR /app/server
CMD ["node", "--no-warnings", "index.js"]
