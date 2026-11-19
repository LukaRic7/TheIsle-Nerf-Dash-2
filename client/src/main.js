let mainWindow;
let latestStdoutMessage = 'No status messages yet.';
let latestStdoutSequence = 0;
let pendingStdout = '';

function publishStdoutMessage(message) {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    latestStdoutMessage = trimmedMessage;
    latestStdoutSequence++;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('settings:stdout-message', {
            sequence: latestStdoutSequence,
            message: latestStdoutMessage
        });
    }
}

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, encoding, callback) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)) {
        const text = typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
                .toString(typeof encoding === 'string' ? encoding : 'utf8');
        const lines = `${pendingStdout}${text}`.split(/\r?\n/);
        pendingStdout = lines.pop();

        const completeMessages = lines.filter(line => line.trim());
        if (pendingStdout.trim()) {
            publishStdoutMessage(pendingStdout);
        } else if (completeMessages.length > 0) {
            publishStdoutMessage(completeMessages[completeMessages.length - 1]);
        }
    }

    return originalStdoutWrite(chunk, encoding, callback);
};

const { app, BrowserWindow, ipcMain } = require('electron');
const { NerfApiStore } = require('./services/nerf-api.js');
const fs = require('fs/promises');
const path = require('path');

const VERSION = '2.0';
const COOKIE_FILE = path.join(__dirname, '..', 'config', 'environment', 'COOKIE');

const nerfApiStore = new NerfApiStore();

ipcMain.handle('settings:update-cookie', async (_event, cookie) => {
    if (typeof cookie !== 'string' || !cookie.trim()) {
        throw new TypeError('Cookie must not be empty.');
    }

    await fs.writeFile(COOKIE_FILE, `${cookie.trim()}\n`, 'utf8');
    await nerfApiStore.initialize();
});

ipcMain.handle('settings:get-api-request-count', () => {
    return nerfApiStore.getTotalRequestsMade();
});

ipcMain.handle('settings:get-latest-status', () => {
    return {
        sequence: latestStdoutSequence,
        message: latestStdoutMessage
    };
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 840,
        height: 480,
        minWidth: 840,
        minHeight: 480,
        backgroundColor: '#14171c',
        title: `TheIsle Nerf Dash ${VERSION}`,
        show: false,
        autoHideMenuBar: true,

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadFile(
        path.join(__dirname, 'frontend', 'index.html')
    );

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    await nerfApiStore.initialize();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});