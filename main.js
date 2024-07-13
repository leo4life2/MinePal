import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { execPath } from 'process';
import fs from 'fs';

let mainWindow;
let server;

const DEV = false;
const DEBUG = true;

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
        const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
        mainWindow.loadFile(indexPath).catch(err => {
            console.error('Failed to load index.html:', err);
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

  app.on('ready', () => {
    createWindow(); // Create the window first

    // Start your existing server
    const logDir = app.getPath('userData');
    logToFile(`Log directory: ${logDir}`);
    const nodePath = execPath; // Use the path to the current Node.js executable
    server = spawn(nodePath, ['server.js', `--userDataDir=${logDir}`]);

    server.stdout.on('data', (data) => {
        logToFile(`Server output: ${data}`);
    });

    server.stderr.on('data', (data) => {
        logToFile(`Server error: ${data}`);
    });

    server.on('close', (code) => {
        logToFile(`Server process exited with code ${code}`);
    });
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

const terminateServer = () => {
    if (server) {
        server.kill();
    }
};

process.on('SIGTERM', terminateServer);
process.on('SIGINT', terminateServer);
process.on('exit', terminateServer);