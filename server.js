const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const port = 3000;

// Enable CORS for testing locally
app.use(cors());
app.use(express.json()); // Middleware to parse JSON request body

// Add static file serving
app.use(express.static('public'));

// Helper function to create custom tweet images
const createTweetImages = async (tweets, user) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 650, height: 1000 }); // Wide enough for the tweet width

    const base64Images = [];

    for (const tweet of tweets) {
      // Create the tweet HTML
      const tweetHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { margin: 0; }
              @font-face {
                font-family: 'Segoe UI';
                src: local('Segoe UI');
              }
            </style>
          </head>
          <body>
            <div style="background-color: #2e1065; padding: 20px;">
              <div style="
                background: #000000;
                border-radius: 16px;
                padding: 12px 16px;
                margin-bottom: 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                width: 598px;
              ">
                <div style="display: flex; align-items: center; margin-bottom: 12px;">
                  <img 
                    src="${user.profileImageUrl || `https://unavatar.io/twitter/${user.twitterUserName}`}"
                    style="width: 48px; height: 48px; border-radius: 50%; margin-right: 12px;"
                    alt="${user.twitterName}"
                  />
                  <div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <span style="color: #e7e9ea; font-weight: 700; font-size: 15px;">
                        ${user.twitterName}
                      </span>
                      <span style="color: rgb(113, 118, 123); font-size: 15px;">
                        @${user.twitterUserName}
                      </span>
                    </div>
                    <div style="color: rgb(113, 118, 123); font-size: 15px;">
                      ${new Date(tweet.createdAt).toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: 'numeric',
                        hour12: true,
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
                <div style="
                  color: #e7e9ea;
                  font-size: 15px;
                  line-height: 1.5;
                  white-space: pre-wrap;
                  margin-bottom: 12px;
                ">
                  ${tweet.text}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      await page.setContent(tweetHtml);

      // Wait for images to load
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const images = document.querySelectorAll('img');
          if (images.length === 0) resolve();
          
          let loaded = 0;
          images.forEach(img => {
            if (img.complete) {
              loaded++;
              if (loaded === images.length) resolve();
            } else {
              img.addEventListener('load', () => {
                loaded++;
                if (loaded === images.length) resolve();
              });
              img.addEventListener('error', () => {
                loaded++;
                if (loaded === images.length) resolve();
              });
            }
          });
        });
      });

      // Get the content height and update viewport
      const bodyHandle = await page.$('body');
      const { height } = await bodyHandle.boundingBox();
      await bodyHandle.dispose();

      // Update page viewport to match content
      await page.setViewport({ width: 650, height: Math.ceil(height) });

      // Take screenshot
      const screenshotBuffer = await page.screenshot({
        omitBackground: true
      });

      // Add to results
      base64Images.push(screenshotBuffer.toString('base64'));
    }

    return base64Images;

  } catch (error) {
    console.error('Error creating tweet images:', error);
    return null;
  } finally {
    if (browser) await browser.close();
  }
};

// API Route to create tweet images
app.post('/createTweetImages', async (req, res) => {
  const { tweets, user } = req.body;

  // Validate input
  if (!Array.isArray(tweets) || tweets.length === 0 || !user) {
    return res.status(400).json({ error: 'Invalid input: requires tweets array and user object' });
  }

  try {
    const base64Images = await createTweetImages(tweets, user);
    
    if (!base64Images) {
      return res.status(500).json({ error: 'Failed to create tweet images' });
    }

    // Return the array of base64 images
    return res.status(200).json({
      images: base64Images.map(base64 => `data:image/png;base64,${base64}`)
    });

  } catch (error) {
    console.error('Error processing tweets:', error);
    return res.status(500).json({ error: 'Failed to process tweets' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
