import React from 'react';
import styled from 'styled-components';

const ToolbarContainer = styled.div`
  height: 40px;
  background-color: #333333;
  border-bottom: 1px solid #3c3c3c;
  display: flex;
  align-items: center;
  padding: 0 10px;
`;

const ToolbarButton = styled.button`
  background-color: #0e639c;
  color: white;
  border: none;
  border-radius: 3px;
  padding: 5px 10px;
  margin-right: 10px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: #1177bb;
  }

  &:active {
    background-color: #0d5789;
  }
`;

const ToggleButton = styled.button`
  background-color: ${props => props.active ? '#5f5f5f' : '#424242'};
  color: ${props => props.active ? '#ffffff' : '#cccccc'};
  border: none;
  border-radius: 3px;
  padding: 5px 10px;
  margin-right: 10px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.active ? '#6f6f6f' : '#525252'};
  }
`;

const PathDisplay = styled.div`
  flex: 1;
  color: #cccccc;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 10px;
`;

const Toolbar = ({ 
  onOpenFolder, 
  onOpenZip, 
  isLooping, 
  onLoopToggle, 
  isPlaying,
  onPlayToggle,
  currentPath 
}) => {
  return (
    <ToolbarContainer>
      <ToolbarButton onClick={onOpenFolder}>
        Open Folder
      </ToolbarButton>
      <ToolbarButton onClick={onOpenZip}>
        Open ZIP
      </ToolbarButton>
      
      {/* Playback controls */}
      <ToggleButton 
        active={isPlaying} 
        onClick={onPlayToggle}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </ToggleButton>
      
      <ToggleButton 
        active={isLooping} 
        onClick={onLoopToggle}
      >
        {isLooping ? 'Loop: On' : 'Loop: Off'}
      </ToggleButton>
      
      <PathDisplay>
        {currentPath ? currentPath : 'No folder or ZIP file selected'}
      </PathDisplay>
    </ToolbarContainer>
  );
};

export default Toolbar; 