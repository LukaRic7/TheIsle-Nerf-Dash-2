const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    updateCookie: cookie => ipcRenderer.invoke('settings:update-cookie', cookie),
    getApiRequestCount: () => ipcRenderer.invoke('settings:get-api-request-count'),
    getLatestStatus: () => ipcRenderer.invoke('settings:get-latest-status'),
    onStatusMessage: callback => {
        const listener = (_event, message) => callback(message);
        ipcRenderer.on('settings:stdout-message', listener);
        return () => ipcRenderer.removeListener('settings:stdout-message', listener);
    }
});

contextBridge.exposeInMainWorld('playerServerAPI', {
    getState: () => ipcRenderer.invoke('player-server:get-state'),
    onStatus: callback => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on('player-server:status', listener);
        return () => ipcRenderer.removeListener('player-server:status', listener);
    },
    onDatapool: callback => {
        const listener = (_event, datapool) => callback(datapool);
        ipcRenderer.on('player-server:datapool', listener);
        return () => ipcRenderer.removeListener('player-server:datapool', listener);
    }
});