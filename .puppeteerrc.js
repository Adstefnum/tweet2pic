const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  executablePath: '/usr/bin/chromium',
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};