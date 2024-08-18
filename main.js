import fs from 'fs';
import { promisify } from 'util';
import { app, BrowserWindow, systemPreferences, dialog, Menu } from 'electron';
import path from 'path';
import { startServer } from './server.js';
import { createStream } from 'rotating-file-stream';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

let mainWindow;

const DEV = false;
const DEBUG = false;

const logDirectory = app.getPath('userData');
const logStream = createStream('app.log', {
    size: '500K', // Rotate every 500KB
    path: logDirectory
});

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

async function checkAndCopyProfile() {
    const profilesDir = path.join(logDirectory, 'profiles');
    const ethanJsonPath = path.join(app.getAppPath(), 'ethan.json');
    const targetPath = path.join(profilesDir, 'ethan.json');

    try {
        await access(profilesDir);
    } catch (err) {
        await mkdir(profilesDir);
        logToFile('Created profiles directory');
        // Only add ethan if there's no profile dir.
        try {
            await copyFile(ethanJsonPath, targetPath);
            logToFile('Copied ethan.json to profiles directory');
        } catch (err) {
            logToFile('Failed to copy ethan.json: ' + err);
        }
    }
}

function createWindow() {
    logToFile(`Version: ${app.getVersion()}`);

    mainWindow = new BrowserWindow({
        width: 650,
        height: 800,
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

function createMenu() {
    const template = [
        {
            label: 'Update',
            submenu: [
                {
                    label: 'Check for Updates',
                    click: () => {
                        logToFile("Manual check update");
                        autoUpdater.checkForUpdatesAndNotify();
                    }
                },
            ]
        },
    ];

    // Get the default menu template
    const defaultMenu = Menu.getApplicationMenu();

    // Merge the default menu with the custom template
    const menu = Menu.buildFromTemplate([
        ...defaultMenu.items,
        ...template
    ]);
    Menu.setApplicationMenu(menu);
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
    await checkAndCopyProfile(); // Check and copy profile
    autoUpdater.setFeedURL({
        provider: 's3',
        bucket: 'minepal-installers',
        region: 'us-east-1',
        path: '',
        acl: 'public-read'
    });
    autoUpdater.checkForUpdatesAndNotify();
    createMenu(); // Add this line to create the menu
  });

  autoUpdater.on('update-available', () => {
    logToFile('Update available.');
    const result = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        buttons: ['Download Now', 'Later'],
        title: 'Update Available',
        message: 'An update is available. Would you like to download it now?',
    });

    if (result === 0) { // 'Download Now' button pressed
        autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    logToFile(logMessage);
    // Optionally, you can log progress to a file or console
  });

  autoUpdater.on('checking-for-update', () => {
    logToFile('Checking for update...');
  });

  autoUpdater.on('update-downloaded', () => {
    logToFile('Update downloaded; waiting for user to install.');
    // Show a dialog to the user
    const result = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        buttons: ['Install and Relaunch', 'Later'],
        title: 'Update Ready',
        message: 'An update has been downloaded. Would you like to install it now?',
    });

    if (result === 0) { // 'Install and Relaunch' button pressed
        autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('update-not-available', () => {
    logToFile('No updates available.');
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