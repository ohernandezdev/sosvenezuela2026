# Imagen mínima del gateway. Build multi-stage: compila TS y corre el dist.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
# Datos persistentes (jsonFileStorage). Monta un volumen aquí.
VOLUME /app/data
EXPOSE 8080
# Corre el ejemplo. Para tu campaña, reemplaza por tu config compilada.
CMD ["node", "dist/src/cli.js", "dist/examples/sos.config.js"]
