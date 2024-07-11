import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn } from 'child_process';

let mainWindow;
let server;

const DEV = true;
const DEBUG = true;

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
        mainWindow.loadFile('frontend/dist/index.html');
    }

    if (DEBUG) {
        mainWindow.webContents.openDevTools(); // Open Electron DevTools
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', () => {
    createWindow(); // Create the window first

    // Start your existing server
    server = spawn('node', ['server.js', '--mode=server']);

    server.stdout.on('data', (data) => {
        console.log(`Server output: ${data}`);
    });

    server.stderr.on('data', (data) => {
        console.error(`Server error: ${data}`);
    });

    server.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
    });
});

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