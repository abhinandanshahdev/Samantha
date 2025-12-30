# Multi-stage build for React app with Node.js backend

# Stage 1: Build React app (keep Alpine for build - smaller/faster)
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Install git for github dependencies
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Copy local tarball dependency before npm ci
COPY public/assets/html2pptx.tgz ./public/assets/

# Install ALL dependencies (some runtime deps might be in devDependencies)
RUN npm ci

# Copy source files
COPY public/ ./public/
COPY src/ ./src/
COPY tsconfig.json ./

# Copy production env file for build
COPY .env.production ./

# Build the React app with production env
RUN npm run build

# Stage 2: Setup Node.js backend (use Debian for Playwright compatibility)
FROM node:20-slim AS backend
WORKDIR /app

# Install dependencies for native modules, Playwright, and document processing
# Debian uses apt-get instead of apk
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    git \
    # Pandoc for DOCX text extraction
    pandoc \
    # Playwright dependencies (for Chromium)
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for DOCX skill (secure XML parsing)
RUN pip3 install --no-cache-dir --break-system-packages defusedxml

# Copy package files
COPY package*.json ./

# Copy local tarball dependency before npm ci
COPY public/assets/html2pptx.tgz ./public/assets/

# Install ALL dependencies (including devDependencies for testing)
# Let Playwright download its own Chromium (glibc compatible on Debian)
RUN npm ci

# Install Playwright browsers (Chromium only)
RUN npx playwright install chromium

# Copy backend files
COPY server/ ./server/

# Copy built React app from previous stage
COPY --from=frontend-build /app/build ./build

# Create all required directories and set up non-root user
# - uploads/: File uploads from users
# - server/workspace/: PowerPoint/Excel generation workspace
# - server/artifacts/: Generated artifacts (PPTX, XLSX, etc.)
# - server/skills/: Skills storage (SKILL.md files)
# Using the existing 'node' user (UID 1000) from official Node.js images
RUN mkdir -p uploads && \
    mkdir -p /app/server/workspace && \
    mkdir -p /app/server/artifacts && \
    mkdir -p /app/server/skills && \
    chown -R node:node /app

# Copy Playwright browsers to node user's home (they were installed as root)
RUN mkdir -p /home/node/.cache && \
    cp -r /root/.cache/ms-playwright /home/node/.cache/ && \
    chown -R node:node /home/node/.cache

# Switch to non-root user
USER node

# Expose port
EXPOSE 3001

# Health check for Azure App Service
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1

# Start the backend server
CMD ["node", "server/index.js"]
