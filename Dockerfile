# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Fallback environment for prisma validation during build
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/influencer_monitor?schema=public"

# Install dependencies first (for docker cache optimization)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Default fallback DATABASE_URL (can be overridden via .env or docker compose environment)
ENV DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/influencer_monitor?schema=public"

# Copy package files and install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev
RUN npx prisma generate

# Copy built dist directory from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory for static files
RUN mkdir -p uploads

# Expose NestJS application port
EXPOSE 3000

# Start command (sync schema to database on startup if new, then run app)
CMD ["sh", "-c", "npx prisma db push --skip-generate || true; if [ -f dist/main.js ]; then node dist/main.js; else node dist/src/main.js; fi"]
