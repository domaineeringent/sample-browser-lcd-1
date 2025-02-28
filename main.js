const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const AdmZip = require('adm-zip');
const os = require('os');
const archiver = require('archiver');

let mainWindow;

const logStream = fs.createWriteStream(path.join(app.getPath('userData'), 'app-debug.log'), { flags: 'a' });

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      enableWebAudio: true,
      additionalArguments: ['--disable-site-isolation-trials']
    },
    show: false
  });

  // Create minimal menu with just dev tools
  const template = [
    {
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' blob: data:; connect-src 'self' blob: data:;"
        ]
      }
    });
  });

  // Load the index.html file - ensure the path is correct
  const indexPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(indexPath);
  
  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development for debugging
  mainWindow.webContents.openDevTools();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    const logEntry = `[RENDERER] ${new Date().toISOString()} ${message}\n`;
    logStream.write(logEntry);
  });
}

// Create window when app is ready
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, recreate window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
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
    const directories = new Set();
    
    // Process zip contents
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) {
        // Add directories to track folder structure
        directories.add(filename);
      } else {
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
        
        // Add parent directories for this file
        let parentDir = path.dirname(filename);
        while (parentDir && parentDir !== '.') {
          directories.add(parentDir + '/');
          parentDir = path.dirname(parentDir);
        }
      }
    }
    
    // Add directories to the contents
    directories.forEach(dir => {
      // Skip empty directory name
      if (dir === '/' || dir === './') return;
      
      contents.push({
        name: path.basename(dir.slice(0, -1)), // Remove trailing slash
        path: dir,
        isDirectory: true,
        isAudio: false,
        inZip: true,
        zipPath,
        // Store parent directory for navigation
        parentDir: path.dirname(dir.slice(0, -1)) + '/'
      });
    });
    
    console.log(`Found ${directories.size} directories in ZIP`);
    
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
      // Get array buffer directly
      const buffer = await file.async('nodebuffer');
      // Convert Node Buffer to ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
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

// Handle creating temporary directory for pack
ipcMain.handle('create-temp-pack-dir', async (event, packName) => {
  const tempDir = path.join(os.tmpdir(), `sample-pack-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  return tempDir;
});

// Handle writing audio data to pack
ipcMain.handle('write-audio-to-pack', async (event, audioData, targetPath) => {
  try {
    // Ensure the directory exists
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    
    // Write the audio data to the file
    if (Buffer.isBuffer(audioData)) {
      await fs.promises.writeFile(targetPath, audioData);
    } else {
      // If audioData is an ArrayBuffer, convert it to Buffer
      await fs.promises.writeFile(targetPath, Buffer.from(audioData));
    }
    return true;
  } catch (error) {
    console.error('Error writing audio file:', error);
    throw error;
  }
});

// Handle copying file to pack
ipcMain.handle('copy-file-to-pack', async (event, sourcePath, targetPath) => {
  try {
    // Ensure the directory exists
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    
    // Copy the file
    await fs.promises.copyFile(sourcePath, targetPath);
    return true;
  } catch (error) {
    console.error('Error copying file:', error);
    throw error;
  }
});

// Handle creating pack folder
ipcMain.handle('create-pack-folder', async (event, folderPath) => {
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
});

// Handle showing save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result.filePath;
});

// Handle creating pack ZIP
ipcMain.handle('create-pack-zip', async (event, sourcePath, targetPath) => {
  try {
    // Create a write stream for the ZIP file
    const output = fs.createWriteStream(targetPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    // Listen for errors
    archive.on('error', (err) => {
      throw err;
    });
    
    // Pipe the archive to the file
    archive.pipe(output);
    
    // Add the entire directory to the ZIP
    archive.directory(sourcePath, false);
    
    // Finalize the archive
    await archive.finalize();
    
    // Clean up the temporary directory
    await fs.promises.rm(sourcePath, { recursive: true, force: true });
    
    return true;
  } catch (error) {
    console.error('Error creating ZIP:', error);
    throw error;
  }
});

// Add new IPC handler for structured logging
ipcMain.handle('log-event', (event, level, message, context) => {
  const logEntry = `[${level.toUpperCase()}] ${new Date().toISOString()} ${message} ${JSON.stringify(context)}\n`;
  logStream.write(logEntry);
});

// Add after other IPC handlers
ipcMain.on('debug-log', (event, ...args) => {
  console.log('[Renderer]', ...args);
});

ipcMain.on('debug-error', (event, ...args) => {
  console.error('[Renderer Error]', ...args);
});

ipcMain.on('flush-logs', () => {
  // Force flush stdout/stderr
  process.stdout.write('');
  process.stderr.write('');
});

// Handle batch ZIP processing
ipcMain.handle('process-multiple-zips', async (event, zipPaths) => {
  try {
    // Create temp directory for processing
    const tempDir = path.join(os.tmpdir(), `batch-zip-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    // Process each ZIP file
    for (const zipPath of zipPaths) {
      const zipName = path.basename(zipPath, '.zip');
      const extractDir = path.join(tempDir, zipName);
      
      // Extract ZIP
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractDir, true);
    }
    
    // Create output ZIP
    const outputPath = path.join(os.tmpdir(), `combined-pack-${Date.now()}.zip`);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();
    
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    
    return outputPath;
  } catch (error) {
    console.error('Error processing ZIPs:', error);
    throw error;
  }
});

// Handle selecting multiple ZIP files
ipcMain.handle('select-multiple-zips', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
  });
  
  if (!result.canceled) {
    return result.filePaths;
  }
  return [];
}); 