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

  // ============ Suggestions (Bonsai system) ============
  addSuggestion: (data) => ipcRenderer.invoke('db:addSuggestion', data),
  getSuggestionsForThread: (threadId) => ipcRenderer.invoke('db:getSuggestionsForThread', { threadId }),
  updateSuggestionStatus: (id, status) => ipcRenderer.invoke('db:updateSuggestionStatus', { id, status }),
  deleteSuggestion: (id) => ipcRenderer.invoke('db:deleteSuggestion', { id }),
  cleanupExpiredSuggestions: () => ipcRenderer.invoke('db:cleanupExpiredSuggestions'),

  // ============ Signals (from integrations) ============
  addSignal: (data) => ipcRenderer.invoke('db:addSignal', data),
  addSignals: (signals) => ipcRenderer.invoke('db:addSignals', { signals }),
  getSignals: (opts) => ipcRenderer.invoke('db:getSignals', opts || {}),
  getLatestSignal: (source, type) => ipcRenderer.invoke('db:getLatestSignal', { source, type }),
  
  // ============ Plugin State ============
  getPluginState: (pluginId) => ipcRenderer.invoke('db:getPluginState', { pluginId }),
  setPluginState: (data) => ipcRenderer.invoke('db:setPluginState', data),
  getAllPluginStates: () => ipcRenderer.invoke('db:getAllPluginStates'),

  // ============ User Profile ============
  getUserProfile: () => ipcRenderer.invoke('db:getUserProfile'),
  setUserProfile: (data) => ipcRenderer.invoke('db:setUserProfile', data),

  // ============ Uploads ============
  createUpload: (data) => ipcRenderer.invoke('db:createUpload', data),
  updateUploadStatus: (id, status, error) => ipcRenderer.invoke('db:updateUploadStatus', { id, status, error }),
  setUploadExtracted: (id, extracted) => ipcRenderer.invoke('db:setUploadExtracted', { id, extracted }),
  getUploads: (opts) => ipcRenderer.invoke('db:getUploads', opts || {}),
  deleteUpload: (id) => ipcRenderer.invoke('db:deleteUpload', { id }),

  // ============ Artifacts ============
  getArtifacts: () => ipcRenderer.invoke('db:getArtifacts'),
  createArtifact: (data) => ipcRenderer.invoke('db:createArtifact', data),
  updateArtifact: (data) => ipcRenderer.invoke('db:updateArtifact', data),
  deleteArtifact: (id) => ipcRenderer.invoke('db:deleteArtifact', { id }),
  getArtifactsForEntities: (entityIds) => ipcRenderer.invoke('db:getArtifactsForEntities', { entityIds }),

  // ============ File Operations ============
  saveUpload: (id, filename, data) => ipcRenderer.invoke('fs:saveUpload', { id, filename, data }),
  getUploadPath: () => ipcRenderer.invoke('fs:getUploadPath'),
  getCanopyDir: () => ipcRenderer.invoke('fs:getCanopyDir'),

  // ============ Database Management ============
  resetDatabase: () => ipcRenderer.invoke('db:reset'),

  // ============ Profile Management ============
  getProfile: () => ipcRenderer.invoke('profile:get'),
  createProfile: (label) => ipcRenderer.invoke('profile:create', { label }),
  deleteProfile: (profileId) => ipcRenderer.invoke('profile:delete', { profileId }),
  switchProfile: (profileId) => ipcRenderer.invoke('profile:switch', { profileId }),
  
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

  // ============ Claude API ============
  claude: {
    // Non-streaming completion
    complete: (opts) => ipcRenderer.invoke('claude:complete', opts),

    // Start streaming completion
    stream: (opts) => ipcRenderer.invoke('claude:stream', opts),

    // Structured extraction
    extract: (opts) => ipcRenderer.invoke('claude:extract', opts),

    // Check if API key is configured
    hasApiKey: () => ipcRenderer.invoke('claude:hasApiKey'),

    // Stream event listeners
    onStreamDelta: (callback) => {
      ipcRenderer.on('claude:stream:delta', (event, data) => callback(data));
    },
    onStreamEnd: (callback) => {
      ipcRenderer.on('claude:stream:end', (event, data) => callback(data));
    },
    onStreamError: (callback) => {
      ipcRenderer.on('claude:stream:error', (event, data) => callback(data));
    },

    // Remove listeners (for cleanup)
    removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('claude:stream:delta');
      ipcRenderer.removeAllListeners('claude:stream:end');
      ipcRenderer.removeAllListeners('claude:stream:error');
    },
  },

  // ============ Weather ============
  getWeather: (location) => ipcRenderer.invoke('weather:get', { location }),

  // ============ URL Fetching (for persona/web content) ============
  fetchUrl: (url) => ipcRenderer.invoke('fetch:url', { url }),

  // ============ OAuth ============
  oauth: {
    start: (pluginId, config) => ipcRenderer.invoke('oauth:start', { pluginId, config }),
    exchange: (pluginId, code, config) => ipcRenderer.invoke('oauth:exchange', { pluginId, code, config }),
    refresh: (pluginId, config) => ipcRenderer.invoke('oauth:refresh', { pluginId, config }),
  },

  // ============ App Events ============
  onToggleInspector: (callback) => {
    ipcRenderer.on('toggle-inspector', callback);
    return () => ipcRenderer.removeListener('toggle-inspector', callback);
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_event, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
