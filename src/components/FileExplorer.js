import React from 'react';
import styled from 'styled-components';
import path from 'path';

const ExplorerContainer = styled.div`
  padding: 10px 0;
  user-select: none;
`;

const ExplorerHeader = styled.div`
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  color: #bbbbbb;
  margin-bottom: 5px;
`;

const FileItem = styled.div`
  padding: 4px 10px 4px 15px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background-color: #2a2d2e;
  }
`;

const FolderIcon = styled.span`
  color: #e8ab53;
  margin-right: 5px;
  font-size: 14px;
`;

const FileExplorer = ({ currentPath, files, onFileSelect }) => {
  // Go up one level
  const handleGoUp = () => {
    if (currentPath) {
      const parentPath = path.dirname(currentPath);
      onFileSelect({ path: parentPath, isDirectory: true });
    }
  };

  return (
    <ExplorerContainer>
      <ExplorerHeader>Folders</ExplorerHeader>
      
      {currentPath && (
        <FileItem onClick={handleGoUp}>
          <FolderIcon>↑</FolderIcon>
          ..
        </FileItem>
      )}
      
      {files && files.map((file, index) => (
        <FileItem 
          key={index} 
          onClick={() => onFileSelect(file)}
        >
          <FolderIcon>📁</FolderIcon>
          {file.name}
        </FileItem>
      ))}
      
      {(!currentPath || files.length === 0) && (
        <div style={{ padding: '5px 15px', color: '#888888', fontSize: '12px' }}>
          {!currentPath ? 'Open a folder to start browsing' : 'No subfolders found'}
        </div>
      )}
    </ExplorerContainer>
  );
};

export default FileExplorer; 