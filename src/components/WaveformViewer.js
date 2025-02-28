import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import WaveSurfer from 'wavesurfer.js';

const { ipcRenderer } = window.require('electron');

const WaveformContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888888;
  font-size: 14px;
  text-align: center;
`;

const WaveformWrapper = styled.div`
  flex: 1;
  width: 100%;
  background-color: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
`;

const FileInfo = styled.div`
  font-size: 14px;
  padding: 8px 0;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
`;

const FileName = styled.span`
  font-weight: 500;
`;

const PlaybackControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
`;

const ControlButton = styled.button`
  background-color: #333333;
  border: 1px solid #555555;
  color: #e0e0e0;
  border-radius: 3px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: #444444;
  }
  
  &:active {
    background-color: #222222;
  }
`;

const WaveformViewer = ({ selectedFile, isPlaying, isLooping, onPlayToggle }) => {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Format time in MM:SS format
  const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Initialize or update WaveSurfer when selectedFile changes
  useEffect(() => {
    const loadAudio = async () => {
      setIsReady(false);
      
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
      
      if (!selectedFile || !waveformRef.current) return;
      
      try {
        // Create WaveSurfer instance
        const wavesurfer = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: '#4a76a8',
          progressColor: '#0e639c',
          cursorColor: '#ffffff',
          cursorWidth: 2,
          height: 150,
          barWidth: 2,
          barGap: 1,
          responsive: true,
          normalize: true,
          interact: true,
          hideScrollbar: false,
          partialRender: true,
          backend: 'WebAudio'
        });
        
        wavesurferRef.current = wavesurfer;
        
        // Load audio data
        let audioData;
        if (selectedFile.inZip) {
          audioData = await ipcRenderer.invoke('extract-audio-from-zip', selectedFile.zipPath, selectedFile.path);
        } else {
          audioData = await ipcRenderer.invoke('read-audio-file', selectedFile.path);
        }
        
        if (audioData) {
          // Load audio data
          wavesurfer.loadArrayBuffer(audioData);
          
          // Set event handlers
          wavesurfer.on('ready', () => {
            setIsReady(true);
            setDuration(wavesurfer.getDuration());
            
            // Set loop
            wavesurfer.setLoop(isLooping);
            
            // Auto play
            if (isPlaying) {
              wavesurfer.play();
            }
          });
          
          wavesurfer.on('audioprocess', () => {
            setCurrentTime(wavesurfer.getCurrentTime());
          });
          
          wavesurfer.on('finish', () => {
            if (!isLooping) {
              onPlayToggle();
            }
          });
        }
      } catch (error) {
        console.error('Error loading audio:', error);
      }
    };
    
    loadAudio();
    
    // Clean up
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, [selectedFile]);
  
  // Handle play/pause
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      if (isPlaying) {
        wavesurferRef.current.play();
      } else {
        wavesurferRef.current.pause();
      }
    }
  }, [isPlaying, isReady]);
  
  // Handle loop toggle
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setLoop(isLooping);
    }
  }, [isLooping, isReady]);
  
  // Jump to beginning
  const handleRestart = () => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.seekTo(0);
    }
  };
  
  if (!selectedFile) {
    return (
      <WaveformContainer>
        <EmptyState>
          <div>No sample selected</div>
          <div style={{ fontSize: '12px', marginTop: '5px' }}>
            Select an audio file to view waveform
          </div>
        </EmptyState>
      </WaveformContainer>
    );
  }
  
  return (
    <WaveformContainer>
      <FileInfo>
        <FileName>{selectedFile.name}</FileName>
        {isReady && (
          <span style={{ marginLeft: '10px', color: '#aaaaaa', fontSize: '12px' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        )}
      </FileInfo>
      
      <WaveformWrapper ref={waveformRef} />
      
      <PlaybackControls>
        <ControlButton onClick={onPlayToggle}>
          {isPlaying ? 'Pause' : 'Play'}
        </ControlButton>
        <ControlButton onClick={handleRestart}>
          Restart
        </ControlButton>
      </PlaybackControls>
    </WaveformContainer>
  );
};

export default WaveformViewer; 