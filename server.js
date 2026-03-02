require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Dynamic HTML loader
 */
app.get("/dynamic", (req, res) => {
  const { spotId, postId = "no_post" } = req.query;

  if (!spotId) {
    return res.status(400).send("Missing spotId");
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script async
          src="https://launcher.spot.im/spot/${spotId}"
          data-post-id="${postId}"
        ></script>
      </head>
      <body>
        <div id="conversation" data-spotim-module="conversation"></div>
      </body>
    </html>
  `;

  res.send(html);
});

/**
 * Extract token from read request
 */
async function getAccessTokenFromSpot(spotId) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  let accessToken = null;

  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("/conversation/realtime/read")) {
      const headers = request.headers();
      if (headers["x-access-token"]) {
        accessToken = headers["x-access-token"];
      }
    }
  });

  await page.goto(
    `http://localhost:3000/dynamic?spotId=${spotId}&postId=no_post`,
    { waitUntil: "networkidle2" }
  );

  await sleep(5000);
  await browser.close();

  return accessToken;
}

/**
 * Main endpoint:
 * 1. Get token
 * 2. Call categories API
 * 3. Return categories response
 */
app.post("/run", async (req, res) => {
  const { spotId } = req.body;

  if (!spotId) {
    return res.status(400).json({ error: "spotId required" });
  }

  try {
    // Step 1: Get token
    const token = await getAccessTokenFromSpot(spotId);

    if (!token) {
      return res.status(404).json({ error: "Access token not found" });
    }

    // Step 2: Call categories endpoint
    const response = await fetch(
      "https://api-2-0.spot.im/v1.0.0/forums/v1/admin/publishers/categories",
      {
        method: "GET",
        headers: {
          "x-access-token": token,
          "x-spot-id": spotId
        }
      }
    );

    const data = await response.json();

    // Step 3: Return categories response
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});