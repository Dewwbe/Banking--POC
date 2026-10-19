# syntax=docker/dockerfile:1
# Pinned Node.js LTS. Strapi 5.58.0 supports Node >=20 <=26; the PoC standardises on Node 22.
ARG NODE_IMAGE=node:22.20.0-alpine

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /opt/app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---------- development: hot reload + Content-Type Builder enabled ----------
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 1337
CMD ["npm", "run", "develop"]

# ---------- production build: Content-Type Builder disabled, schema only changes through Git ----------
FROM base AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS production
RUN addgroup -S strapi && adduser -S strapi -G strapi
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=build --chown=strapi:strapi /opt/app ./
USER strapi
EXPOSE 1337
CMD ["npm", "run", "start"]
