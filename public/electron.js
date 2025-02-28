// CommonJS module
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const JSZip = require('jszip');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    show: false
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);
  
  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handle open zip file dialog
ipcMain.handle('open-zip-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Read directory contents
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Filter audio files and directories
    const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif'];
    const contents = files.map(file => {
      const isDirectory = file.isDirectory();
      const fullPath = path.join(dirPath, file.name);
      const ext = path.extname(file.name).toLowerCase();
      const isAudio = audioExtensions.includes(ext);
      
      return {
        name: file.name,
        path: fullPath,
        isDirectory,
        isAudio,
        // Get file stats for audio files
        stats: isAudio ? fs.statSync(fullPath) : null
      };
    });
    
    return contents;
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

// Handle reading a ZIP file
ipcMain.handle('read-zip-file', async (event, zipPath) => {
  try {
    const zipData = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    
    const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif'];
    const contents = [];
    
    // Process zip contents
    for (const [filename, file] of Object.entries(zip.files)) {
      if (!file.dir) {
        const ext = path.extname(filename).toLowerCase();
        const isAudio = audioExtensions.includes(ext);
        
        if (isAudio) {
          contents.push({
            name: path.basename(filename),
            path: filename,
            size: file._data.uncompressedSize,
            isDirectory: false,
            isAudio,
            inZip: true,
            zipPath
          });
        }
      }
    }
    
    return contents;
  } catch (error) {
    console.error('Error reading ZIP file:', error);
    return [];
  }
});

// Extract an audio file from a ZIP
ipcMain.handle('extract-audio-from-zip', async (event, zipPath, filePath) => {
  try {
    const zipData = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    const file = zip.file(filePath);
    
    if (file) {
      const content = await file.async('arraybuffer');
      return content;
    }
    return null;
  } catch (error) {
    console.error('Error extracting from ZIP:', error);
    return null;
  }
});

// Read audio file as ArrayBuffer
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    console.error('Error reading audio file:', error);
    return null;
  }
}); 