FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/englishhub.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
