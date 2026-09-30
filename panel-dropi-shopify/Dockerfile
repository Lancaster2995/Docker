# Imagen pequeña con Node; la app no tiene dependencias externas.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/datos
RUN mkdir -p /app/datos && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
