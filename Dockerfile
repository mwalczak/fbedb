FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 DB_FILE=/data/events.db
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
