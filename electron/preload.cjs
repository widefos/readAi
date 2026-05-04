const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveBookFile: (payload) => ipcRenderer.invoke('books:save-file', payload),
  readBookFile: (fullPath) => ipcRenderer.invoke('books:read-file', fullPath),
  getLibraryData: () => ipcRenderer.invoke('library:get-all'),
  saveBook: (book) => ipcRenderer.invoke('library:save-book', book),
  deleteBook: (bookId) => ipcRenderer.invoke('library:delete-book', bookId),
  saveChat: (payload) => ipcRenderer.invoke('library:save-chat', payload),
  saveProgress: (payload) => ipcRenderer.invoke('library:save-progress', payload),
  openPdfInDefaultViewer: (fullPath) => ipcRenderer.invoke('books:open-in-default-viewer', fullPath),
});

