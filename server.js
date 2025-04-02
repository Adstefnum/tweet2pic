const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const port = 3000;
const tempDir = path.join(__dirname, 'public', 'temp');

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
    await page.setViewport({ width: 650, height: 1000 });

    const images = [];

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
                      <br />
                      <span style="color: rgb(113, 118, 123); font-size: 15px;">
                        @${user.twitterUserName}
                      </span>
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
                  ${tweet}
                </div>
                 <div style="color: rgb(113, 118, 123); font-size: 15px;">
                      ${new Date(Date.now()).toLocaleString('en-US', {
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

      // Convert buffer to base64 string
      const base64String = Buffer.from(screenshotBuffer).toString('base64');
      // Save screenshot to temp folder
      const fs = require('fs');
      const path = require('path');
      
      // Ensure temp directory exists

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate unique filename
      const filename = `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const filepath = path.join(tempDir, filename);

      // Save the screenshot
      await fs.promises.writeFile(filepath, screenshotBuffer);
      images.push(base64String); // Just push the base64 string without the data URI prefix
    }

    return images;

  } catch (error) {
    console.error('Error creating tweet images:', error);
    return { images: [] };
  } finally {
    if (browser) await browser.close();
  }
};

const createPDF = async (images) => {
  // Create PDF with all images
  const PDFDocument = require('pdfkit');
  const pdfFilename = `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`;
  const pdfPath = path.join(tempDir, pdfFilename);
  const doc = new PDFDocument({
    autoFirstPage: false
  });

  // Create a buffer to store the PDF data and pipe to file
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.pipe(require('fs').createWriteStream(pdfPath));

  // Add each image to the PDF
  for (const base64Image of images) {
    // Convert base64 back to buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Add a new page for each image
    doc.addPage();
    
    // Get page dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Add image to fill entire page
    doc.image(imageBuffer, 0, 0, {
      width: pageWidth,
      height: pageHeight
    });
  }

  // Finalize PDF
  doc.end();

  // Return a promise that resolves with both the PDF path and base64
  return new Promise((resolve) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64Pdf = pdfBuffer.toString('base64');
      resolve({
       base64Pdf
      });
    });
  });
}
// API Route to create tweet images
app.post('/createTweetImages', async (req, res) => {
  const { tweets, user } = req.body;

  // Validate input
  if (!Array.isArray(tweets) || tweets.length === 0 || !user) {
    return res.status(400).json({ error: 'Invalid input: requires tweets array and user object' });
  }

  try {
    const result = await createTweetImages(tweets, user);
    const pdfResult = await createPDF(result);
    return res.status(200).json({ images: result, pdf: pdfResult });
  } catch (error) {
    console.error('Error processing tweets:', error);
    return res.status(500).json({ error: 'Failed to process tweets', images: [] });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
