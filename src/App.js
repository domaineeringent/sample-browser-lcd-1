import React, { useState, useEffect } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import FileExplorer from './components/FileExplorer';
import SampleList from './components/SampleList';
import WaveformViewer from './components/WaveformViewer';
import Toolbar from './components/Toolbar';

const { ipcRenderer } = window.require('electron');

// Global styles
const GlobalStyle = createGlobalStyle`
  body {
    background-color: #1e1e1e;
    color: #e0e0e0;
  }
`;

// App container
const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

// Main layout
const MainLayout = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

// File explorer panel
const ExplorerPanel = styled.div`
  width: 250px;
  background-color: #252526;
  border-right: 1px solid #3c3c3c;
  overflow-y: auto;
`;

// Main content area
const ContentArea = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

// Waveform area
const WaveformArea = styled.div`
  height: 200px;
  background-color: #1e1e1e;
  border-bottom: 1px solid #3c3c3c;
  padding: 10px;
`;

// Status bar
const StatusBar = styled.div`
  height: 24px;
  background-color: #007acc;
  color: #ffffff;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
`;

function App() {
  // State
  const [currentPath, setCurrentPath] = useState(null);
  const [currentZip, setCurrentZip] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [statusText, setStatusText] = useState('Ready');

  // Load directory content when path changes
  useEffect(() => {
    if (currentPath) {
      loadDirectoryContent(currentPath);
    }
  }, [currentPath]);

  // Load ZIP content when ZIP file changes
  useEffect(() => {
    if (currentZip) {
      loadZipContent(currentZip);
    }
  }, [currentZip]);

  // Handle opening a folder
  const handleOpenFolder = async () => {
    setIsLoading(true);
    setStatusText('Opening folder...');
    try {
      const folderPath = await ipcRenderer.invoke('open-folder-dialog');
      if (folderPath) {
        setCurrentPath(folderPath);
        setCurrentZip(null);
        setSelectedFile(null);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
      setStatusText('Error opening folder');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening a ZIP file
  const handleOpenZip = async () => {
    setIsLoading(true);
    setStatusText('Opening ZIP file...');
    try {
      const zipPath = await ipcRenderer.invoke('open-zip-dialog');
      if (zipPath) {
        setCurrentZip(zipPath);
        setCurrentPath(null);
        setSelectedFile(null);
      }
    } catch (error) {
      console.error('Error opening ZIP file:', error);
      setStatusText('Error opening ZIP file');
    } finally {
      setIsLoading(false);
    }
  };

  // Load directory content
  const loadDirectoryContent = async (path) => {
    setIsLoading(true);
    setStatusText(`Loading content from ${path}...`);
    try {
      const contents = await ipcRenderer.invoke('read-directory', path);
      setFiles(contents);
      setStatusText(`Loaded ${contents.length} items`);
    } catch (error) {
      console.error('Error loading directory content:', error);
      setStatusText('Error loading content');
    } finally {
      setIsLoading(false);
    }
  };

  // Load ZIP content
  const loadZipContent = async (zipPath) => {
    setIsLoading(true);
    setStatusText(`Loading content from ZIP...`);
    try {
      const contents = await ipcRenderer.invoke('read-zip-file', zipPath);
      setFiles(contents);
      setStatusText(`Loaded ${contents.length} audio samples from ZIP`);
    } catch (error) {
      console.error('Error loading ZIP content:', error);
      setStatusText('Error loading ZIP content');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (file) => {
    if (file.isDirectory) {
      // Navigate to directory
      setCurrentPath(file.path);
      setSelectedFile(null);
    } else if (file.isAudio) {
      // Select audio file
      setSelectedFile(file);
    }
  };

  // Handle playback toggle
  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
  };

  // Handle loop toggle
  const handleLoopToggle = () => {
    setIsLooping(!isLooping);
  };

  return (
    <>
      <GlobalStyle />
      <AppContainer>
        <Toolbar 
          onOpenFolder={handleOpenFolder} 
          onOpenZip={handleOpenZip}
          isLooping={isLooping}
          onLoopToggle={handleLoopToggle}
          isPlaying={isPlaying}
          onPlayToggle={handlePlayToggle}
          currentPath={currentPath || currentZip}
        />
        <MainLayout>
          <ExplorerPanel>
            <FileExplorer 
              currentPath={currentPath} 
              files={files.filter(f => f.isDirectory)}
              onFileSelect={handleFileSelect}
            />
          </ExplorerPanel>
          <ContentArea>
            <WaveformArea>
              <WaveformViewer 
                selectedFile={selectedFile}
                isPlaying={isPlaying}
                isLooping={isLooping}
                onPlayToggle={handlePlayToggle}
              />
            </WaveformArea>
            <SampleList 
              files={files.filter(f => f.isAudio)} 
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              currentZip={currentZip}
            />
          </ContentArea>
        </MainLayout>
        <StatusBar>{statusText}</StatusBar>
      </AppContainer>
    </>
  );
}

export default App; 