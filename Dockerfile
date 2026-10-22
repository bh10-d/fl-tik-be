# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (for docker cache optimization)
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built dist directory from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory for static files
RUN mkdir -p uploads

# Expose NestJS application port
EXPOSE 3000

# Start command
CMD ["node", "dist/main.js"]
