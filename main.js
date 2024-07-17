import { app, BrowserWindow, systemPreferences } from 'electron';
import path from 'path';
import { startServer } from './server.js';
import fs from 'fs';

let mainWindow;

const DEV = false;
const DEBUG = false;

const logFile = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    if (DEV) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        const indexPath = path.join(app.getAppPath(), 'frontend', 'dist', 'index.html');
        mainWindow.loadFile(indexPath).catch(err => {
            logToFile('Failed to load index.html: ' + err);
        });
    }

    if (DEBUG) {
        mainWindow.webContents.openDevTools(); // Open Electron DevTools
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    createWindow(); // Create the window first
    logToFile(`Platform: ${process.platform}`);
    if (process.platform === 'darwin') { // Check if the platform is macOS
        try {
            const micAccess = await systemPreferences.askForMediaAccess('microphone');
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
  });
}

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});