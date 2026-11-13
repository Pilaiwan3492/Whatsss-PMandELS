# ==============================================================================
# Multi-stage Dockerfile for Whatsss Personal Money and Expense Logging System
# Target Platform: Cloud Run / Containerized Environments
# Features: Multi-stage, non-root execution, single-container SPA + API, dynamic PORT
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets (Vite SPA)
# ------------------------------------------------------------------------------
FROM node:24-alpine AS client-builder
WORKDIR /app/client

# Build-time API Base URL for Vite SPA (defaults to relative /api in single-container deployment)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Build Backend Application & Prisma Types
# ------------------------------------------------------------------------------
FROM node:24-alpine AS server-builder
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npx prisma generate
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app/server

# Install runtime system packages for Prisma query engine, signal handling, and health probes
RUN apk add --no-cache openssl libc6-compat dumb-init curl

# Git commit SHA passed during CI/CD build for observability & health probe
ARG APP_COMMIT_SHA=development

# Default production runtime environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    APP_COMMIT_SHA=${APP_COMMIT_SHA}

# Install production runtime dependencies (prisma and tsx are included for release migrations & seed)
COPY server/package*.json ./
COPY server/prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled backend application
# Node.js 24-alpine ES module distribution
COPY --from=server-builder /app/server/dist ./dist

# Copy compiled frontend distribution to both /app/client/dist and ./client/dist
COPY --from=client-builder /app/client/dist /app/client/dist
COPY --from=client-builder /app/client/dist ./client/dist

# Create non-root user ownership for security compliance
RUN chown -R node:node /app
USER node

# Expose dynamic application port (matches Cloud Run container contract)
EXPOSE 8080

# Handle container signals gracefully
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]
