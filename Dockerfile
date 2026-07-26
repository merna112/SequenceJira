# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build
COPY tsconfig.json ./
COPY services ./services

RUN npm run build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860

# Copy node_modules and built code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose Hugging Face default port
EXPOSE 7860

# Start command: Apply database schema using db push and start NestJS backend
CMD npx prisma db push && node dist/services/ai-worker/main.js
