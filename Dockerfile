# Use the official Node.js version 18 image as the base
FROM node:18

# Set the working directory
WORKDIR /app

# Install the chromium browser and its dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget

# Copy package.json and package-lock.json files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

RUN node node_modules/puppeteer/install.mjs

# Copy the rest of the application code
COPY . .

ARG API_KEY

ARG PORT

# Expose the API port
EXPOSE ${PORT:-3000}

# Start the application
CMD ["node", "api/index.js"]