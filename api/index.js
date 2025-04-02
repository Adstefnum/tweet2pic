const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const { imageSizeFromFile } = require('image-size/fromFile');
const app = express();
const port = process.env.PORT || 5000;
const tempDir = path.join(__dirname, 'public', 'temp');
const dotenv = require('dotenv');
dotenv.config();

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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/usr/bin/google-chrome',
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1350, height: 1350 });

    const base64Images = [];
    const imagePaths = [];

    for (const tweet of tweets) {
      const tweetHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { 
                margin: 0;
                width: 1350px;
                height: 1350px;
                background: #000000;
              }
              .tweet-container {
                width: 1350px;
                height: 1350px;
                padding: 60px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                flex-direction: column;
              }
              .profile-section {
                display: flex;
                align-items: center;
                margin-bottom: 48px;
              }
              .profile-image {
                width: 150px;
                height: 150px;
                border-radius: 50%;
                margin-right: 40px;
              }
              .user-info {
                display: flex;
                flex-direction: column;
                gap: 12px;
              }
              .user-name {
                color: #e7e9ea;
                font-weight: 700;
                font-size: 56px;
                line-height: 1.2;
              }
              .user-handle {
                color: rgb(113, 118, 123);
                font-size: 44px;
                line-height: 1.2;
              }
              .tweet-text {
                color: #e7e9ea;
                font-size: 60px;
                line-height: 1.5;
                white-space: pre-wrap;
                margin-bottom: 48px;
                flex-grow: 1;
              }
              .tweet-time {
                color: rgb(113, 118, 123);
                font-size: 36px;
                line-height: 1.2;
                margin-top: auto;
              }
            </style>
          </head>
          <body>
            <div class="tweet-container">
              <div class="profile-section">
                <img 
                  class="profile-image"
                  src="${user.profileImageUrl || `https://unavatar.io/twitter/${user.twitterUserName}`}"
                  alt="${user.twitterName}"
                />
                <div class="user-info">
                  <span class="user-name">${user.twitterName}</span>
                  <span class="user-handle">@${user.twitterUserName}</span>
                </div>
              </div>
              <div class="tweet-text">${tweet}</div>
              <div class="tweet-time">
                ${new Date().toLocaleString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
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

      // Take screenshot
      const screenshot = await page.screenshot({
        omitBackground: true
      });

      // Generate unique filename and save
      const filename = `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const filepath = path.join(tempDir, filename);
      await fs.writeFile(filepath, screenshot);

      imagePaths.push(filepath);
      base64Images.push(Buffer.from(screenshot).toString('base64'));
    }

    return { base64Images, imagePaths };

  } catch (error) {
    console.error('Error creating tweet images:', error);
    return { images: [] };
  } finally {
    if (browser) await browser.close();
  }
};

const createPDF = async (imagePaths) => {
  // Create PDF with all images
  const PDFDocument = require('pdfkit');
  const pdfFilename = `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`;
  const pdfPath = path.join(tempDir, pdfFilename);
  const doc = new PDFDocument({
    autoFirstPage: false
  });

  // Create a buffer to store the PDF data
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.pipe(require('fs').createWriteStream(pdfPath));

  // Add each image to the PDF
  for (const imagePath of imagePaths) {
    // Get image dimensions
    const dimensions = await imageSizeFromFile(imagePath);
    
    // Add a new page with image dimensions
    doc.addPage({
      size: [dimensions.width, dimensions.height]
    });

    // Add image to fill page
    doc.image(imagePath, 0, 0, {
      width: dimensions.width,
      height: dimensions.height
    });
  }

  // Finalize PDF
  doc.end();


  // Return a promise that resolves with both the PDF path and base64
  return new Promise((resolve) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64Pdf = pdfBuffer.toString('base64');
      // Clean up image files
      for (const imagePath of imagePaths) {
        fs.unlink(imagePath);
      }
      fs.unlink(pdfPath);
      resolve({
        base64Pdf
      });
    });
  });
}
// API Route to create tweet images
app.post('/createTweetImages', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY || !apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { tweets, user } = req.body;

  // Validate input
  if (!Array.isArray(tweets) || tweets.length === 0 || !user) {
    return res.status(400).json({ error: 'Invalid input: requires tweets array and user object' });
  }

  try {
    const result = await createTweetImages(tweets, user);
    const pdfResult = await createPDF(result.imagePaths);
    return res.status(200).json({ base64Images: result.base64Images, base64Pdf: pdfResult.base64Pdf });
  } catch (error) {
    console.error('Error processing tweets:', error);
    return res.status(500).json({ error: 'Failed to process tweets', images: [] });
  }
});

app.get("/", (req, res) => res.send("Tweet to Pics and PDF API running"));

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
