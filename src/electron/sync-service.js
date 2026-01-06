// Background Sync Service
// Runs in Electron main process, orchestrates plugin syncing

import { BrowserWindow, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Config directory
const CANOPY_DIR = path.join(os.homedir(), '.canopy');
const CONFIG_FILE = path.join(CANOPY_DIR, 'config.json');
const SECRETS_FILE = path.join(CANOPY_DIR, 'secrets.json'); // Should be encrypted in production
const UPLOADS_DIR = path.join(CANOPY_DIR, 'uploads');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(CANOPY_DIR)) {
    fs.mkdirSync(CANOPY_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Config management
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return {
    plugins: {},
    lastSync: {},
    preferences: {
      syncOnStart: true,
      syncOnWake: true,
    },
  };
}

function saveConfig(config) {
  ensureDirectories();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Secrets management (simplified - use electron-store + safeStorage in production)
function loadSecrets() {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load secrets:', error);
  }
  return {};
}

function saveSecrets(secrets) {
  ensureDirectories();
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

function getPluginTokens(pluginId) {
  const secrets = loadSecrets();
  return secrets[pluginId] || null;
}

function setPluginTokens(pluginId, tokens) {
  const secrets = loadSecrets();
  secrets[pluginId] = tokens;
  saveSecrets(secrets);
}

function clearPluginTokens(pluginId) {
  const secrets = loadSecrets();
  delete secrets[pluginId];
  saveSecrets(secrets);
}

// Sync Service
class SyncService {
  constructor() {
    this.intervals = new Map();
    this.plugins = new Map();
    this.config = loadConfig();
    this.isActive = false;
  }
  
  // Register a plugin (called from renderer via IPC)
  registerPlugin(plugin) {
    this.plugins.set(plugin.id, {
      ...plugin,
      state: this.config.plugins[plugin.id] || {
        enabled: false,
        connected: false,
        lastSync: null,
      },
    });
    console.log(`Sync service registered plugin: ${plugin.name}`);
  }
  
  // Start the sync service
  start() {
    if (this.isActive) return;
    this.isActive = true;
    
    ensureDirectories();
    
    // Start sync loops for enabled plugins
    for (const [id, plugin] of this.plugins) {
      if (plugin.state.enabled && plugin.state.connected) {
        this.startPluginSync(id);
      }
    }
    
    // Listen for system wake
    powerMonitor.on('resume', () => {
      console.log('System resumed, triggering wake sync');
      this.onSystemWake();
    });
    
    console.log('Sync service started');
  }
  
  stop() {
    this.isActive = false;
    
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    
    console.log('Sync service stopped');
  }
  
  // Calculate next sync interval based on smart schedule
  getNextInterval(plugin) {
    const schedule = plugin.syncSchedule;
    
    if (schedule.type === 'fixed') {
      return schedule.intervalMs || 3600000; // Default 1 hour
    }
    
    // Smart scheduling
    const hour = new Date().getHours();
    const isActiveHours = 
      schedule.activeHours &&
      hour >= schedule.activeHours.start &&
      hour < schedule.activeHours.end;
    
    if (isActiveHours) {
      return schedule.activeIntervalMs || 1800000; // 30 min default
    } else {
      return schedule.inactiveIntervalMs || 14400000; // 4 hours default
    }
  }
  
  // Start sync loop for a plugin
  startPluginSync(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    // Clear existing interval
    if (this.intervals.has(pluginId)) {
      clearInterval(this.intervals.get(pluginId));
    }
    
    // Initial sync
    this.syncPlugin(pluginId);
    
    // Set up recurring sync with smart interval
    const scheduleNext = () => {
      const interval = this.getNextInterval(plugin);
      console.log(`[${pluginId}] Next sync in ${interval / 60000} minutes`);
      
      const timer = setTimeout(async () => {
        await this.syncPlugin(pluginId);
        scheduleNext();
      }, interval);
      
      this.intervals.set(pluginId, timer);
    };
    
    scheduleNext();
  }
  
  // Stop sync loop for a plugin
  stopPluginSync(pluginId) {
    if (this.intervals.has(pluginId)) {
      clearTimeout(this.intervals.get(pluginId));
      this.intervals.delete(pluginId);
    }
  }
  
  // Sync a single plugin
  async syncPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return { success: false, error: 'Plugin not found' };
    
    console.log(`[${pluginId}] Starting sync...`);
    const startTime = Date.now();
    
    try {
      // Get tokens
      const tokens = getPluginTokens(pluginId);
      if (!tokens) {
        throw new Error('No tokens found');
      }
      
      // Notify renderer that sync started
      this.notifyRenderer('sync:started', { pluginId });
      
      // Get last sync time
      const lastSync = this.config.lastSync[pluginId]
        ? new Date(this.config.lastSync[pluginId])
        : undefined;
      
      // Call plugin sync (this would be the actual API call)
      // For now, we just simulate
      const signals = []; // plugin.sync(lastSync, tokens)
      
      // Update last sync time
      this.config.lastSync[pluginId] = new Date().toISOString();
      saveConfig(this.config);
      
      // Notify renderer
      this.notifyRenderer('sync:completed', {
        pluginId,
        signalCount: signals.length,
        duration: Date.now() - startTime,
      });
      
      console.log(`[${pluginId}] Sync complete: ${signals.length} signals in ${Date.now() - startTime}ms`);
      
      return { success: true, signals };
      
    } catch (error) {
      console.error(`[${pluginId}] Sync failed:`, error);
      
      this.notifyRenderer('sync:failed', {
        pluginId,
        error: error.message,
      });
      
      return { success: false, error: error.message };
    }
  }
  
  // Handle system wake
  async onSystemWake() {
    if (!this.config.preferences.syncOnWake) return;
    
    for (const [id, plugin] of this.plugins) {
      if (plugin.state.enabled && plugin.state.connected && plugin.syncSchedule.syncOnWake) {
        await this.syncPlugin(id);
      }
    }
  }
  
  // Notify renderer process
  notifyRenderer(channel, data) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
  
  // Plugin state management
  enablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.state.enabled = true;
      this.config.plugins[pluginId] = plugin.state;
      saveConfig(this.config);
    }
  }
  
  disablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.state.enabled = false;
      this.stopPluginSync(pluginId);
      this.config.plugins[pluginId] = plugin.state;
      saveConfig(this.config);
    }
  }
  
  setPluginConnected(pluginId, connected, tokens) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.state.connected = connected;
      this.config.plugins[pluginId] = plugin.state;
      saveConfig(this.config);
      
      if (tokens) {
        setPluginTokens(pluginId, tokens);
      } else if (!connected) {
        clearPluginTokens(pluginId);
      }
      
      // Start/stop sync based on connection
      if (connected && plugin.state.enabled) {
        this.startPluginSync(pluginId);
      } else {
        this.stopPluginSync(pluginId);
      }
    }
  }
  
  getPluginState(pluginId) {
    const plugin = this.plugins.get(pluginId);
    return plugin?.state || null;
  }
  
  getAllPluginStates() {
    const states = {};
    for (const [id, plugin] of this.plugins) {
      states[id] = plugin.state;
    }
    return states;
  }
}

// Export singleton
export const syncService = new SyncService();

// Export config helpers for IPC
export {
  ensureDirectories,
  loadConfig,
  saveConfig,
  getPluginTokens,
  setPluginTokens,
  clearPluginTokens,
  CANOPY_DIR,
  UPLOADS_DIR,
};
