// Get references to DOM elements
const openFolderBtn = document.getElementById('openFolderBtn');
const openZipBtn = document.getElementById('openZipBtn');
const homeBtn = document.getElementById('homeBtn');
const playBtn = document.getElementById('playBtn');
const loopBtn = document.getElementById('loopBtn');
const volumeSlider = document.getElementById('volumeSlider');
const pathDisplay = document.getElementById('pathDisplay');
const folderList = document.getElementById('folderList');
const sampleListContainer = document.getElementById('sampleListContainer');
const waveformContainer = document.getElementById('waveformContainer');
const statusBar = document.getElementById('statusBar');

// Import Electron IPC
const { ipcRenderer } = require('electron');
const path = require('path');

// State
let currentPath = null;
let currentZip = null;
let currentZipDir = null; // Track current directory within ZIP
let files = [];
let selectedFile = null;
let isPlaying = false;
let isLooping = true;
let autoPlay = true; // Add autoplay state
let wavesurfer = null;

// Pack Creation State
let currentPack = {
  name: 'New Pack',
  items: [],
  folders: {}
};

let selectedPackItem = null;

// Audio Context and analyzer
let audioContext = null;
let audioBuffer = null;
let audioSource = null;
let analyser = null;
let animationFrame = null;

// Add seekbar update interval variable
let seekUpdateInterval = null;

// Add gainNode to state variables at the top
let gainNode = null;

// Add at top of file
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

// Batch processing state
let batchWindow;
let batchDropZone;
let batchStatus;
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

function log(level, message, context = {}) {
  if (!LOG_LEVELS.includes(level)) return;
  
  const contextWithState = {
    ...context,
    currentZip,
    currentZipDir,
    currentPath,
    audioState: {
      isPlaying,
      audioContextState: audioContext ? audioContext.state : 'none',
      audioBuffer: !!audioBuffer
    }
  };
  
  ipcRenderer.invoke('log-event', level, message, contextWithState).catch(() => {});
}

// Add at the top after imports
function debugLog(...args) {
  // Log to renderer console
  console.log(...args);
  // Send to main process
  ipcRenderer.send('debug-log', ...args);
}

function debugError(...args) {
  // Log to renderer console
  console.error(...args);
  // Send to main process
  ipcRenderer.send('debug-error', ...args);
}

// Replace the debugState function
function debugState(location) {
  const state = {
    location,
    zip: {
      currentZip,
      currentZipDir,
      currentPath
    },
    audio: {
      contextExists: !!audioContext,
      contextState: audioContext?.state,
      sourceExists: !!audioSource,
      bufferExists: !!audioBuffer,
      isPlaying
    },
    pack: {
      packExists: !!currentPack,
      folderCount: currentPack ? Object.keys(currentPack.folders).length : 0,
      itemCount: currentPack ? currentPack.items.length : 0,
      currentPackPath: window.currentPackPath
    }
  };

  debugLog('\n🔍 STATE DUMP:', JSON.stringify(state, null, 2));
  
  // Force flush logs
  ipcRenderer.send('flush-logs');
}

// Initialize the application
function init() {
  // Set up event listeners
  openFolderBtn.addEventListener('click', handleOpenFolder);
  openZipBtn.addEventListener('click', handleOpenZip);
  homeBtn.addEventListener('click', handleHomeClick);
  playBtn.addEventListener('click', handlePlayToggle);
  loopBtn.addEventListener('click', handleLoopToggle);
  volumeSlider.addEventListener('input', handleVolumeChange);
  
  // Load saved preferences
  const savedAutoPlay = localStorage.getItem('sampleBrowserAutoPlay');
  if (savedAutoPlay !== null) {
    autoPlay = savedAutoPlay === 'true';
  }
  
  const savedLoop = localStorage.getItem('sampleBrowserLoop');
  if (savedLoop !== null) {
    isLooping = savedLoop === 'true';
    updateLoopButton();
  }
  
  // Set initial state
  updateStatusBar('Ready');
  
  // Add autoplay toggle button to toolbar
  const autoPlayBtn = document.createElement('button');
  autoPlayBtn.id = 'autoPlayBtn';
  autoPlayBtn.className = 'btn toggle-btn' + (autoPlay ? ' active' : '');
  autoPlayBtn.textContent = autoPlay ? 'AutoPlay: On' : 'AutoPlay: Off';
  autoPlayBtn.addEventListener('click', handleAutoPlayToggle);
  
  // Insert before path display
  const toolbar = document.querySelector('.toolbar');
  toolbar.insertBefore(autoPlayBtn, pathDisplay);

  // Initialize pack creation
  initPackCreation();

  // Initialize batch processing
  initBatchProcessing();
}

// Handle opening a folder
async function handleOpenFolder() {
  updateStatusBar('Opening folder...');
  try {
    const folderPath = await ipcRenderer.invoke('open-folder-dialog');
    if (folderPath) {
      currentPath = folderPath;
      currentZip = null;
      currentZipDir = null; // Reset ZIP directory
      selectedFile = null;
      pathDisplay.textContent = folderPath;
      
      // Reset waveform
      resetWaveform();
      
      // Load directory content
      await loadDirectoryContent(folderPath);
    }
  } catch (error) {
    console.error('Error opening folder:', error);
    updateStatusBar('Error opening folder');
  }
}

// Handle opening a ZIP file
async function handleOpenZip() {
  // Call new cleanup function
  resetBrowserState();
  updateStatusBar('Opening ZIP file...');
  try {
    const zipPath = await ipcRenderer.invoke('open-zip-dialog');
    if (zipPath) {
      // Clean up existing state
      selectedFile = null;
      
      // Stop any ongoing playback and updates
      stopSeekbarUpdates();
      
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      
      // Full audio cleanup
      if (audioSource) {
        try {
          audioSource.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
        audioSource.disconnect();
        audioSource = null;
      }
      
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
      
      if (gainNode) {
        gainNode.disconnect();
        gainNode = null;
      }
      
      if (audioContext) {
        // Suspend and close the audio context
        await audioContext.suspend();
        await audioContext.close();
        audioContext = null;
      }
      
      // Reset audio buffer
      audioBuffer = null;
      isPlaying = false;
      updatePlayButton();
      
      // Reset waveform display
      waveformContainer.innerHTML = `
        <div class="waveform-empty">
          <div>No sample selected</div>
          <div style="font-size: 12px; margin-top: 5px;">
            Select an audio file to view waveform
          </div>
        </div>
      `;
      
      // Reset pack navigation state
      window.currentPackPath = '';
      
      // Clear files array before loading new content
      files = [];
      
      // Update ZIP state
      currentZip = zipPath;
      currentPath = null;
      currentZipDir = null;
      
      // Reset pack state to prevent memory leaks
      if (currentPack && currentPack.folders) {
        // Store the folders temporarily
        const existingFolders = { ...currentPack.folders };
        // Only keep folders that have items
        const cleanedFolders = {};
        for (const [folderPath, items] of Object.entries(existingFolders)) {
          if (items && items.length > 0) {
            cleanedFolders[folderPath] = items;
          }
        }
        currentPack.folders = cleanedFolders;
      }
      
      pathDisplay.textContent = zipPath;
      
      // Load ZIP content
      await loadZipContent(zipPath);
      
      // Update pack tree to reflect changes
      updatePackTree();
      updatePackStats();
    }
  } catch (error) {
    console.error('Error opening ZIP file:', error);
    updateStatusBar('Error opening ZIP file');
  }
}

// Load directory content
async function loadDirectoryContent(dirPath) {
  updateStatusBar(`Loading content from ${dirPath}...`);
  try {
    files = await ipcRenderer.invoke('read-directory', dirPath);
    
    // Update UI
    updateFolderList();
    updateSampleList();
    
    updateStatusBar(`Loaded ${files.length} items`);
  } catch (error) {
    console.error('Error loading directory content:', error);
    updateStatusBar('Error loading content');
  }
}

// Load ZIP content
async function loadZipContent(zipPath) {
  updateStatusBar(`Loading content from ZIP...`);
  try {
    // Clear existing files array
    files = [];
    
    // Load new files
    files = await ipcRenderer.invoke('read-zip-file', zipPath);
    
    // Update UI
    updateFolderList();
    updateSampleList();
    
    updateStatusBar(`Loaded ${files.length} audio samples from ZIP`);
  } catch (error) {
    console.error('Error loading ZIP content:', error);
    updateStatusBar('Error loading ZIP content');
  }
}

// Update folder list
function updateFolderList() {
  // Clear current content
  folderList.innerHTML = '';
  
  // Add back button for ZIP navigation if we're in a subdirectory
  if (currentZip && currentZipDir) {
    const backItem = document.createElement('div');
    backItem.className = 'file-item';
    backItem.innerHTML = '<span class="folder-icon">↑</span> ..';
    backItem.addEventListener('click', handleBackNavigation);
    folderList.appendChild(backItem);
  }
  
  // Filter directories
  const directories = files.filter(file => file.isDirectory);
  
  if (directories.length === 0) {
    const message = document.createElement('div');
    message.className = 'message';
    message.textContent = currentPath || currentZip ? 'No subfolders found' : 'Open a folder to start browsing';
    folderList.appendChild(message);
    return;
  }
  
  // For ZIP navigation, only show directories at the current level
  let filteredDirectories = directories;
  if (currentZip) {
    if (currentZipDir) {
      // Show only directories that are direct children of the current directory
      filteredDirectories = directories.filter(dir => {
        const dirPath = dir.path;
        return dirPath.startsWith(currentZipDir) && 
               dirPath !== currentZipDir && 
               dirPath.substring(currentZipDir.length).split('/').filter(Boolean).length === 1;
      });
    } else {
      // At root level, show only top-level directories
      filteredDirectories = directories.filter(dir => {
        return dir.path.split('/').filter(Boolean).length === 1;
      });
    }
  }
  
  // Add directory items
  filteredDirectories.forEach(dir => {
    const dirItem = document.createElement('div');
    dirItem.className = 'file-item';
    dirItem.innerHTML = `<span class="folder-icon">📁</span> ${dir.name}`;
    dirItem.addEventListener('click', () => handleFileSelect(dir));
    folderList.appendChild(dirItem);
  });
}

// Update sample list
function updateSampleList() {
  // Clear current content
  sampleListContainer.innerHTML = '';
  
  // Filter audio files based on current directory
  let audioFiles = files.filter(file => file.isAudio);
  
  // If we're in a ZIP file, filter by current directory
  if (currentZip) {
    if (currentZipDir) {
      // Show only files directly in this directory
      audioFiles = audioFiles.filter(file => 
        file.path.startsWith(currentZipDir) && 
        !file.path.substring(currentZipDir.length).includes('/')
      );
    } else {
      // At root level, show only files in the root
      audioFiles = audioFiles.filter(file => !file.path.includes('/'));
    }
  }
  
  if (audioFiles.length === 0) {
    const message = document.createElement('div');
    message.className = 'message';
    message.textContent = !currentZip && !currentPath ? 
      'Open a folder or ZIP file to view audio samples' : 
      'No audio samples found in this location';
    sampleListContainer.appendChild(message);
    return;
  }
  
  // Create table
  const table = document.createElement('table');
  
  // Create header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th style="width: 40%">Name</th>
      <th style="width: 20%">Type</th>
      <th style="width: 15%">Size</th>
      <th style="width: 15%">Duration</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Create body
  const tbody = document.createElement('tbody');
  
  // Add audio file rows
  audioFiles.forEach(file => {
    const row = document.createElement('tr');
    
    // Make row draggable
    row.draggable = true;
    row.dataset.path = file.path;
    
    // Add dragstart event listener
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', JSON.stringify({
        name: file.name,
        path: file.path,
        size: file.size || (file.stats ? file.stats.size : 0),
        isAudio: true,
        inZip: file.inZip,
        zipPath: file.zipPath
      }));
      event.dataTransfer.effectAllowed = 'copy';
    });
    
    // Check if this file is selected
    if (selectedFile && selectedFile.path === file.path) {
      row.className = 'selected';
    }
    
    // Add click handler
    row.addEventListener('click', () => handleFileSelect(file));
    
    // Format file size
    const fileSize = file.inZip 
      ? formatSize(file.size) 
      : formatSize(file.stats ? file.stats.size : 0);
    
    // Add cells
    row.innerHTML = `
      <td><span class="audio-icon">🔊</span> ${file.name}</td>
      <td>${path.extname(file.name).toUpperCase().slice(1)}</td>
      <td>${fileSize}</td>
      <td>-</td>
    `;
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  sampleListContainer.appendChild(table);
}

// Handle back navigation for ZIP directories
function handleBackNavigation() {
  if (!currentZip || !currentZipDir) return;
  
  // Get parent directory
  const parentDir = currentZipDir.split('/').slice(0, -2).join('/');
  if (parentDir) {
    currentZipDir = parentDir + '/';
    pathDisplay.textContent = `${currentZip} - ${currentZipDir}`;
  } else {
    currentZipDir = null;
    pathDisplay.textContent = currentZip;
  }
  
  // Update UI with filtered files
  updateZipDirectoryView();
}

// Update ZIP directory view
function updateZipDirectoryView() {
  // Filter files to show only those in the current directory
  const dirFiles = files.filter(f => {
    if (!f.inZip) return false;
    
    if (currentZipDir) {
      // In a subdirectory
      if (f.isDirectory) {
        // Include this directory if it's a direct child of current directory
        return f.path.startsWith(currentZipDir) && 
               f.path !== currentZipDir && 
               f.path.substring(currentZipDir.length).split('/').filter(Boolean).length === 1;
      } else {
        // Include files directly in this directory
        return f.path.startsWith(currentZipDir) && 
               !f.path.substring(currentZipDir.length).includes('/');
      }
    } else {
      // At root level
      if (f.isDirectory) {
        // Include only top-level directories
        return f.path.split('/').filter(Boolean).length === 1;
      } else {
        // Include only files in the root
        return !f.path.includes('/');
      }
    }
  });
  
  console.log(`Showing ${dirFiles.length} items in ZIP directory ${currentZipDir || 'root'}`);
  
  // Update UI
  updateFolderList();
  updateSampleList();
}

// Handle file selection
async function handleFileSelect(file) {
  log('debug', 'Handling file selection started', { 
    filePath: file.path,
    isDirectory: file.isDirectory,
    inZip: file.inZip
  });
  
  validateState('file selection start');

  try {
    // Reset pack navigation state
    const previousPackPath = window.currentPackPath;
    window.currentPackPath = '';
    log('debug', 'Reset pack path', { previousPackPath });

    // Only clean up audio if selecting a new audio file
    if (file.isAudio) {
      // Clean up existing audio source if switching to a new audio file
      if (audioSource) {
        try {
          audioSource.stop();
          audioSource.disconnect();
        } catch (e) { /* Ignore errors */ }
        audioSource = null;
      }
      
      // Recreate audio context if needed
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Force reset waveform container
      waveformContainer.innerHTML = '';
      
      // Select audio file
      selectedFile = file;
      updateSampleList(); // Update to highlight selected file
      
      // Load and play the audio file
      await loadAudioFile(file);
      
      // Ensure the waveform is visible by scrolling to it
      waveformContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (file.isDirectory) {
      // For directories, just update the view without stopping playback
      if (file.inZip) {
        currentZipDir = file.path;
        pathDisplay.textContent = `${currentZip} - ${currentZipDir}`;
        updateZipDirectoryView();
      } else {
        currentPath = file.path;
        pathDisplay.textContent = currentPath;
        await loadDirectoryContent(currentPath);
      }
    }

    log('info', 'File selected successfully', { 
      fileType: file.isDirectory ? 'directory' : 'audio',
      inZip: !!file.inZip
    });
  } catch (error) {
    log('error', 'File selection failed', {
      error: error.message,
      stack: error.stack,
      finalState: {
        currentZip,
        currentZipDir,
        audioContextState: audioContext?.state
      }
    });
    updateStatusBar(`Error selecting file: ${error.message}`);
  }
  
  validateState('file selection complete');
}

// Load audio file
async function loadAudioFile(file) {
  log('info', 'Audio load started', {
    filePath: file.path,
    inZip: file.inZip,
    zipPath: file.zipPath,
    currentZip,
    currentZipDir
  });
  
  try {
    // Reset previous audio
    resetWaveform();
    
    // Validate file object
    if (!file || (file.inZip && !file.zipPath && !currentZip)) {
      throw new Error('Invalid file or ZIP path');
    }

    // Create waveform container with a small delay to ensure DOM update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create waveform container
    const waveformWrapper = document.createElement('div');
    waveformWrapper.className = 'waveform-wrapper';
    
    // Force layout calculation to get proper dimensions
    waveformContainer.appendChild(waveformWrapper);
    const wrapperWidth = waveformWrapper.offsetWidth || waveformContainer.offsetWidth || 800;
    
    // Create canvas for waveform with proper dimensions
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(wrapperWidth - 20, 100); // Account for padding
    canvas.height = 140;
    waveformWrapper.appendChild(canvas);
    
    // Create file info
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `<span class="file-name">${file.name}</span>`;
    
    // Create seek control
    const seekControl = document.createElement('div');
    seekControl.className = 'seek-control';
    const seekSlider = document.createElement('input');
    seekSlider.type = 'range';
    seekSlider.min = '0';
    seekSlider.max = '1000';
    seekSlider.value = '0';
    seekSlider.className = 'seek-slider';
    seekControl.appendChild(seekSlider);
    
    // Create playback controls
    const playbackControls = document.createElement('div');
    playbackControls.className = 'playback-controls';
    
    const playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'control-btn';
    playPauseBtn.textContent = 'Play';
    playPauseBtn.setAttribute('data-tooltip', 'Play/Pause Audio');
    playPauseBtn.addEventListener('click', handlePlayToggle);
    
    const restartBtn = document.createElement('button');
    restartBtn.className = 'control-btn';
    restartBtn.textContent = 'Restart';
    restartBtn.setAttribute('data-tooltip', 'Restart from Beginning');
    restartBtn.addEventListener('click', handleRestart);
    
    const loopToggleBtn = document.createElement('button');
    loopToggleBtn.className = 'control-btn';
    loopToggleBtn.textContent = isLooping ? 'Loop: On' : 'Loop: Off';
    loopToggleBtn.setAttribute('data-tooltip', 'Toggle Loop Playback');
    loopToggleBtn.classList.toggle('active', isLooping);
    loopToggleBtn.addEventListener('click', handleLoopToggle);
    
    playbackControls.appendChild(playPauseBtn);
    playbackControls.appendChild(restartBtn);
    playbackControls.appendChild(loopToggleBtn);
    
    // Clear and update waveform container
    waveformContainer.innerHTML = '';
    waveformContainer.appendChild(fileInfo);
    waveformContainer.appendChild(waveformWrapper);
    waveformContainer.appendChild(seekControl);
    waveformContainer.appendChild(playbackControls);
    
    // Initialize Audio Context if needed
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // Load saved volume
      const savedVolume = localStorage.getItem('sampleBrowserVolume');
      if (savedVolume !== null) {
        volumeSlider.value = savedVolume * 100;
      }
    } else if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Load audio data with validation
    let audioData;
    try {
      if (file.inZip) {
        // Always use the file's original zipPath for pack items
        const zipPath = file.zipPath || currentZip;
        if (!zipPath) {
          throw new Error('No ZIP path available');
        }
        
        // Use the file's sourcePath if available (for pack items), otherwise construct it
        const filePath = file.sourcePath || (currentZipDir ? `${currentZipDir}${file.name}` : file.path);
        log('debug', 'Extracting audio from ZIP', { zipPath, filePath });
        
        audioData = await ipcRenderer.invoke('extract-audio-from-zip', zipPath, filePath);
      } else {
        audioData = await ipcRenderer.invoke('read-audio-file', file.path);
      }
      
      if (!audioData) {
        throw new Error('No audio data received');
      }
    } catch (error) {
      throw new Error(`Failed to load audio file: ${error.message}`);
    }

    // Decode audio data
    try {
      audioBuffer = await audioContext.decodeAudioData(audioData);
      log('debug', 'Audio data decoded successfully', {
        duration: audioBuffer.duration,
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
      });
    } catch (error) {
      throw new Error(`Failed to decode audio data: ${error.message}`);
    }
    
    // Set up analyzer
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    // Create gain node
    gainNode = audioContext.createGain();
    gainNode.gain.value = volumeSlider.value / 100;
    
    // Draw initial waveform
    try {
      drawWaveform(canvas, audioBuffer);
    } catch (error) {
      log('error', 'Failed to draw waveform', { error });
      // Continue even if waveform drawing fails
    }
    
    // Add progress indicator (visual only)
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    canvas.parentElement.appendChild(progressBar);
    
    // Update file info with duration
    const duration = formatTime(audioBuffer.duration);
    const timeInfo = document.createElement('span');
    timeInfo.style.marginLeft = '10px';
    timeInfo.style.color = '#aaaaaa';
    timeInfo.style.fontSize = '12px';
    timeInfo.textContent = `00:00 / ${duration}`;
    fileInfo.appendChild(timeInfo);
    
    // Set up seek control
    seekSlider.addEventListener('input', (e) => {
      const progress = parseFloat(e.target.value) / 1000;
      const seekTime = progress * audioBuffer.duration;
      
      // Update time display while dragging
      if (timeInfo) {
        timeInfo.textContent = `${formatTime(seekTime)} / ${duration}`;
      }
      
      // Update progress bar visual
      if (progressBar) {
        progressBar.style.width = `${progress * 100}%`;
      }
    });
    
    seekSlider.addEventListener('change', (e) => {
      const progress = parseFloat(e.target.value) / 1000;
      const seekTime = progress * audioBuffer.duration;
      
      // Stop current playback
      if (audioSource) {
        try {
          audioSource.stop();
        } catch (error) {
          // Ignore errors if already stopped
        }
        audioSource = null;
      }
      
      // Start playback from new position if already playing
      if (isPlaying) {
        startPlayback(seekTime);
      } else {
        // Just update the visuals without starting playback
        const timeInfo = waveformContainer.querySelector('.file-info span:last-child');
        if (timeInfo) {
          timeInfo.textContent = `${formatTime(seekTime)} / ${formatTime(audioBuffer.duration)}`;
        }
        const progressBar = waveformContainer.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = `${progress * 100}%`;
        }
      }
    });
    
    // Start playback if autoPlay is enabled
    if (autoPlay) {
      isPlaying = true;
      updatePlayButton();
      startPlayback(0);
    }
    
    updateStatusBar(`Loaded: ${file.name}`);
    
  } catch (error) {
    log('error', 'Audio load failed', {
      error: error.message,
      stack: error.stack,
      audioState: {
        contextState: audioContext?.state,
        bufferExists: !!audioBuffer,
        containerWidth: waveformContainer.offsetWidth,
        file: file,
        currentZip,
        currentZipDir
      }
    });
    updateStatusBar(`Error loading audio file: ${error.message}`);
    resetWaveform();
    
    // Ensure cleanup of audio resources on error
    if (audioSource) {
      try {
        audioSource.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      audioSource.disconnect();
      audioSource = null;
    }
  }
}

// Draw waveform on canvas
function drawWaveform(canvas, buffer) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  
  // Clear canvas
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);
  
  // Draw waveform
  ctx.beginPath();
  ctx.strokeStyle = '#4a76a8';
  ctx.lineWidth = 2;
  
  for (let i = 0; i < width; i++) {
    const offset = Math.floor(i * step);
    let min = 1.0;
    let max = -1.0;
    
    for (let j = 0; j < step; j++) {
      const datum = data[offset + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    
    const y1 = ((1 + min) * height) / 2;
    const y2 = ((1 + max) * height) / 2;
    
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  
  ctx.stroke();

  // Add progress indicator
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  canvas.parentElement.appendChild(progressBar);

  // Add seek functionality
  canvas.parentElement.addEventListener('click', (e) => {
    if (!audioBuffer) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seekPosition = (x / rect.width) * audioBuffer.duration;
    
    // Update seek slider
    const seekSlider = waveformContainer.querySelector('.seek-slider');
    if (seekSlider) {
      seekSlider.value = Math.floor((seekPosition / audioBuffer.duration) * 1000);
    }
    
    // Stop current playback
    if (audioSource) {
      audioSource.stop();
      audioSource = null;
    }
    
    // If already playing or autoPlay is enabled, start from new position
    if (isPlaying) {
      startPlayback(seekPosition);
    } else {
      // Just update the visuals
      const timeInfo = waveformContainer.querySelector('.file-info span:last-child');
      if (timeInfo) {
        timeInfo.textContent = `${formatTime(seekPosition)} / ${formatTime(audioBuffer.duration)}`;
      }
      const progressBar = waveformContainer.querySelector('.progress-bar');
      if (progressBar) {
        progressBar.style.width = `${(seekPosition / audioBuffer.duration) * 100}%`;
      }
    }
  });
}

// Handle play/pause toggle
function handlePlayToggle() {
  if (!audioBuffer) return;
  
  if (isPlaying) {
    // Stop playback
    if (audioSource) {
      audioSource.stop();
      audioSource = null;
    }
    stopSeekbarUpdates();
  } else {
    // Get current progress position from seekbar
    const seekSlider = waveformContainer.querySelector('.seek-slider');
    let startTime = 0;
    if (seekSlider) {
      const progress = parseFloat(seekSlider.value) / 1000;
      startTime = progress * audioBuffer.duration;
    }
    
    // Start playback from current position
    startPlayback(startTime);
  }
  
  isPlaying = !isPlaying;
  updatePlayButton();
}

// Update playback time
function updatePlaybackTime() {
  if (!isPlaying || !audioSource || !audioBuffer) return;
  
  const currentTime = audioContext.currentTime;
  const offset = currentTime % audioBuffer.duration;
  const progress = (offset / audioBuffer.duration);
  
  // Update time display
  const timeInfo = waveformContainer.querySelector('.file-info span:last-child');
  if (timeInfo) {
    timeInfo.textContent = `${formatTime(offset)} / ${formatTime(audioBuffer.duration)}`;
  }
  
  // Update progress bar
  const progressBar = waveformContainer.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progress * 100}%`;
  }
  
  // Update seek slider
  const seekSlider = waveformContainer.querySelector('.seek-slider');
  if (seekSlider) {
    seekSlider.value = Math.floor(progress * 1000);
  }
  
  animationFrame = requestAnimationFrame(updatePlaybackTime);
}

// Handle restart
function handleRestart() {
  if (!audioBuffer) return;
  
  // Stop current playback
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
  }
  stopSeekbarUpdates();
  
  // Reset seek slider and progress bar
  const seekSlider = waveformContainer.querySelector('.seek-slider');
  if (seekSlider) {
    seekSlider.value = 0;
  }
  
  const progressBar = waveformContainer.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = '0%';
  }
  
  // Update time display
  const timeInfo = waveformContainer.querySelector('.file-info span:last-child');
  if (timeInfo) {
    timeInfo.textContent = `00:00 / ${formatTime(audioBuffer.duration)}`;
  }
  
  // Start playback from beginning
  startPlayback(0);
  isPlaying = true;
  updatePlayButton();
}

// Handle loop toggle
function handleLoopToggle() {
  isLooping = !isLooping;
  
  // Update audio source if it exists
  if (audioSource) {
    audioSource.loop = isLooping;
  }
  
  // Update loop button in toolbar
  loopBtn.textContent = isLooping ? 'Loop: On' : 'Loop: Off';
  loopBtn.classList.toggle('active', isLooping);
  
  // Update loop button in waveform controls if it exists
  const loopToggleBtn = waveformContainer.querySelector('.control-btn:last-child');
  if (loopToggleBtn) {
    loopToggleBtn.textContent = isLooping ? 'Loop: On' : 'Loop: Off';
    loopToggleBtn.classList.toggle('active', isLooping);
  }
  
  // Store loop preference
  localStorage.setItem('sampleBrowserLoop', isLooping);
}

// Reset waveform
function resetWaveform() {
  // Stop any ongoing playback and updates
  stopSeekbarUpdates();
  
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  
  // Stop and disconnect audio source
  if (audioSource) {
    try {
      audioSource.stop();
    } catch (e) {
      // Ignore errors if already stopped
    }
    audioSource.disconnect();
    audioSource = null;
  }
  
  // Clean up audio nodes in correct order
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  
  // Reset audio buffer
  audioBuffer = null;
  isPlaying = false;
  updatePlayButton();
  
  // Show empty state
  waveformContainer.innerHTML = `
    <div class="waveform-empty">
      <div>No sample selected</div>
      <div style="font-size: 12px; margin-top: 5px;">
        Select an audio file to view waveform
      </div>
    </div>
  `;
}

// Handle volume change
function handleVolumeChange() {
  const volume = volumeSlider.value / 100;
  
  if (gainNode) {
    gainNode.gain.value = volume;
  }
  
  localStorage.setItem('sampleBrowserVolume', volume);
}

// Update play button state
function updatePlayButton() {
  playBtn.textContent = isPlaying ? 'Pause' : 'Play';
  playBtn.classList.toggle('active', isPlaying);
  
  // Also update the control button in the waveform area if it exists
  const controlBtn = waveformContainer.querySelector('.control-btn');
  if (controlBtn) {
    controlBtn.textContent = isPlaying ? 'Pause' : 'Play';
  }
}

// Update loop button state
function updateLoopButton() {
  loopBtn.textContent = isLooping ? 'Loop: On' : 'Loop: Off';
  loopBtn.classList.toggle('active', isLooping);
}

// Update status bar
function updateStatusBar(message) {
  statusBar.textContent = message;
}

// Format file size
function formatSize(bytes) {
  if (!bytes) return '-';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Format time in MM:SS format
function formatTime(seconds) {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Handle Home button click
function handleHomeClick() {
  if (currentZip) {
    // Return to the root of the ZIP file
    currentZipDir = null;
    pathDisplay.textContent = currentZip;
    updateZipDirectoryView();
  } else if (currentPath) {
    // Reload the root directory
    const rootPath = currentPath;
    loadDirectoryContent(rootPath);
    pathDisplay.textContent = rootPath;
  }
}

// Handle autoplay toggle
function handleAutoPlayToggle() {
  autoPlay = !autoPlay;
  const autoPlayBtn = document.getElementById('autoPlayBtn');
  autoPlayBtn.textContent = autoPlay ? 'AutoPlay: On' : 'AutoPlay: Off';
  autoPlayBtn.classList.toggle('active', autoPlay);
  
  // Store the autoplay setting for future sessions
  localStorage.setItem('sampleBrowserAutoPlay', autoPlay);
  console.log('AutoPlay set to:', autoPlay);
}

// Initialize pack creation functionality
function initPackCreation() {
  // Add currentPackPath to track current directory
  window.currentPackPath = '';
  
  const exportPackBtn = document.getElementById('exportPackBtn');
  const clearPackBtn = document.getElementById('clearPackBtn');
  const packDropZone = document.getElementById('packDropZone');
  const packTree = document.getElementById('packTree');
  const contextMenu = document.getElementById('contextMenu');
  
  // Set up event listeners
  exportPackBtn.addEventListener('click', handleExportPack);
  clearPackBtn.addEventListener('click', handleClearPack);
  
  // Set up drag and drop
  packDropZone.addEventListener('dragover', handleDragOver);
  packDropZone.addEventListener('dragleave', handleDragLeave);
  packDropZone.addEventListener('drop', handleDrop);
  
  // Make audio files draggable
  document.addEventListener('dragstart', handleDragStart);
  
  // Context menu
  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });
  
  packTree.addEventListener('contextmenu', handleContextMenu);
}

// Handle creating a new pack
async function handleNewPack() {
  debugLog('\n📦 NEW PACK OPERATION STARTED');
  debugState('BEFORE_PACK_CREATION');

  try {
    // Clean up audio resources first
    await cleanupAudioResources();
    
    const name = await showPromptModal('Create New Pack', 'Enter pack name:', 'New Pack');
    if (!name) {
      debugLog('❌ Pack creation cancelled');
      return;
    }

    currentPack = {
      name,
      items: [],
      folders: {}
    };

    window.currentPackPath = '';
    updatePackTree();
    updateStatusBar('New pack created');
    debugState('AFTER_PACK_CREATION');
  } catch (error) {
    debugError('Pack creation error:', error);
    updateStatusBar('Error creating pack');
  }
}

// Add debug state validation function
function validateState(context) {
  const state = {
    currentZip,
    currentZipDir,
    currentPath,
    currentPackPath: window.currentPackPath,
    audioContextState: audioContext?.state || 'none',
    audioBuffer: !!audioBuffer,
    isPlaying
  };
  
  log('debug', `State validation at ${context}`, state);
  
  if (currentZip && currentPath) {
    log('error', 'Invalid state: both currentZip and currentPath set', state);
  }
  
  if (window.currentPackPath && !currentPack.folders[window.currentPackPath]) {
    log('error', 'Invalid pack path in state', state);
  }
}

// Modified handleNewFolder with virtual path handling
async function handleNewFolder(parentPath = '') {
  debugLog('\n📂 NEW FOLDER OPERATION STARTED');
  debugLog('Parent Path:', parentPath);
  debugState('BEFORE_FOLDER_CREATION');

  try {
    // 1. Clean up audio resources first
    await cleanupAudioResources();
    
    // 2. Backup current state
    const appState = {
      navigation: {
        currentZip,
        currentZipDir,
        currentPath,
        selectedFile
      },
      pack: JSON.parse(JSON.stringify(currentPack))
    };
    debugLog('📦 State backup created');

    // 3. Get folder name
    debugLog('📝 Requesting folder name...');
    const name = await showPromptModal('Create New Folder', 'Enter folder name:', 'New Folder');
    
    if (!name) {
      debugLog('❌ Folder creation cancelled');
      return;
    }

    // 4. Create virtual folder path
    debugLog(`📁 Creating virtual folder: ${name}`);
    const newPath = parentPath ? `${parentPath}/${name}` : name;
    
    if (!currentPack) {
      debugLog('  Creating new pack...');
      currentPack = { name: 'New Pack', items: [], folders: {} };
    }

    // 5. Validate folder path
    if (currentPack.folders[newPath]) {
      throw new Error('Folder already exists');
    }

    // 6. Create virtual folder
    currentPack.folders[newPath] = [];
    debugLog(`  ✓ Virtual folder created at: ${newPath}`);

    // 7. Update UI
    debugLog('🔄 Updating UI...');
    window.currentPackPath = newPath;
    await updatePackTree();
    debugLog('  ✓ UI updated');

    // 8. Restore navigation state
    debugLog('🔄 Restoring navigation state...');
    currentZip = appState.navigation.currentZip;
    currentZipDir = appState.navigation.currentZipDir;
    currentPath = appState.navigation.currentPath;
    selectedFile = appState.navigation.selectedFile;
    debugLog('  ✓ Navigation state restored');

    debugState('AFTER_FOLDER_CREATION');
  } catch (error) {
    console.error('Error creating folder:', error);
    debugLog('❌ Folder creation failed:', error);
    updateStatusBar('Error creating folder');
    
    // Attempt state recovery
    debugLog('🔄 Attempting state recovery...');
    currentPack = JSON.parse(JSON.stringify(appState.pack));
    await updatePackTree();
  }
}

// Add these helper functions
async function cleanupAudioResources() {
  try {
    debugLog('🧹 Starting audio resource cleanup');
    
    // Stop and disconnect audio source if it exists
    if (audioSource) {
      try {
        audioSource.stop();
        audioSource.disconnect();
        debugLog('  ✓ Audio source stopped and disconnected');
      } catch (e) {
        debugError('  ✗ Error stopping source:', e);
      }
      audioSource = null;
    }

    // Disconnect gain node if it exists
    if (gainNode) {
      try {
        gainNode.disconnect();
        debugLog('  ✓ Gain node disconnected');
      } catch (e) {
        debugError('  ✗ Error disconnecting gain:', e);
      }
      gainNode = null;
    }

    // Only close audio context if we're doing a full cleanup (e.g., switching files)
    if (audioContext && audioContext.state === 'closed') {
      try {
        debugLog('  ℹ Creating new audio context (previous was closed)');
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        debugError('  ✗ Error creating new audio context:', e);
      }
    } else if (audioContext) {
      try {
        await audioContext.suspend();
        debugLog('  ✓ Audio context suspended');
      } catch (e) {
        debugError('  ✗ Error suspending context:', e);
      }
    }

    // Reset audio buffer
    audioBuffer = null;
    isPlaying = false;
    updatePlayButton();
    
    debugLog('🧹 Audio cleanup completed');
  } catch (error) {
    debugError('❌ Cleanup error:', error);
  }
}

async function restoreAppState(appState) {
  try {
    // Restore navigation state
    currentZip = appState.navigation.currentZip;
    currentZipDir = appState.navigation.currentZipDir;
    currentPath = appState.navigation.currentPath;
    selectedFile = appState.navigation.selectedFile;

    // Only restore audio if it was active
    if (appState.audio.context && appState.audio.context.state === 'running') {
      debugLog('  Restoring audio context...');
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  } catch (error) {
    debugError('State restoration error:', error);
    throw error;
  }
}

// Handle exporting the pack
async function handleExportPack() {
  debugLog('\n📤 PACK EXPORT STARTED');
  debugState('BEFORE_PACK_EXPORT');

  try {
    // Clean up audio resources first
    await cleanupAudioResources();
    
    if (!currentPack || (!currentPack.items.length && !Object.keys(currentPack.folders).length)) {
      updateStatusBar('No items to export');
      return;
    }

    updateStatusBar('Preparing pack for export...');
    
    // Create a temporary directory for the pack
    const packPath = await ipcRenderer.invoke('create-temp-pack-dir', currentPack.name);
    debugLog(`Created temp directory: ${packPath}`);
    
    // Process root items first
    debugLog(`Processing ${currentPack.items.length} root items`);
    for (const item of currentPack.items) {
      try {
        updateStatusBar(`Processing ${item.name}...`);
        const targetPath = `${packPath}/${item.name}`;
        
        if (item.inZip) {
          // Extract from ZIP and copy
          const audioData = await ipcRenderer.invoke('extract-audio-from-zip', item.zipPath, item.sourcePath);
          await ipcRenderer.invoke('write-audio-to-pack', audioData, targetPath);
        } else {
          // Direct file copy
          await ipcRenderer.invoke('copy-file-to-pack', item.sourcePath, targetPath);
        }
        debugLog(`✓ Processed root item: ${item.name}`);
      } catch (error) {
        console.error(`Error processing ${item.name}:`, error);
        debugLog(`❌ Failed to process root item: ${item.name}`);
        updateStatusBar(`Error processing ${item.name}`);
      }
    }
    
    // Process virtual folders and their items
    debugLog(`Processing ${Object.keys(currentPack.folders).length} folders`);
    for (const [folderPath, items] of Object.entries(currentPack.folders)) {
      try {
        // Create the physical folder
        const physicalFolderPath = `${packPath}/${folderPath}`;
        await ipcRenderer.invoke('create-pack-folder', physicalFolderPath);
        debugLog(`Created folder: ${folderPath}`);
        
        // Process items in this folder
        debugLog(`Processing ${items.length} items in ${folderPath}`);
        for (const item of items) {
          try {
            updateStatusBar(`Processing ${folderPath}/${item.name}...`);
            const targetPath = `${physicalFolderPath}/${item.name}`;
            
            if (item.inZip) {
              // Extract from ZIP and copy
              const audioData = await ipcRenderer.invoke('extract-audio-from-zip', item.zipPath, item.sourcePath);
              await ipcRenderer.invoke('write-audio-to-pack', audioData, targetPath);
            } else {
              // Direct file copy
              await ipcRenderer.invoke('copy-file-to-pack', item.sourcePath, targetPath);
            }
            debugLog(`✓ Processed item: ${folderPath}/${item.name}`);
          } catch (error) {
            console.error(`Error processing ${folderPath}/${item.name}:`, error);
            debugLog(`❌ Failed to process item: ${folderPath}/${item.name}`);
            updateStatusBar(`Error processing ${folderPath}/${item.name}`);
          }
        }
      } catch (error) {
        console.error(`Error processing folder ${folderPath}:`, error);
        debugLog(`❌ Failed to process folder: ${folderPath}`);
        updateStatusBar(`Error processing folder ${folderPath}`);
      }
    }
    
    // Show save dialog
    const savePath = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Save Sample Pack',
      defaultPath: `${currentPack.name}.zip`,
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
    });
    
    if (savePath) {
      updateStatusBar('Creating final ZIP file...');
      await ipcRenderer.invoke('create-pack-zip', packPath, savePath);
      debugLog('✓ Pack exported successfully');
      updateStatusBar(`Pack exported successfully to ${savePath}`);
    } else {
      debugLog('Pack export cancelled by user');
      updateStatusBar('Pack export cancelled');
    }
  } catch (error) {
    debugError('Pack export error:', error);
    updateStatusBar('Error exporting pack');
  }
}

// Handle clearing the pack
async function handleClearPack() {
  const confirmed = await showConfirmModal('Clear Pack', 'Are you sure you want to clear the entire pack? This cannot be undone.');
  if (confirmed) {
    currentPack.items = [];
    currentPack.folders = {};
    selectedPackItem = null;
    updatePackTree();
    updatePackStats();
  }
}

// Show a confirmation modal dialog
function showConfirmModal(title, message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-title">${title}</div>
      <div class="modal-content">
        <div class="message">${message}</div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="cancel">Cancel</button>
        <button class="btn btn-danger" data-action="confirm">Clear Pack</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    modal.querySelector('[data-action="cancel"]').onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };
    
    modal.querySelector('[data-action="confirm"]').onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };
  });
}

// Handle drag start
function handleDragStart(event) {
  if (event.target.closest('tr')) {
    const row = event.target.closest('tr');
    const file = files.find(f => f.path === row.dataset.path);
    if (file) {
      event.dataTransfer.setData('text/plain', JSON.stringify(file));
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
}

// Handle drag over
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  event.target.closest('.drop-zone').classList.add('drag-over');
}

// Handle drag leave
function handleDragLeave(event) {
  event.preventDefault();
  event.target.closest('.drop-zone').classList.remove('drag-over');
}

// Handle drop
async function handleDrop(event) {
  event.preventDefault();
  event.target.closest('.drop-zone').classList.remove('drag-over');
  
  try {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.isAudio) {
      const item = {
        name: data.name,
        path: data.name,
        sourcePath: data.inZip ? data.path : data.path, // Store original path
        size: data.size || (data.stats ? data.stats.size : 0),
        inZip: data.inZip || false,
        zipPath: data.inZip ? (data.zipPath || currentZip) : null, // Store original ZIP path
        isAudio: true
      };
      
      // Get the current folder path from the pack tree navigation
      const currentFolder = window.currentPackPath;
      
      if (currentFolder) {
        // Initialize the folder if it doesn't exist
        if (!currentPack.folders[currentFolder]) {
          currentPack.folders[currentFolder] = [];
        }
        
        // Add to current folder
        currentPack.folders[currentFolder].push(item);
        updateStatusBar(`Added ${item.name} to folder ${currentFolder}`);
      } else {
        // Add to root
        currentPack.items.push(item);
        updateStatusBar(`Added ${item.name} to root`);
      }
      
      updatePackTree();
      updatePackStats();
    }
  } catch (error) {
    console.error('Error handling drop:', error);
    updateStatusBar('Error adding item to pack');
  }
}

// Handle context menu
function handleContextMenu(event) {
  event.preventDefault();
  
  const target = event.target.closest('.pack-tree-item');
  if (target) {
    selectedPackItem = target.dataset.path;
    
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    
    // Set up context menu actions
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
      item.onclick = () => handleContextMenuAction(item.dataset.action);
    });
  }
}

// Handle context menu actions
async function handleContextMenuAction(action) {
  if (!selectedPackItem) return;
  
  switch (action) {
    case 'rename':
      const newName = await showPromptModal('Rename Item', 'Enter new name:', selectedPackItem.split('/').pop());
      if (newName) {
        renamePackItem(selectedPackItem, newName);
      }
      break;
    
    case 'delete':
      deletePackItem(selectedPackItem);
      break;
    
    case 'newfolder':
      handleNewFolder(selectedPackItem);
      break;
  }
  
  document.getElementById('contextMenu').style.display = 'none';
}

// Rename a pack item
function renamePackItem(oldPath, newName) {
  // Extract the extension from the old path
  const oldExtension = oldPath.split('.').pop();
  
  // If it's a folder, just use the new name as is
  if (currentPack.folders[oldPath]) {
    // Rename folder
    const newPath = oldPath.split('/').slice(0, -1).concat(newName).join('/');
    currentPack.folders[newPath] = currentPack.folders[oldPath];
    delete currentPack.folders[oldPath];
  } else {
    // For files, ensure we preserve the extension
    const item = currentPack.items.find(i => i.path === oldPath);
    if (item) {
      // If new name already has the correct extension, use it as is
      if (newName.toLowerCase().endsWith('.' + oldExtension.toLowerCase())) {
        item.name = newName;
        item.path = newName;
      } else {
        // Otherwise, append the original extension
        item.name = `${newName}.${oldExtension}`;
        item.path = `${newName}.${oldExtension}`;
      }
    }
  }
  
  updatePackTree();
  updateStatusBar(`Renamed to ${newName}`);
}

// Delete a pack item
function deletePackItem(path) {
  if (currentPack.folders[path]) {
    // Delete folder
    delete currentPack.folders[path];
  } else {
    // Delete file
    currentPack.items = currentPack.items.filter(i => i.path !== path);
  }
  
  updatePackTree();
  updatePackStats();
}

// Update pack tree display
function updatePackTree() {
  const packTree = document.getElementById('packTree');
  if (!packTree) return;

  // Create tree view HTML
  let html = '<ul class="pack-tree">';
  
  // Add items at root level
  if (currentPack.items) {
    currentPack.items.forEach(item => {
      html += `<li class="pack-tree-item pack-item ${item === selectedFile ? 'selected' : ''}" data-path="${item.path}">
        <span class="item-name">${item.name}</span>
        <button class="remove-item" title="Remove from pack">×</button>
      </li>`;
    });
  }
  
  // Add folders
  for (const [folderPath, items] of Object.entries(currentPack.folders)) {
    const folderName = folderPath.split('/').pop();
    html += `<li class="pack-folder pack-tree-item" data-path="${folderPath}">
      <span class="folder-name">${folderName}</span>
      <ul>`;
    
    items.forEach(item => {
      html += `<li class="pack-tree-item pack-item ${item === selectedFile ? 'selected' : ''}" data-path="${item.path}" data-folder="${folderPath}">
        <span class="item-name">${item.name}</span>
        <button class="remove-item" title="Remove from pack">×</button>
      </li>`;
    });
    
    html += '</ul></li>';
  }
  
  html += '</ul>';
  packTree.innerHTML = html;

  // Add click handlers for all items (both root and in folders)
  const packItems = packTree.querySelectorAll('.pack-tree-item');
  packItems.forEach(item => {
    // Add click handler
    item.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent event bubbling
      const path = item.dataset.path;
      const folderPath = item.dataset.folder;
      
      // Update current pack path for navigation
      window.currentPackPath = folderPath || '';
      
      // Handle folders differently
      if (item.classList.contains('pack-folder')) {
        window.currentPackPath = path;
        updatePackTree(); // Refresh tree to show current location
        return;
      }
      
      // Find and play the item
      let packItem;
      if (folderPath) {
        // Item is in a folder
        packItem = currentPack.folders[folderPath]?.find(i => i.path === path);
      } else {
        // Item is at root
        packItem = currentPack.items.find(i => i.path === path);
      }
      
      if (packItem) {
        // Add isAudio flag and ensure sourcePath is set
        packItem = {
          ...packItem,
          isAudio: true,
          sourcePath: packItem.sourcePath || packItem.path
        };
        handlePackItemClick(packItem);
      }
    });

    // Add remove button handler
    const removeBtn = item.querySelector('.remove-item');
    if (removeBtn) {
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent triggering item selection
        const path = item.dataset.path;
        const folderPath = item.dataset.folder;
        
        if (folderPath) {
          // Remove from folder
          const folderItems = currentPack.folders[folderPath];
          const itemIndex = folderItems.findIndex(i => i.path === path);
          if (itemIndex > -1) {
            folderItems.splice(itemIndex, 1);
            updateStatusBar(`Removed ${path.split('/').pop()} from ${folderPath}`);
          }
        } else {
          // Remove from root
          const itemIndex = currentPack.items.findIndex(i => i.path === path);
          if (itemIndex > -1) {
            currentPack.items.splice(itemIndex, 1);
            updateStatusBar(`Removed ${path.split('/').pop()} from pack`);
          }
        }
        
        updatePackTree();
        updatePackStats();
      });
    }
    
    // Add context menu handler
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      selectedPackItem = item.dataset.path;
      const contextMenu = document.getElementById('contextMenu');
      contextMenu.style.display = 'block';
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
      
      // Set up context menu actions
      contextMenu.querySelectorAll('.context-menu-item').forEach(menuItem => {
        menuItem.onclick = () => handleContextMenuAction(menuItem.dataset.action);
      });
    });
  });
}

// Helper function to find a pack item by path
function findPackItemByPath(path) {
  // Check root items
  const rootItem = currentPack.items.find(item => item.path === path);
  if (rootItem) return { ...rootItem, isAudio: true, sourcePath: rootItem.sourcePath || rootItem.path };

  // Check folder items
  for (const [folderPath, items] of Object.entries(currentPack.folders)) {
    const folderItem = items.find(item => item.path === path);
    if (folderItem) return { ...folderItem, isAudio: true, sourcePath: folderItem.sourcePath || folderItem.path };
  }

  return null;
}

// Add pack item playback support
async function handlePackItemClick(item) {
  try {
    debugLog('🎵 Pack item click handler started', { item });
    
    // Only handle audio files
    if (!item.isAudio) {
      debugLog('  ℹ Ignoring non-audio item');
      return;
    }

    // Clean up existing audio source if switching to a new audio file
    if (audioSource) {
      try {
        audioSource.stop();
        audioSource.disconnect();
        debugLog('  ✓ Previous audio source cleaned up');
      } catch (e) {
        debugError('  ✗ Error cleaning up previous source:', e);
      }
      audioSource = null;
    }
    
    // Handle audio context initialization
    if (!audioContext || audioContext.state === 'closed') {
      debugLog('  ℹ Creating new audio context');
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContext.state === 'suspended') {
      debugLog('  ℹ Resuming suspended audio context');
      await audioContext.resume();
    }

    // Force reset waveform container
    waveformContainer.innerHTML = '';
    debugLog('  ✓ Waveform container reset');
    
    // Select audio file
    selectedFile = item;
    
    // Load and play the audio file
    debugLog('  ℹ Loading audio file');
    await loadAudioFile(item);
    
    // Ensure the waveform is visible by scrolling to it
    waveformContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    debugLog('  ✓ Scrolled to waveform');

    // Update UI to show this item is selected
    updatePackTree();
    debugLog('🎵 Pack item successfully loaded');
    
  } catch (error) {
    debugError('❌ Pack item playback failed:', error);
    log('error', 'Pack item playback failed', {
      error: error.message,
      item: item,
      audioContextState: audioContext?.state
    });
    updateStatusBar(`Error playing pack item: ${error.message}`);
  }
}

// Update pack statistics
function updatePackStats() {
  const stats = document.getElementById('packStats');
  const totalItems = currentPack.items.length + 
    Object.values(currentPack.folders).reduce((sum, items) => sum + items.length, 0);
  
  stats.textContent = `${totalItems} items`;
}

// Show a prompt modal dialog
function showPromptModal(title, message, defaultValue = '') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-title">${title}</div>
      <div class="modal-content">
        <div class="input-group">
          <label class="input-label">${message}</label>
          <input type="text" class="text-input" value="${defaultValue}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="cancel">Cancel</button>
        <button class="btn" data-action="ok">OK</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('.text-input');
    input.select();
    
    modal.querySelector('[data-action="cancel"]').onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
    
    modal.querySelector('[data-action="ok"]').onclick = () => {
      const value = input.value.trim();
      document.body.removeChild(overlay);
      resolve(value || null);
    };
    
    input.onkeyup = (event) => {
      if (event.key === 'Enter') {
        const value = input.value.trim();
        document.body.removeChild(overlay);
        resolve(value || null);
      } else if (event.key === 'Escape') {
        document.body.removeChild(overlay);
        resolve(null);
      }
    };
  });
}

// Add styles to the document
const style = document.createElement('style');
style.textContent = `
  .waveform-wrapper {
    position: relative;
    width: 100%;
    margin-bottom: 10px;
  }
  
  .progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 0;
    background-color: rgba(74, 118, 168, 0.2);
    pointer-events: none;
    transition: width 0.1s linear;
  }
  
  .seek-control {
    width: 100%;
    padding: 10px 0;
  }
  
  .seek-slider {
    width: 100%;
    margin: 0;
    cursor: pointer;
  }

  /* Volume slider custom styles */
  #volumeSlider {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: #1a1a1a;
    outline: none;
    opacity: 0.9;
    transition: all 0.2s;
    cursor: pointer;
  }

  /* Slider track - webkit browsers */
  #volumeSlider::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    background: linear-gradient(to right, #00ff00 var(--value, 50%), #1a1a1a var(--value, 50%));
    border-radius: 2px;
    border: none;
  }

  /* Slider thumb - webkit browsers */
  #volumeSlider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #00ff00;
    box-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
    margin-top: -6px;
    border: 2px solid #000;
    cursor: pointer;
    transition: all 0.2s;
  }

  /* Slider track - Firefox */
  #volumeSlider::-moz-range-track {
    width: 100%;
    height: 4px;
    background: #1a1a1a;
    border-radius: 2px;
    border: none;
  }

  /* Slider thumb - Firefox */
  #volumeSlider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #00ff00;
    box-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
    border: 2px solid #000;
    cursor: pointer;
    transition: all 0.2s;
  }

  /* Hover states */
  #volumeSlider:hover {
    opacity: 1;
  }

  #volumeSlider:hover::-webkit-slider-thumb {
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.7);
    transform: scale(1.1);
  }

  #volumeSlider:hover::-moz-range-thumb {
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.7);
    transform: scale(1.1);
  }

  /* Active states */
  #volumeSlider:active::-webkit-slider-thumb {
    box-shadow: 0 0 12px rgba(0, 255, 0, 0.9);
    transform: scale(1.2);
  }

  #volumeSlider:active::-moz-range-thumb {
    box-shadow: 0 0 12px rgba(0, 255, 0, 0.9);
    transform: scale(1.2);
  }
`;
document.head.appendChild(style);

// Add this code after the style definition to update the volume slider's gradient
function updateVolumeSliderGradient() {
  const value = volumeSlider.value;
  volumeSlider.style.setProperty('--value', `${value}%`);
}

// Add event listener for volume changes to update the gradient
volumeSlider.addEventListener('input', updateVolumeSliderGradient);

// Initial update of the gradient
updateVolumeSliderGradient();

// Add function to start seekbar updates
function startSeekbarUpdates() {
  if (seekUpdateInterval) {
    clearInterval(seekUpdateInterval);
  }
  
  seekUpdateInterval = setInterval(() => {
    if (!audioContext || !audioBuffer || !isPlaying) return;
    
    const currentTime = audioContext.currentTime;
    const startTime = audioSource.startTime || 0;
    const offset = (currentTime - startTime) % audioBuffer.duration;
    const progress = (offset / audioBuffer.duration);
    
    // Update time display
    const timeInfo = waveformContainer.querySelector('.file-info span:last-child');
    if (timeInfo) {
      timeInfo.textContent = `${formatTime(offset)} / ${formatTime(audioBuffer.duration)}`;
    }
    
    // Update progress bar
    const progressBar = waveformContainer.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progress * 100}%`;
    }
    
    // Update seek slider
    const seekSlider = waveformContainer.querySelector('.seek-slider');
    if (seekSlider) {
      seekSlider.value = Math.floor(progress * 1000);
    }
  }, 50); // Update every 50ms for smooth movement
}

// Add function to stop seekbar updates
function stopSeekbarUpdates() {
  if (seekUpdateInterval) {
    clearInterval(seekUpdateInterval);
    seekUpdateInterval = null;
  }
}

// Update startPlayback function to properly handle volume
function startPlayback(startTime = 0) {
  if (!audioBuffer) {
    log('error', 'Cannot start playback - no audio buffer');
    return;
  }
  
  try {
    // Ensure audio context is running
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Create and configure new audio source
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.loop = isLooping;
    
    // Create new gain node if it doesn't exist
    if (!gainNode) {
      gainNode = audioContext.createGain();
    }
    gainNode.gain.value = volumeSlider.value / 100;
    
    // Create new analyzer if it doesn't exist
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
    }
    
    // Disconnect any existing connections
    try {
      gainNode.disconnect();
      analyser.disconnect();
    } catch (e) {
      // Ignore disconnection errors
    }
    
    // Connect nodes: source -> gain -> analyzer -> destination
    audioSource.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // Store start time for accurate progress tracking
    audioSource.startTime = audioContext.currentTime - startTime;
    
    // Start playback from specified time
    audioSource.start(0, startTime);
    
    // Start seekbar updates
    startSeekbarUpdates();
    
    log('info', 'Playback started', {
      startTime,
      audioContextState: audioContext.state,
      isLooping,
      volume: gainNode.gain.value
    });
  } catch (error) {
    log('error', 'Playback failed', {
      error: error.message,
      stack: error.stack,
      startTime,
      audioContextState: audioContext?.state
    });
    updateStatusBar(`Playback failed: ${error.message}`);
  }
}

// Add this new cleanup function
function resetBrowserState() {
  window.currentPackPath = '';
  currentZipDir = null;
  if (audioContext) {
    audioContext.close().then(() => {
      audioContext = null;
    });
  }
}

// Initialize batch processing functionality
function initBatchProcessing() {
  // Add batch ZIP processing button to toolbar
  const batchZipBtn = document.createElement('button');
  batchZipBtn.id = 'batchZipBtn';
  batchZipBtn.className = 'btn';
  batchZipBtn.innerHTML = '📦 Batch ZIP';
  batchZipBtn.style.marginLeft = 'auto'; // Push to right side
  batchZipBtn.addEventListener('click', handleBatchZipClick);

  // Add the button to toolbar
  const toolbar = document.querySelector('.toolbar');
  toolbar.appendChild(batchZipBtn);

  // Create floating window for drag & drop
  batchWindow = document.createElement('div');
  batchWindow.className = 'batch-window';
  batchWindow.style.display = 'none';
  batchWindow.innerHTML = `
    <div class="batch-window-header">
      <span>Batch ZIP Processor</span>
      <button class="close-btn">×</button>
    </div>
    <div class="batch-window-content">
      <div class="drop-zone" id="batchDropZone">
        <div class="drop-message">
          Drop ZIP files here<br>
          <span style="font-size: 12px">or click to select</span>
        </div>
      </div>
      <div class="batch-status"></div>
    </div>
  `;

  document.body.appendChild(batchWindow);

  // Get references to batch window elements
  batchDropZone = document.getElementById('batchDropZone');
  batchStatus = batchWindow.querySelector('.batch-status');

  // Set up batch window event listeners
  const batchHeader = batchWindow.querySelector('.batch-window-header');
  batchHeader.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Handle batch window close
  const closeBtn = batchWindow.querySelector('.close-btn');
  closeBtn.addEventListener('click', () => {
    batchWindow.style.display = 'none';
  });

  // Set up drag and drop handlers
  batchDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    batchDropZone.classList.add('drag-over');
  });

  batchDropZone.addEventListener('dragleave', () => {
    batchDropZone.classList.remove('drag-over');
  });

  batchDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    batchDropZone.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files)
      .filter(file => file.name.toLowerCase().endsWith('.zip'))
      .map(file => file.path);
      
    if (files.length > 0) {
      processBatchZips(files);
    }
  });

  batchDropZone.addEventListener('click', async () => {
    const files = await ipcRenderer.invoke('select-multiple-zips');
    if (files.length > 0) {
      processBatchZips(files);
    }
  });
}

// Batch window drag handlers
function dragStart(e) {
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
  
  if (e.target === batchWindow.querySelector('.batch-window-header')) {
    isDragging = true;
  }
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
    
    batchWindow.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }
}

function dragEnd() {
  isDragging = false;
}

// Handle batch ZIP button click
async function handleBatchZipClick() {
  batchWindow.style.display = 'block';
  if (!batchWindow.style.transform) {
    // Center window on first open
    const rect = batchWindow.getBoundingClientRect();
    const x = (window.innerWidth - rect.width) / 2;
    const y = (window.innerHeight - rect.height) / 2;
    batchWindow.style.transform = `translate(${x}px, ${y}px)`;
    xOffset = x;
    yOffset = y;
  }
}

// Process batch of ZIP files
async function processBatchZips(zipPaths) {
  try {
    batchStatus.textContent = 'Processing ZIPs...';
    batchStatus.style.color = '#e0e0e0';
    
    const outputPath = await ipcRenderer.invoke('process-multiple-zips', zipPaths);
    
    batchStatus.innerHTML = `
      Success! Combined pack saved to:<br>
      <span style="font-size: 12px; color: #4a9eff">${outputPath}</span>
    `;
    batchStatus.style.color = '#4caf50';
  } catch (error) {
    console.error('Error processing ZIPs:', error);
    batchStatus.textContent = 'Error processing ZIPs';
    batchStatus.style.color = '#f44336';
  }
}

// Add styles for batch processing window
const batchStyles = document.createElement('style');
batchStyles.textContent = `
  .batch-window {
    position: fixed;
    top: 0;
    left: 0;
    width: 400px;
    background: #2d2d2d;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }
  
  .batch-window-header {
    padding: 8px 12px;
    background: #3c3c3c;
    border-bottom: 1px solid #4c4c4c;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #e0e0e0;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
  }
  
  .close-btn:hover {
    color: #ffffff;
  }
  
  .batch-window-content {
    padding: 16px;
  }
  
  .batch-window .drop-zone {
    border: 2px dashed #4c4c4c;
    border-radius: 4px;
    padding: 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .batch-window .drop-zone:hover,
  .batch-window .drop-zone.drag-over {
    border-color: #4a9eff;
    background: rgba(74, 158, 255, 0.1);
  }
  
  .drop-message {
    color: #e0e0e0;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .batch-status {
    margin-top: 12px;
    font-size: 14px;
    line-height: 1.5;
    min-height: 42px;
  }
`;

document.head.appendChild(batchStyles);

// Initialize the application
init(); 