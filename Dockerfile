# One Dockerfile for every Node service in the monorepo:
#   docker build --build-arg SERVICE=housekeeping-svc .
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
# Corepack installs the pnpm version pinned in package.json's `packageManager` field.
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG SERVICE
# Lockfile first: this layer, the slow download of every dependency, is cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# `...` builds the service and every workspace package it depends on, dependencies first.
RUN pnpm --filter "@kabbit/${SERVICE}..." build
# A self-contained copy of the service: production dependencies only, workspace packages included.
RUN pnpm --filter "@kabbit/${SERVICE}" deploy --prod /out

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Not root: a compromised process can't modify the image's files.
USER node
CMD ["node", "dist/main.js"]
