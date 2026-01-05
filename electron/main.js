// Canopy - Electron Main Process
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Canopy directory
const CANOPY_DIR = path.join(os.homedir(), '.canopy');
const UPLOADS_DIR = path.join(CANOPY_DIR, 'uploads');
const SECRETS_FILE = path.join(CANOPY_DIR, 'secrets.json');

// Ensure directories exist
function ensureDirectories() {
  [CANOPY_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Database setup - unified in ~/.canopy/
const dbPath = path.join(CANOPY_DIR, 'canopy.db');
let db;

function initDatabase() {
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      description TEXT,
      image_path TEXT,
      icon TEXT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_mentioned DATETIME
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, type)
    );

    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      entities JSON,
      domains JSON,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT,
      domains JSON,
      entity_ids JSON,
      message_count INTEGER DEFAULT 0,
      summary TEXT,
      summary_up_to INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      entities JSON,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      entities JSON,
      importance REAL DEFAULT 0.5,
      tags JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    -- Integration signals from plugins (WHOOP, Strava, etc.)
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      domain TEXT,
      entity_ids JSON,
      data JSON NOT NULL,
      capacity_impact JSON,
      processed BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Plugin state
    CREATE TABLE IF NOT EXISTS plugin_state (
      plugin_id TEXT PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      connected BOOLEAN DEFAULT FALSE,
      last_sync DATETIME,
      settings JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- File uploads
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER,
      local_path TEXT,
      source TEXT DEFAULT 'drop',
      original_url TEXT,
      status TEXT DEFAULT 'pending',
      extracted JSON,
      entity_id TEXT,
      thread_id TEXT,
      domain TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    );

    -- Artifacts (plans, notes, documents)
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      entities JSON,
      domains JSON,
      pinned BOOLEAN DEFAULT FALSE,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);
    CREATE INDEX IF NOT EXISTS idx_artifacts_updated ON artifacts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_entities_last_mentioned ON entities(last_mentioned);
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at);
    CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
    CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
    CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
    CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
  `);
  
  ensureDirectories();
  console.log('Database initialized at:', dbPath);
  console.log('Canopy directory:', CANOPY_DIR);
}

// Window management
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

// App lifecycle
app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (db) {
    db.close();
  }
});

// ============ IPC Handlers ============

// Entities
ipcMain.handle('db:getEntities', () => {
  const stmt = db.prepare(`
    SELECT * FROM entities 
    ORDER BY last_mentioned DESC NULLS LAST, updated_at DESC
  `);
  return stmt.all();
});

ipcMain.handle('db:createEntity', (event, { type, name, domain, description, icon }) => {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO entities (id, type, name, domain, description, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, type, name, domain, description, icon);
  
  const getStmt = db.prepare('SELECT * FROM entities WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:updateEntityMention', (event, { entityId }) => {
  const stmt = db.prepare(`
    UPDATE entities SET last_mentioned = CURRENT_TIMESTAMP WHERE id = ?
  `);
  stmt.run(entityId);
  return { success: true };
});

ipcMain.handle('db:deleteEntity', (event, { entityId }) => {
  const stmt = db.prepare('DELETE FROM entities WHERE id = ?');
  stmt.run(entityId);
  return { success: true };
});

// Relationships
ipcMain.handle('db:getRelationships', () => {
  const stmt = db.prepare('SELECT * FROM relationships');
  return stmt.all();
});

ipcMain.handle('db:upsertRelationship', (event, { sourceId, targetId, type, weight }) => {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO relationships (id, source_id, target_id, type, weight)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, type) DO UPDATE SET
      weight = weight + 0.1,
      created_at = CURRENT_TIMESTAMP
  `);
  stmt.run(id, sourceId, targetId, type, weight || 1.0);
  return { success: true };
});

// Captures
ipcMain.handle('db:createCapture', (event, { content, source, entities, domains }) => {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO captures (id, content, source, entities, domains)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, content, source || 'manual', JSON.stringify(entities), JSON.stringify(domains));
  
  const getStmt = db.prepare('SELECT * FROM captures WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:getRecentCaptures', (event, { limit }) => {
  const stmt = db.prepare(`
    SELECT * FROM captures ORDER BY created_at DESC LIMIT ?
  `);
  return stmt.all(limit || 20);
});

// Threads
ipcMain.handle('db:createThread', (event, { title }) => {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO threads (id, title) VALUES (?, ?)
  `);
  stmt.run(id, title);
  
  const getStmt = db.prepare('SELECT * FROM threads WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:getRecentThreads', (event, { limit }) => {
  const stmt = db.prepare(`
    SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?
  `);
  return stmt.all(limit || 10);
});

ipcMain.handle('db:updateThread', (event, { threadId, domains, entityIds, summary, summaryUpTo }) => {
  const updates = ['updated_at = CURRENT_TIMESTAMP'];
  const params = [];

  if (domains !== undefined) {
    updates.push('domains = ?');
    params.push(JSON.stringify(domains));
  }
  if (entityIds !== undefined) {
    updates.push('entity_ids = ?');
    params.push(JSON.stringify(entityIds));
  }
  if (summary !== undefined) {
    updates.push('summary = ?');
    params.push(summary);
  }
  if (summaryUpTo !== undefined) {
    updates.push('summary_up_to = ?');
    params.push(summaryUpTo);
  }

  params.push(threadId);
  const stmt = db.prepare(`UPDATE threads SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM threads WHERE id = ?');
  return getStmt.get(threadId);
});

// Messages
ipcMain.handle('db:addMessage', (event, { threadId, role, content, entities }) => {
  const id = randomUUID();
  
  // Insert message
  const insertStmt = db.prepare(`
    INSERT INTO messages (id, thread_id, role, content, entities)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStmt.run(id, threadId, role, content, JSON.stringify(entities));
  
  // Update thread
  const updateStmt = db.prepare(`
    UPDATE threads SET 
      message_count = message_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  updateStmt.run(threadId);
  
  const getStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:getThreadMessages', (event, { threadId }) => {
  const stmt = db.prepare(`
    SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC
  `);
  return stmt.all(threadId);
});

// Memories
ipcMain.handle('db:createMemory', (event, { content, sourceType, sourceId, entities, importance }) => {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO memories (id, content, source_type, source_id, entities, importance)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, content, sourceType, sourceId, JSON.stringify(entities), importance || 0.5);
  
  const getStmt = db.prepare('SELECT * FROM memories WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:getMemories', (event, { limit }) => {
  const stmt = db.prepare(`
    SELECT * FROM memories 
    ORDER BY importance DESC, created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit || 50);
});

ipcMain.handle('db:deleteMemory', (event, { memoryId }) => {
  const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
  stmt.run(memoryId);
  return { success: true };
});

// Search across entities and memories
ipcMain.handle('db:search', (event, { query }) => {
  const searchTerm = `%${query}%`;
  
  const entities = db.prepare(`
    SELECT 'entity' as type, id, name, domain, description 
    FROM entities 
    WHERE name LIKE ? OR description LIKE ?
    LIMIT 10
  `).all(searchTerm, searchTerm);
  
  const memories = db.prepare(`
    SELECT 'memory' as type, id, content, importance
    FROM memories
    WHERE content LIKE ?
    LIMIT 10
  `).all(searchTerm);
  
  return { entities, memories };
});

// ============ Signals (from integrations) ============

ipcMain.handle('db:addSignal', (event, { id, source, type, timestamp, domain, entityIds, data, capacityImpact }) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO signals (id, source, type, timestamp, domain, entity_ids, data, capacity_impact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, source, type, timestamp, domain, JSON.stringify(entityIds), JSON.stringify(data), JSON.stringify(capacityImpact));
  return { success: true };
});

ipcMain.handle('db:addSignals', (event, { signals }) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO signals (id, source, type, timestamp, domain, entity_ids, data, capacity_impact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((signals) => {
    for (const s of signals) {
      stmt.run(s.id, s.source, s.type, s.timestamp, s.domain, JSON.stringify(s.entityIds || []), JSON.stringify(s.data), JSON.stringify(s.capacityImpact || {}));
    }
  });
  
  insertMany(signals);
  return { success: true, count: signals.length };
});

ipcMain.handle('db:getSignals', (event, { source, type, since, limit }) => {
  let query = 'SELECT * FROM signals WHERE 1=1';
  const params = [];
  
  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  if (since) {
    query += ' AND timestamp > ?';
    params.push(since);
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit || 100);
  
  const stmt = db.prepare(query);
  return stmt.all(...params);
});

ipcMain.handle('db:getLatestSignal', (event, { source, type }) => {
  const stmt = db.prepare(`
    SELECT * FROM signals 
    WHERE source = ? AND type = ?
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  return stmt.get(source, type);
});

// ============ Plugin State ============

ipcMain.handle('db:getPluginState', (event, { pluginId }) => {
  const stmt = db.prepare('SELECT * FROM plugin_state WHERE plugin_id = ?');
  return stmt.get(pluginId);
});

ipcMain.handle('db:setPluginState', (event, { pluginId, enabled, connected, lastSync, settings }) => {
  const stmt = db.prepare(`
    INSERT INTO plugin_state (plugin_id, enabled, connected, last_sync, settings, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(plugin_id) DO UPDATE SET
      enabled = excluded.enabled,
      connected = excluded.connected,
      last_sync = excluded.last_sync,
      settings = excluded.settings,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(pluginId, enabled ? 1 : 0, connected ? 1 : 0, lastSync, JSON.stringify(settings || {}));
  return { success: true };
});

ipcMain.handle('db:getAllPluginStates', () => {
  const stmt = db.prepare('SELECT * FROM plugin_state');
  return stmt.all();
});

// ============ Uploads ============

ipcMain.handle('db:createUpload', (event, { id, filename, mimeType, size, localPath, source, originalUrl, status, domain }) => {
  const stmt = db.prepare(`
    INSERT INTO uploads (id, filename, mime_type, size, local_path, source, original_url, status, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, filename, mimeType, size, localPath, source, originalUrl, status || 'pending', domain);
  return { success: true, id };
});

ipcMain.handle('db:updateUploadStatus', (event, { id, status, error }) => {
  const stmt = db.prepare(`
    UPDATE uploads SET status = ?, error = ?, processed_at = CASE WHEN ? = 'complete' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ?
  `);
  stmt.run(status, error, status, id);
  return { success: true };
});

ipcMain.handle('db:setUploadExtracted', (event, { id, extracted }) => {
  const stmt = db.prepare(`
    UPDATE uploads SET extracted = ?, status = 'complete', processed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(JSON.stringify(extracted), id);
  return { success: true };
});

ipcMain.handle('db:getUploads', (event, { status, entityId, threadId, limit }) => {
  let query = 'SELECT * FROM uploads WHERE 1=1';
  const params = [];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (entityId) {
    query += ' AND entity_id = ?';
    params.push(entityId);
  }
  if (threadId) {
    query += ' AND thread_id = ?';
    params.push(threadId);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit || 50);
  
  const stmt = db.prepare(query);
  return stmt.all(...params);
});

ipcMain.handle('db:deleteUpload', (event, { id }) => {
  const upload = db.prepare('SELECT local_path FROM uploads WHERE id = ?').get(id);

  if (upload && upload.local_path && fs.existsSync(upload.local_path)) {
    fs.unlinkSync(upload.local_path);
  }

  const stmt = db.prepare('DELETE FROM uploads WHERE id = ?');
  stmt.run(id);
  return { success: true };
});

// ============ Artifacts ============

ipcMain.handle('db:getArtifacts', () => {
  const stmt = db.prepare(`
    SELECT * FROM artifacts ORDER BY pinned DESC, updated_at DESC
  `);
  return stmt.all();
});

ipcMain.handle('db:createArtifact', (event, { id, title, type, content, entities, domains, pinned, metadata }) => {
  const artifactId = id || randomUUID();
  const stmt = db.prepare(`
    INSERT INTO artifacts (id, title, type, content, entities, domains, pinned, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    artifactId,
    title,
    type,
    content,
    JSON.stringify(entities || []),
    JSON.stringify(domains || []),
    pinned ? 1 : 0,
    JSON.stringify(metadata || {})
  );

  const getStmt = db.prepare('SELECT * FROM artifacts WHERE id = ?');
  return getStmt.get(artifactId);
});

ipcMain.handle('db:updateArtifact', (event, { id, title, content, pinned, entities, domains, metadata }) => {
  // Build dynamic update query
  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  if (pinned !== undefined) {
    updates.push('pinned = ?');
    params.push(pinned ? 1 : 0);
  }
  if (entities !== undefined) {
    updates.push('entities = ?');
    params.push(JSON.stringify(entities));
  }
  if (domains !== undefined) {
    updates.push('domains = ?');
    params.push(JSON.stringify(domains));
  }
  if (metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(JSON.stringify(metadata));
  }

  if (updates.length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const stmt = db.prepare(`UPDATE artifacts SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM artifacts WHERE id = ?');
  return getStmt.get(id);
});

ipcMain.handle('db:deleteArtifact', (event, { id }) => {
  const stmt = db.prepare('DELETE FROM artifacts WHERE id = ?');
  stmt.run(id);
  return { success: true };
});

ipcMain.handle('db:getArtifactsForEntities', (event, { entityIds }) => {
  // Get artifacts that have any of the specified entities
  const stmt = db.prepare(`
    SELECT * FROM artifacts
    WHERE entities IS NOT NULL
    ORDER BY pinned DESC, updated_at DESC
  `);
  const artifacts = stmt.all();

  // Filter in JS since SQLite JSON handling varies
  return artifacts.filter(artifact => {
    try {
      const artEntities = JSON.parse(artifact.entities || '[]');
      return entityIds.some(id => artEntities.includes(id));
    } catch {
      return false;
    }
  });
});

// ============ File Operations ============

ipcMain.handle('fs:saveUpload', async (event, { id, filename, data }) => {
  const filePath = path.join(UPLOADS_DIR, `${id}-${filename}`);
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);
  return { success: true, path: filePath };
});

ipcMain.handle('fs:getUploadPath', () => UPLOADS_DIR);
ipcMain.handle('fs:getCanopyDir', () => CANOPY_DIR);

// ============ Secrets ============

ipcMain.handle('secrets:get', (event, { key }) => {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      return secrets[key] || null;
    }
  } catch (error) {
    console.error('Failed to read secrets:', error);
  }
  return null;
});

ipcMain.handle('secrets:set', (event, { key, value }) => {
  try {
    let secrets = {};
    if (fs.existsSync(SECRETS_FILE)) {
      secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    }
    secrets[key] = value;
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('secrets:delete', (event, { key }) => {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      delete secrets[key];
      fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ Claude API ============

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

function getClaudeApiKey() {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      return secrets['claude_api_key'] || null;
    }
  } catch (error) {
    console.error('Failed to read Claude API key:', error);
  }
  return null;
}

// Non-streaming completion
ipcMain.handle('claude:complete', async (event, { messages, system, maxTokens, temperature }) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return { error: 'API key not configured', code: 'NO_API_KEY' };
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens || 1024,
        temperature: temperature ?? 0.7,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { error: error.error?.message || 'API request failed', code: response.status };
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: data.usage,
      stopReason: data.stop_reason,
    };
  } catch (error) {
    return { error: error.message, code: 'NETWORK_ERROR' };
  }
});

// Streaming completion
ipcMain.handle('claude:stream', async (event, { messages, system, maxTokens, temperature, streamId }) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    mainWindow.webContents.send('claude:stream:error', { streamId, error: 'API key not configured' });
    return { error: 'API key not configured' };
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens || 1024,
        temperature: temperature ?? 0.7,
        system,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      mainWindow.webContents.send('claude:stream:error', { streamId, error: error.error?.message });
      return { error: error.error?.message };
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta') {
              mainWindow.webContents.send('claude:stream:delta', {
                streamId,
                delta: parsed.delta.text
              });
            } else if (parsed.type === 'message_stop') {
              mainWindow.webContents.send('claude:stream:end', { streamId });
            }
          } catch {}
        }
      }
    }

    mainWindow.webContents.send('claude:stream:end', { streamId });
    return { success: true };
  } catch (error) {
    mainWindow.webContents.send('claude:stream:error', { streamId, error: error.message });
    return { error: error.message };
  }
});

// JSON extraction with schema
ipcMain.handle('claude:extract', async (event, { prompt, schema, input, temperature }) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return { error: 'API key not configured', code: 'NO_API_KEY' };
  }

  const systemPrompt = `You are an expert information extractor. Extract structured data from the user's input.
Always respond with valid JSON matching this schema:
${JSON.stringify(schema, null, 2)}

Important:
- Only include information explicitly stated or strongly implied
- Use null for missing optional fields
- Be conservative with confidence scores
- Do not invent or hallucinate information`;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        temperature: temperature ?? 0.3,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `${prompt}\n\nInput to extract from:\n${input}` }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { error: error.error?.message, code: response.status };
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const extracted = JSON.parse(jsonStr);
    return { data: extracted, usage: data.usage };
  } catch (error) {
    return { error: error.message, code: 'PARSE_ERROR' };
  }
});

// Check if API key exists
ipcMain.handle('claude:hasApiKey', () => {
  return !!getClaudeApiKey();
});
