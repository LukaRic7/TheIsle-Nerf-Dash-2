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