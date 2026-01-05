// Canopy - Electron Preload Script
// Exposes safe IPC methods to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('canopy', {
  // Entities
  getEntities: () => ipcRenderer.invoke('db:getEntities'),
  createEntity: (data) => ipcRenderer.invoke('db:createEntity', data),
  updateEntityMention: (entityId) => ipcRenderer.invoke('db:updateEntityMention', { entityId }),
  deleteEntity: (entityId) => ipcRenderer.invoke('db:deleteEntity', { entityId }),
  
  // Relationships
  getRelationships: () => ipcRenderer.invoke('db:getRelationships'),
  upsertRelationship: (data) => ipcRenderer.invoke('db:upsertRelationship', data),
  
  // Captures
  createCapture: (data) => ipcRenderer.invoke('db:createCapture', data),
  getRecentCaptures: (limit) => ipcRenderer.invoke('db:getRecentCaptures', { limit }),
  
  // Threads
  createThread: (title) => ipcRenderer.invoke('db:createThread', { title }),
  getRecentThreads: (limit) => ipcRenderer.invoke('db:getRecentThreads', { limit }),
  updateThread: (data) => ipcRenderer.invoke('db:updateThread', data),
  
  // Messages
  addMessage: (data) => ipcRenderer.invoke('db:addMessage', data),
  getThreadMessages: (threadId) => ipcRenderer.invoke('db:getThreadMessages', { threadId }),
  
  // Memories
  createMemory: (data) => ipcRenderer.invoke('db:createMemory', data),
  getMemories: (limit) => ipcRenderer.invoke('db:getMemories', { limit }),
  deleteMemory: (memoryId) => ipcRenderer.invoke('db:deleteMemory', { memoryId }),
  
  // Search
  search: (query) => ipcRenderer.invoke('db:search', { query }),
  
  // ============ Signals (from integrations) ============
  addSignal: (data) => ipcRenderer.invoke('db:addSignal', data),
  addSignals: (signals) => ipcRenderer.invoke('db:addSignals', { signals }),
  getSignals: (opts) => ipcRenderer.invoke('db:getSignals', opts || {}),
  getLatestSignal: (source, type) => ipcRenderer.invoke('db:getLatestSignal', { source, type }),
  
  // ============ Plugin State ============
  getPluginState: (pluginId) => ipcRenderer.invoke('db:getPluginState', { pluginId }),
  setPluginState: (data) => ipcRenderer.invoke('db:setPluginState', data),
  getAllPluginStates: () => ipcRenderer.invoke('db:getAllPluginStates'),
  
  // ============ Uploads ============
  createUpload: (data) => ipcRenderer.invoke('db:createUpload', data),
  updateUploadStatus: (id, status, error) => ipcRenderer.invoke('db:updateUploadStatus', { id, status, error }),
  setUploadExtracted: (id, extracted) => ipcRenderer.invoke('db:setUploadExtracted', { id, extracted }),
  getUploads: (opts) => ipcRenderer.invoke('db:getUploads', opts || {}),
  deleteUpload: (id) => ipcRenderer.invoke('db:deleteUpload', { id }),
  
  // ============ File Operations ============
  saveUpload: (id, filename, data) => ipcRenderer.invoke('fs:saveUpload', { id, filename, data }),
  getUploadPath: () => ipcRenderer.invoke('fs:getUploadPath'),
  getCanopyDir: () => ipcRenderer.invoke('fs:getCanopyDir'),
  
  // ============ Secrets ============
  getSecret: (key) => ipcRenderer.invoke('secrets:get', { key }),
  setSecret: (key, value) => ipcRenderer.invoke('secrets:set', { key, value }),
  deleteSecret: (key) => ipcRenderer.invoke('secrets:delete', { key }),
  
  // ============ Sync Events ============
  onSyncStarted: (callback) => {
    ipcRenderer.on('sync:started', (event, data) => callback(data));
  },
  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync:completed', (event, data) => callback(data));
  },
  onSyncFailed: (callback) => {
    ipcRenderer.on('sync:failed', (event, data) => callback(data));
  },
});
