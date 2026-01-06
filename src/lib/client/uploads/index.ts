// File Upload System
// Handles file ingestion, processing, and entity extraction

import { v4 as uuid } from 'uuid';
import { extractFromDocument, extractFromUrl as aiExtractFromUrl } from '$lib/ai/extraction';

// =============================================================================
// TYPES
// =============================================================================

export interface FileUpload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  localPath: string;          // Path in ~/.canopy/uploads/

  // Source info
  source: 'drop' | 'paste' | 'select' | 'url';
  originalUrl?: string;       // If fetched from URL

  // The actual file data (for processing)
  file?: File;                // The File object from drag/drop
  dataUrl?: string;           // Base64 data URL for images
  textContent?: string;       // Extracted text content

  // Processing state
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error?: string;

  // Extracted content
  extracted?: ExtractedContent;

  // Associations
  entityId?: string;          // Attached to an entity
  threadId?: string;          // Part of a conversation
  domain?: string;

  createdAt: Date;
  processedAt?: Date;
}

export interface ExtractedContent {
  // Raw text (for documents)
  text?: string;
  
  // Structured extraction
  entities?: EntitySuggestion[];
  summary?: string;
  
  // For images
  description?: string;
  faces?: FaceDetection[];
  
  // Metadata
  title?: string;
  author?: string;
  createdDate?: Date;
  
  // For future semantic search
  embeddings?: number[];
}

export interface EntitySuggestion {
  name: string;
  type: 'person' | 'project' | 'company' | 'event' | 'concept' | 'place';
  domain?: string;
  confidence: number;
  source: string;
  details?: Record<string, any>;
  imageUrl?: string;
}

export interface FaceDetection {
  boundingBox: { x: number; y: number; width: number; height: number };
  suggestedName?: string;    // If matched to existing entity
  entityId?: string;
}

export interface UrlFetch {
  url: string;
  status: 'pending' | 'fetching' | 'complete' | 'failed';
  title?: string;
  description?: string;
  content?: string;
  error?: string;
}

// =============================================================================
// FILE PROCESSING
// =============================================================================

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'rtf': 'application/rtf',
    
    // Spreadsheets
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'csv': 'text/csv',
    
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    
    // Other
    'json': 'application/json',
    'html': 'text/html',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isDocument(mimeType: string): boolean {
  return [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html',
  ].includes(mimeType);
}

export function isUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// =============================================================================
// UPLOAD STORE
// =============================================================================

import { writable, derived } from 'svelte/store';

const uploadsStore = writable<FileUpload[]>([]);

export const uploads = {
  subscribe: uploadsStore.subscribe,
  
  add: (file: Omit<FileUpload, 'id' | 'createdAt' | 'status'>): FileUpload => {
    const upload: FileUpload = {
      ...file,
      id: uuid(),
      status: 'pending',
      createdAt: new Date(),
    };
    uploadsStore.update(u => [...u, upload]);
    return upload;
  },
  
  updateStatus: (id: string, status: FileUpload['status'], error?: string) => {
    uploadsStore.update(uploads => 
      uploads.map(u => u.id === id ? { ...u, status, error } : u)
    );
  },
  
  setExtracted: (id: string, extracted: ExtractedContent) => {
    uploadsStore.update(uploads =>
      uploads.map(u => u.id === id ? { 
        ...u, 
        extracted, 
        status: 'complete',
        processedAt: new Date(),
      } : u)
    );
  },
  
  attachToEntity: (id: string, entityId: string) => {
    uploadsStore.update(uploads =>
      uploads.map(u => u.id === id ? { ...u, entityId } : u)
    );
  },
  
  remove: (id: string) => {
    uploadsStore.update(uploads => uploads.filter(u => u.id !== id));
  },
  
  clear: () => {
    uploadsStore.set([]);
  },
};

export const pendingUploads = derived(
  uploadsStore,
  $uploads => $uploads.filter(u => u.status === 'pending' || u.status === 'processing')
);

export const completedUploads = derived(
  uploadsStore,
  $uploads => $uploads.filter(u => u.status === 'complete')
);

export const allSuggestions = derived(
  uploadsStore,
  $uploads => {
    const suggestions: EntitySuggestion[] = [];
    for (const upload of $uploads) {
      if (upload.extracted?.entities) {
        suggestions.push(...upload.extracted.entities);
      }
    }
    // Deduplicate by name
    const seen = new Set<string>();
    return suggestions.filter(s => {
      const key = s.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
);

// =============================================================================
// FILE PROCESSING
// =============================================================================

// Read file as text
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Read file as data URL (for images)
async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Read file as array buffer (for binary files like PDFs)
async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function processFile(upload: FileUpload): Promise<ExtractedContent> {
  uploads.updateStatus(upload.id, 'processing');

  try {
    const file = upload.file;
    if (!file) {
      throw new Error('No file data available');
    }

    // For images, read as data URL for display and potential vision processing
    if (isImage(upload.mimeType)) {
      const dataUrl = await readFileAsDataUrl(file);

      // Store the data URL for display
      uploadsStore.update(uploads =>
        uploads.map(u => u.id === upload.id ? { ...u, dataUrl } : u)
      );

      const extracted: ExtractedContent = {
        description: `Image: ${upload.filename}`,
        // Future: use vision API to describe image content
      };
      uploads.setExtracted(upload.id, extracted);
      return extracted;
    }

    // For text-based files, read content
    const isTextFile = upload.mimeType.startsWith('text/') ||
      upload.mimeType === 'application/json' ||
      upload.mimeType === 'text/markdown';

    if (isTextFile) {
      const textContent = await readFileAsText(file);

      // Store the text content
      uploadsStore.update(uploads =>
        uploads.map(u => u.id === upload.id ? { ...u, textContent } : u)
      );

      // Use AI extraction on the content
      const extracted = await extractFromDocument(textContent, {
        filename: upload.filename,
        mimeType: upload.mimeType,
      });
      uploads.setExtracted(upload.id, extracted);
      return extracted;
    }

    // For PDFs, we'd need a PDF parsing library or Electron-side processing
    if (upload.mimeType === 'application/pdf') {
      // For now, mark as needing processing
      // Future: use pdf.js or Electron-side PDF parsing
      const extracted: ExtractedContent = {
        summary: `PDF document: ${upload.filename}`,
        text: `[PDF content extraction not yet implemented - file: ${upload.filename}]`,
        entities: [],
      };
      uploads.setExtracted(upload.id, extracted);
      return extracted;
    }

    // For Word docs, similar situation
    if (upload.mimeType.includes('wordprocessingml') || upload.mimeType === 'application/msword') {
      const extracted: ExtractedContent = {
        summary: `Word document: ${upload.filename}`,
        text: `[Word document extraction not yet implemented - file: ${upload.filename}]`,
        entities: [],
      };
      uploads.setExtracted(upload.id, extracted);
      return extracted;
    }

    // Fallback for other file types
    const extracted: ExtractedContent = {
      summary: `File uploaded: ${upload.filename}`,
      entities: [],
    };
    uploads.setExtracted(upload.id, extracted);
    return extracted;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    uploads.updateStatus(upload.id, 'failed', message);
    throw error;
  }
}

// =============================================================================
// URL FETCHING
// =============================================================================

export async function fetchUrl(url: string): Promise<ExtractedContent> {
  try {
    // Fetch URL content
    const response = await fetch(url);
    if (!response.ok) {
      return {
        title: url,
        summary: `Failed to fetch URL: ${response.status}`,
        entities: [],
      };
    }

    const html = await response.text();

    // Extract text content from HTML (basic extraction)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000); // Limit content length

    // Use AI to extract entities from the content
    const extracted = await aiExtractFromUrl(textContent, url);
    return extracted;

  } catch (error) {
    // If fetch fails (CORS, network, etc.), return basic info
    return {
      title: url,
      summary: 'Unable to fetch URL content',
      entities: [],
    };
  }
}
