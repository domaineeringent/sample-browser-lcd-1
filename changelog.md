# Changelog

All notable changes to the Sample Browser project will be documented in this file.

## [0.2.4] - 2024-XX-XX
### Added
- Retro terminal-style interface with CRT effects
- Dark/Light theme toggle with green monochrome aesthetics
- Batch ZIP processing functionality
- Enhanced visual feedback with scanlines and screen flicker
- Improved UI organization and controls

### Changed
- Moved theme toggle and batch processing to pack creation panel
- Enhanced visual hierarchy with glowing effects
- Improved button and control styling
- Better visual feedback for user interactions

### Fixed
- CSP issues with external font loading
- Theme toggle functionality
- Batch ZIP button placement
- Various UI consistency issues

## [0.2.3] - 2024-XX-XX
### Added
- Successful subfolder export functionality
- Support for adding samples to nested subfolders
- Improved audio resource cleanup
- Enhanced error handling for file selection

### Changed
- Enhanced pack tree visualization
- Improved drag-and-drop handling for subfolders
- Better memory management for pack folders
- More robust audio state cleanup when switching files

### Fixed
- Pack export now maintains subfolder structure
- Samples are added correctly to current subfolder context
- Fixed application crash when loading audio from a new ZIP after subfolder operations
- Resolved memory leaks from unused folders in pack state
- Improved error recovery when loading audio files

### Known Issues
- None currently known

## [0.2.2] - 2024-XX-XX
### Added
- Robust pack export functionality with multi-source support
- Progress feedback during pack export process
- Error handling for individual file operations during export
- Improved subfolder navigation and file organization

### Changed
- Enhanced pack creation to track source information (ZIP/folder)
- Improved error handling during pack export
- Better status updates during export process
- Fixed drag and drop behavior in subfolders

### Fixed
- Pack export now properly handles files from multiple ZIP archives
- Pack export now correctly maintains folder structure
- Error recovery allows export to continue even if individual files fail
- Drag and drop now correctly adds files to current subfolder

## [0.2.1] - 2024-XX-XX
### Fixed
- Volume slider now properly synchronized with Web Audio API
- Persistent volume control through dedicated gain node
- Volume settings now properly saved and loaded
- Correct audio node connection chain for consistent volume control

### Changed
- Improved audio node architecture for better control
- Enhanced cleanup of audio resources

## [0.2.0] - 2024-XX-XX
### Changed
- Replaced WaveSurfer.js with custom Web Audio API implementation for better control and performance
- Implemented new seekbar with continuous updates using setInterval
- Separated progress visualization from control functionality

### Fixed
- Audio seeking now works while playing
- Playback position is properly remembered when toggling play/pause
- Progress bar updates smoothly during playback
- CSP issues resolved by using direct audio buffer manipulation

### Added
- Dedicated seek slider for precise control
- Visual progress overlay on waveform
- Improved error handling for audio loading

## [0.1.0] - 2024-XX-XX
### Added
- Initial implementation of sample browser
- Basic folder and ZIP navigation
- Audio file browsing with size/duration display
- Waveform visualization with WaveSurfer.js
- Basic playback controls (play/pause, restart, loop)
- Volume control
- AutoPlay functionality
- Drag-and-drop sample organization
- Sub-pack creation and management
