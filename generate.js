const axios = require("axios");
const fs = require("fs");
const { exec, execSync } = require("child_process");
const cliProgress = require("cli-progress");

const PORT = 3030;
const IMAGE_DIR = "./generated_images";
const METADATA_FILE = "./generated_metadata.json";
const NUMBER_OF_CARDS = 100;
const SERVER_START_COMMAND = "node server.js";

function killProcessOnPort(port) {
  try {
    console.log(`Checking if port ${port} is in use...`);
    let command;

    if (process.platform === "win32") {
      // For Windows
      command = `netstat -ano | findstr :${port}`;
      const output = execSync(command).toString();
      const lines = output.split("\n");
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          console.log(`Killing process with PID ${pid} on port ${port}`);
          execSync(`taskkill /PID ${pid} /F`);
        }
      });
    } else {
      // For macOS/Linux
      command = `lsof -i :${port}`;
      const output = execSync(command).toString();
      const lines = output.split("\n");
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        if (pid && !isNaN(pid)) {
          console.log(`Killing process with PID ${pid} on port ${port}`);
          execSync(`kill -9 ${pid}`);
        }
      });
    }
  } catch (error) {
    console.log(`No process found running on port ${port}`);
  }
}

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log("Starting server...");
    const server = exec(SERVER_START_COMMAND, (error, stdout, stderr) => {
      if (error) {
        console.error(`Server error: ${error.message}`);
        reject(error);
      }
      if (stderr) {
        console.error(`Server stderr: ${stderr}`);
        reject(stderr);
      }
      console.log("Server started successfully.");
      resolve(server);
    });

    setTimeout(() => {
      console.log("Waiting for server to start...");
      resolve(server);
    }, 5000); // Give the server some time to start
  });
}

async function stopServer() {
  try {
    console.log("Stopping server...");
    const fetchModule = await import("node-fetch");
    const fetch = fetchModule.default; // Use the default export
    await fetch(`http://localhost:${PORT}/stop`, { method: "POST" });
    console.log("Server stopped successfully.");
  } catch (error) {
    console.error("Failed to stop server:", error.message);
  }
}

async function generateCards() {
  if (!fs.existsSync(IMAGE_DIR)) {
    console.log(`Creating directory: ${IMAGE_DIR}`);
    fs.mkdirSync(IMAGE_DIR);
  }

  const metadataArray = [];

  // Initialize the progress bar
  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  progressBar.start(NUMBER_OF_CARDS, 0);

  for (let i = 0; i < NUMBER_OF_CARDS; i++) {
    const hexValue = ((Math.random() * 0xffffff) << 0)
      .toString(16)
      .padStart(6, "0");
    const imageUrl = `http://localhost:${PORT}/v1/card/seed/${hexValue}/2x.png`;
    const metadataUrl = `http://localhost:${PORT}/v1/seed/${hexValue}/metadata`;

    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      const metadataResponse = await axios.get(metadataUrl);

      const imagePath = `${IMAGE_DIR}/card_${hexValue}.png`;
      fs.writeFileSync(imagePath, imageResponse.data);
      metadataArray.push(metadataResponse.data);
    } catch (error) {
      console.error(
        `Failed to generate card ${i + 1}: ${hexValue}`,
        error.message
      );
    }

    // Update the progress bar
    progressBar.update(i + 1);
  }

  // Stop the progress bar
  progressBar.stop();

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadataArray, null, 2));
  console.log(`Metadata for all cards saved to ${METADATA_FILE}`);
}

async function main() {
  try {
    killProcessOnPort(PORT);
    await startServer();
    console.log("Server started");
    await generateCards();
    console.log("All cards generated");
    await stopServer();
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
