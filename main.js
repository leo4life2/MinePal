import fs from 'fs';
import { promisify } from 'util';
import { app, BrowserWindow, systemPreferences, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
import { createStream } from 'rotating-file-stream';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

autoUpdater.setFeedURL({
    provider: 's3',
    bucket: 'minepal-installers',
    region: 'us-east-1',
});

const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let pendingUrls = []; // Queue for URLs that arrive before window is ready

const logDirectory = app.getPath('userData');
const logStream = createStream('app.log', {
    size: '500K', // Rotate every 500KB
    path: logDirectory
});

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

async function checkAndCreateProfilesDir() {
    const profilesDir = path.join(logDirectory, 'profiles');

    try {
        await access(profilesDir);
    } catch (err) {
        await mkdir(profilesDir);
        logToFile('Created profiles directory');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 850,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
    });

    if (process.env.HOT_FRONTEND === 'true') { // i do this manually
        mainWindow.loadURL('http://localhost:5173');
    } else {
        const indexPath = path.join(app.getAppPath(), 'frontend', 'dist', 'index.html');
        mainWindow.loadFile(indexPath).catch(err => {
            logToFile('Failed to load index.html: ' + err);
        });
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // Process any URLs that arrived before the window was ready
    while (pendingUrls.length > 0) {
        const url = pendingUrls.shift();
        handleUrl(url);
    }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    function handleUrl(url) {
        if (!mainWindow) {
            // Window not ready yet, queue the URL
            pendingUrls.push(url);
            return;
        }

        if (url && url.startsWith('minepal://')) {
            if (url.includes('/auth/callback')) {
                mainWindow.webContents.send('auth-callback', url);
            } else if (url.includes('/import/pal')) {
                mainWindow.webContents.send('import-pal-callback', url);
            }

            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    }

    // Handle the protocol. In this case, we choose to show an existing window
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleUrl(url);
    });

    app.on('second-instance', (event, commandLine, workingDirectory) => {
        event.preventDefault();
        // Technically, MacOS should almost never open more than one instance of the app
        // And even if so, I think app.requestSingleInstanceLock will prevent this anyway
        // And even if not, it's probably will not run with url or it will be dismissed at handleUrl
        // Uncomment this code if everything breaks on Mac:

        // if (process.platform === 'win32' || process.platform === 'linux') {
        const commandLineStr = commandLine.join(' ');
        const urlMatch = commandLineStr.match(/minepal:\/\/[^\s'"]+/);
        if (urlMatch) {
            handleUrl(urlMatch[0]);
        }
        // }
    });

    // Register the protocol after app is ready
    app.on('ready', async () => {
        // Register the protocol
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('minepal', process.execPath, [path.resolve(process.argv[1])]);
            }
        } else {
            app.setAsDefaultProtocolClient('minepal');
        }

        createWindow(); // Create the window first

        // --- Define the application menu ---
        const isMac = process.platform === 'darwin';

        const menuTemplate = [
          // {App Menu} for macOS
          ...(isMac ? [{
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }] : []),
          // {File Menu}
          {
            label: 'File',
            submenu: [
              {
                label: 'Locate App Log',
                click: async () => {
                  const userDataPath = app.getPath('userData');
                  const appLogPath = path.join(userDataPath, 'app.log');
                  shell.showItemInFolder(appLogPath);
                }
              },
              {
                label: 'Locate Agent Log',
                click: async () => {
                  const userDataPath = app.getPath('userData');
                  // Assuming the agent log is in a subdirectory like runlogs
                  // You might need to adjust this path based on where AgentProcess actually logs
                  const agentLogPath = path.join(userDataPath, 'runlogs', 'agent.log'); 
                  shell.showItemInFolder(agentLogPath);
                }
              },
              { type: 'separator' },
              isMac ? { role: 'close' } : { role: 'quit' }
            ]
          },
          // {Edit Menu}
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              ...(isMac ? [
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                  label: 'Speech',
                  submenu: [
                    { role: 'startSpeaking' },
                    { role: 'stopSpeaking' }
                  ]
                }
              ] : [
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
              ])
            ]
          },
          // {View Menu}
          {
            label: 'View',
            submenu: [
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { type: 'separator' },
              { role: 'togglefullscreen' }
            ]
          },
          // {Window Menu}
          {
            label: 'Window',
            submenu: [
              { role: 'minimize' },
              { role: 'zoom' },
              ...(isMac ? [
                { type: 'separator' },
                { role: 'front' },
                { type: 'separator' },
                { role: 'window' }
              ] : [
                { role: 'close' }
              ])
            ]
          },
          {
            role: 'help',
            submenu: [
              {
                label: 'Learn More' // You can customize this or remove it
                // Add click handler if needed, e.g., open a website
              }
            ]
          }
        ];
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
        // --- End menu definition ---

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
        await checkAndCreateProfilesDir(); // Check and create profiles dir
        autoUpdater.checkForUpdatesAndNotify();
    });

    autoUpdater.on('error', (err) => {
        logToFile('Error in auto-updater. ' + err);
    })
    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        logToFile(log_message);
    })
    autoUpdater.on('update-available', () => {
        logToFile('Update available.');
    });

    autoUpdater.on('update-not-available', () => {
        logToFile('No update available.');
    });

    autoUpdater.on('update-downloaded', () => {
        logToFile('Update downloaded; will install now');
        autoUpdater.quitAndInstall();
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