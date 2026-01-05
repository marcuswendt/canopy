// Apple Notes Reference Plugin
// Searches your Apple Notes on demand using macOS APIs
// Only works on macOS — uses AppleScript/JXA via Electron

import type { 
  ReferencePlugin, 
  SearchOptions, 
  SearchResult, 
  ReferenceItem,
} from './types';

// =============================================================================
// APPLE NOTES TYPES
// =============================================================================

interface AppleNote {
  id: string;
  name: string;
  body: string;
  plaintext: string;
  folder: string;
  creationDate: Date;
  modificationDate: Date;
}

interface AppleNotesFolder {
  id: string;
  name: string;
  noteCount: number;
}

// =============================================================================
// APPLESCRIPT COMMANDS
// =============================================================================

// These will be executed via Electron's shell or osascript
const APPLESCRIPT = {
  // Search notes containing query
  search: (query: string, limit: number) => `
    tell application "Notes"
      set matchingNotes to {}
      set searchQuery to "${query.replace(/"/g, '\\"')}"
      
      repeat with aNote in notes
        if plaintext of aNote contains searchQuery then
          set end of matchingNotes to {id:(id of aNote), name:(name of aNote), plaintext:(plaintext of aNote), folder:(name of container of aNote), created:(creation date of aNote), modified:(modification date of aNote)}
          if (count of matchingNotes) ≥ ${limit} then exit repeat
        end if
      end repeat
      
      return matchingNotes
    end tell
  `,
  
  // Get all folders
  getFolders: () => `
    tell application "Notes"
      set folderList to {}
      repeat with aFolder in folders
        set end of folderList to {id:(id of aFolder), name:(name of aFolder), noteCount:(count of notes of aFolder)}
      end repeat
      return folderList
    end tell
  `,
  
  // Get notes in specific folder
  getNotesInFolder: (folderName: string, limit: number) => `
    tell application "Notes"
      set folderNotes to {}
      tell folder "${folderName.replace(/"/g, '\\"')}"
        repeat with aNote in notes
          set end of folderNotes to {id:(id of aNote), name:(name of aNote), plaintext:(plaintext of aNote), created:(creation date of aNote), modified:(modification date of aNote)}
          if (count of folderNotes) ≥ ${limit} then exit repeat
        end repeat
      end tell
      return folderNotes
    end tell
  `,
  
  // Get specific note by ID
  getNote: (noteId: string) => `
    tell application "Notes"
      set theNote to note id "${noteId.replace(/"/g, '\\"')}"
      return {id:(id of theNote), name:(name of theNote), body:(body of theNote), plaintext:(plaintext of theNote), folder:(name of container of theNote), created:(creation date of theNote), modified:(modification date of theNote)}
    end tell
  `,
  
  // Test if Notes is available
  testConnection: () => `
    tell application "Notes"
      return (count of notes) > 0
    end tell
  `,
};

// =============================================================================
// EXECUTE APPLESCRIPT
// =============================================================================

async function executeAppleScript(script: string): Promise<any> {
  // This will be called via Electron IPC in production
  // For now, we'll use a mock or the actual osascript command
  
  if (typeof window !== 'undefined' && (window as any).canopy?.executeAppleScript) {
    return (window as any).canopy.executeAppleScript(script);
  }
  
  // Fallback: not available
  throw new Error('AppleScript execution not available - requires Electron on macOS');
}

// =============================================================================
// HELPERS
// =============================================================================

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function parseAppleScriptResult(result: any): AppleNote[] {
  // AppleScript returns a specific format that needs parsing
  // This is a simplified version — real implementation would handle AS format
  if (Array.isArray(result)) {
    return result.map(item => ({
      id: item.id || '',
      name: item.name || 'Untitled',
      body: item.body || '',
      plaintext: item.plaintext || '',
      folder: item.folder || 'Notes',
      creationDate: new Date(item.created || Date.now()),
      modificationDate: new Date(item.modified || Date.now()),
    }));
  }
  return [];
}

// =============================================================================
// STATE
// =============================================================================

let isConnected = false;
let availableFolders: AppleNotesFolder[] = [];

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export const appleNotesPlugin: ReferencePlugin = {
  id: 'apple-notes',
  name: 'Apple Notes',
  description: 'Search your Apple Notes',
  icon: '📒',
  
  platform: 'darwin',  // macOS only
  
  authType: 'local',   // No OAuth — uses local macOS permissions
  
  connected: false,
  
  capabilities: {
    search: true,
    getPage: true,
    embed: true,
    link: false,       // Apple Notes doesn't have web URLs
    write: false,
  },
  
  relevanceSignals: [
    'notes',
    'apple notes',
    'my notes',
    'wrote down',
    'noted',
    'jotted',
  ],
  
  connect: async () => {
    try {
      // Test if we can access Notes
      const result = await executeAppleScript(APPLESCRIPT.testConnection());
      
      if (result) {
        isConnected = true;
        appleNotesPlugin.connected = true;
        
        // Cache folder list
        const folders = await executeAppleScript(APPLESCRIPT.getFolders());
        availableFolders = folders || [];
      } else {
        throw new Error('Could not access Apple Notes');
      }
    } catch (error) {
      isConnected = false;
      appleNotesPlugin.connected = false;
      throw new Error('Apple Notes access denied. Please grant permission in System Preferences > Security & Privacy > Automation');
    }
  },
  
  disconnect: async () => {
    isConnected = false;
    appleNotesPlugin.connected = false;
    availableFolders = [];
  },
  
  testConnection: async () => {
    try {
      const result = await executeAppleScript(APPLESCRIPT.testConnection());
      return !!result;
    } catch {
      return false;
    }
  },
  
  search: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    if (!isConnected) {
      throw new Error('Not connected to Apple Notes');
    }
    
    const limit = options?.limit || 10;
    
    try {
      let rawResults: any[];
      
      // Search specific folder if requested
      if (options?.folder) {
        rawResults = await executeAppleScript(
          APPLESCRIPT.getNotesInFolder(options.folder, limit)
        );
        // Filter by query client-side
        rawResults = rawResults.filter(note => 
          note.plaintext?.toLowerCase().includes(query.toLowerCase()) ||
          note.name?.toLowerCase().includes(query.toLowerCase())
        );
      } else {
        // Search all notes
        rawResults = await executeAppleScript(
          APPLESCRIPT.search(query, limit)
        );
      }
      
      const notes = parseAppleScriptResult(rawResults);
      
      // Convert to SearchResult format
      return notes.map(note => ({
        id: note.id,
        source: 'apple-notes',
        title: note.name,
        snippet: truncate(note.plaintext, 200),
        type: 'note' as const,
        createdAt: note.creationDate,
        updatedAt: note.modificationDate,
        tags: [note.folder],  // Use folder as tag
        icon: '📒',
      }));
      
    } catch (error) {
      console.error('Apple Notes search failed:', error);
      throw error;
    }
  },
  
  getItem: async (noteId: string): Promise<ReferenceItem | null> => {
    if (!isConnected) {
      throw new Error('Not connected to Apple Notes');
    }
    
    try {
      const result = await executeAppleScript(APPLESCRIPT.getNote(noteId));
      
      if (!result) return null;
      
      const note: AppleNote = {
        id: result.id,
        name: result.name || 'Untitled',
        body: result.body || '',
        plaintext: result.plaintext || '',
        folder: result.folder || 'Notes',
        creationDate: new Date(result.created || Date.now()),
        modificationDate: new Date(result.modified || Date.now()),
      };
      
      return {
        id: note.id,
        source: 'apple-notes',
        title: note.name,
        content: note.plaintext,
        type: 'note',
        createdAt: note.creationDate,
        updatedAt: note.modificationDate,
        preview: truncate(note.plaintext, 500),
      };
      
    } catch (error) {
      console.error('Failed to get Apple Note:', error);
      return null;
    }
  },
};

// =============================================================================
// FOLDER HELPERS
// =============================================================================

export function getAvailableFolders(): AppleNotesFolder[] {
  return availableFolders;
}

export async function refreshFolders(): Promise<AppleNotesFolder[]> {
  if (!isConnected) return [];
  
  try {
    const folders = await executeAppleScript(APPLESCRIPT.getFolders());
    availableFolders = folders || [];
    return availableFolders;
  } catch {
    return [];
  }
}

export default appleNotesPlugin;
