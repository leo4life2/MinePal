import fs from "fs";
import { promisify } from "util";
import { app, BrowserWindow, systemPreferences } from "electron";
import path from "path";
import { startServer } from "./server.js";
import { createStream } from "rotating-file-stream";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

autoUpdater.setFeedURL({
  provider: "s3",
  bucket: "minepal-installers",
  region: "us-east-1",
});

const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

let mainWindow;

const DEV = false;
const DEBUG = false;
const DEVTOOLS = true;

const logDirectory = app.getPath("userData");
const logStream = createStream("app.log", {
  size: "500K", // Rotate every 500KB
  path: logDirectory,
});

function logToFile(message) {
  logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

async function checkAndCopyProfile() {
  const profilesDir = path.join(logDirectory, "profiles");
  const ethanJsonPath = path.join(app.getAppPath(), "ethan.json");
  const targetPath = path.join(profilesDir, "ethan.json");

  try {
    await access(profilesDir);
  } catch (err) {
    await mkdir(profilesDir);
    logToFile("Created profiles directory");
    // Only add ethan if there's no profile dir.
    try {
      await copyFile(ethanJsonPath, targetPath);
      logToFile("Copied ethan.json to profiles directory");
    } catch (err) {
      logToFile("Failed to copy ethan.json: " + err);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 820,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: DEVTOOLS,
    },
    autoHideMenuBar: !DEVTOOLS,
    menuBarVisible: DEVTOOLS,
  });

  mainWindow.setMenuBarVisibility(DEVTOOLS);
  if (!DEVTOOLS) mainWindow.removeMenu();

  if (DEV) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    const indexPath = path.join(
      app.getAppPath(),
      "frontend",
      "dist",
      "index.html"
    );
    mainWindow.loadFile(indexPath).catch((err) => {
      logToFile("Failed to load index.html: " + err);
    });
  }

  if (DEBUG && DEVTOOLS) {
    mainWindow.webContents.openDevTools(); // Open Electron DevTools
  }

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Register the protocol
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("minepal", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("minepal");
  }

  // Handle the protocol. In this case, we choose to show an existing window
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // Send the URL to the renderer process
      mainWindow.webContents.send("auth-callback", url);
    }
  });

  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    // Protocol handler for win32
    // commandLine includes the protocol url
    if (process.platform === "win32") {
      const url = commandLine.find((arg) => arg.startsWith("minepal://"));
      if (url) {
        mainWindow.webContents.send("auth-callback", url);
      }
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("ready", async () => {
    createWindow(); // Create the window first
    logToFile(`Platform: ${process.platform}`);
    if (process.platform === "darwin") {
      // Check if the platform is macOS
      try {
        const micAccess = await systemPreferences.askForMediaAccess(
          "microphone"
        );
        if (micAccess) {
          logToFile("Microphone access granted");
        }
      } catch (error) {
        logToFile("Failed to request microphone access: " + error);
      }
    }
    try {
      startServer();
    } catch (error) {
      logToFile("Failed to start server: " + error);
    }
    await checkAndCopyProfile(); // Check and copy profile
    autoUpdater.checkForUpdatesAndNotify();
  });

  autoUpdater.on("error", (err) => {
    logToFile("Error in auto-updater. " + err);
  });
  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    logToFile(log_message);
  });
  autoUpdater.on("update-available", () => {
    logToFile("Update available.");
  });

  autoUpdater.on("update-not-available", () => {
    logToFile("No update available.");
  });

  autoUpdater.on("update-downloaded", () => {
    logToFile("Update downloaded; will install now");
    autoUpdater.quitAndInstall();
  });
}

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});
