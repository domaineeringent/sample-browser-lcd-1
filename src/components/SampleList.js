import React from 'react';
import styled from 'styled-components';
import path from 'path';

const ListContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  font-size: 13px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
`;

const TableHeader = styled.thead`
  background-color: #2d2d2d;
  position: sticky;
  top: 0;
  z-index: 1;
`;

const TableRow = styled.tr`
  cursor: pointer;
  height: 24px;
  
  &:nth-child(odd) {
    background-color: #252526;
  }
  
  &:nth-child(even) {
    background-color: #1e1e1e;
  }
  
  &:hover {
    background-color: #2a2d2e;
  }
  
  &.selected {
    background-color: #04395e;
  }
`;

const TableHeaderCell = styled.th`
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #3c3c3c;
  font-weight: 500;
  color: #cccccc;
  white-space: nowrap;
`;

const TableCell = styled.td`
  padding: 4px 8px;
  border-bottom: 1px solid #3c3c3c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e0e0e0;
`;

const AudioIcon = styled.span`
  color: #569cd6;
  margin-right: 5px;
`;

const NoItemsMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: #888;
`;

const SampleList = ({ files, selectedFile, onFileSelect, currentZip }) => {
  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '-';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };
  
  // Format duration (not implemented for brevity)
  const formatDuration = () => {
    return '-';
  };
  
  if (files.length === 0) {
    return (
      <ListContainer>
        <NoItemsMessage>
          {!currentZip && !selectedFile ? 
            'Open a folder or ZIP file to view audio samples' : 
            'No audio samples found in this location'}
        </NoItemsMessage>
      </ListContainer>
    );
  }
  
  return (
    <ListContainer>
      <Table>
        <TableHeader>
          <tr>
            <TableHeaderCell style={{ width: '40%' }}>Name</TableHeaderCell>
            <TableHeaderCell style={{ width: '20%' }}>Type</TableHeaderCell>
            <TableHeaderCell style={{ width: '15%' }}>Size</TableHeaderCell>
            <TableHeaderCell style={{ width: '15%' }}>Duration</TableHeaderCell>
          </tr>
        </TableHeader>
        <tbody>
          {files.map((file, index) => (
            <TableRow 
              key={index} 
              className={selectedFile && selectedFile.path === file.path ? 'selected' : ''}
              onClick={() => onFileSelect(file)}
            >
              <TableCell>
                <AudioIcon>🔊</AudioIcon>
                {file.name}
              </TableCell>
              <TableCell>{path.extname(file.name).toUpperCase().slice(1)}</TableCell>
              <TableCell>
                {file.inZip 
                  ? formatSize(file.size) 
                  : formatSize(file.stats ? file.stats.size : 0)}
              </TableCell>
              <TableCell>{formatDuration()}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </ListContainer>
  );
};

export default SampleList; 