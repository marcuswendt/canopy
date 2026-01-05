// File Upload System
// Handles file ingestion, processing, and entity extraction

import { v4 as uuid } from 'uuid';

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
// FILE PROCESSING (would use Claude API in production)
// =============================================================================

export async function processFile(upload: FileUpload): Promise<ExtractedContent> {
  uploads.updateStatus(upload.id, 'processing');
  
  try {
    // In production, this would:
    // 1. Read file content
    // 2. Send to Claude for extraction
    // 3. Return structured content
    
    // For now, return mock extraction based on filename
    const extracted = await mockExtraction(upload);
    uploads.setExtracted(upload.id, extracted);
    return extracted;
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    uploads.updateStatus(upload.id, 'failed', message);
    throw error;
  }
}

async function mockExtraction(upload: FileUpload): Promise<ExtractedContent> {
  // Simulate processing delay
  await new Promise(r => setTimeout(r, 500));
  
  const filename = upload.filename.toLowerCase();
  
  // Mock extractions based on filename patterns
  if (filename.includes('field')) {
    return {
      summary: 'FIELD.IO company information',
      entities: [
        { name: 'FIELD.IO', type: 'company', domain: 'work', confidence: 0.95, source: upload.filename },
        { name: 'Marcus Wendt', type: 'person', domain: 'work', confidence: 0.9, source: upload.filename, details: { role: 'Founder & CEO' } },
      ],
    };
  }
  
  if (filename.includes('samsung')) {
    return {
      summary: 'Samsung project documentation',
      entities: [
        { name: 'Samsung', type: 'project', domain: 'work', confidence: 0.95, source: upload.filename },
        { name: 'One UI Visual Language', type: 'project', domain: 'work', confidence: 0.8, source: upload.filename },
      ],
    };
  }
  
  if (filename.includes('chanel')) {
    return {
      summary: 'Chanel project documentation',
      entities: [
        { name: 'Chanel', type: 'project', domain: 'work', confidence: 0.95, source: upload.filename },
        { name: '113 Spring', type: 'project', domain: 'work', confidence: 0.85, source: upload.filename },
      ],
    };
  }
  
  if (isImage(upload.mimeType)) {
    return {
      description: 'Image uploaded',
      // Would include face detection results
    };
  }
  
  return {
    summary: 'Document processed',
    entities: [],
  };
}

// =============================================================================
// URL FETCHING
// =============================================================================

export async function fetchUrl(url: string): Promise<ExtractedContent> {
  // In production, this would:
  // 1. Fetch URL content
  // 2. Parse HTML/extract text
  // 3. Send to Claude for entity extraction
  
  // For now, mock based on URL patterns
  await new Promise(r => setTimeout(r, 800));
  
  if (url.includes('linkedin.com')) {
    return {
      title: 'LinkedIn Profile',
      summary: 'Professional profile information',
      entities: [
        { name: 'Marcus Wendt', type: 'person', confidence: 0.95, source: url },
      ],
    };
  }
  
  if (url.includes('field.io')) {
    return {
      title: 'FIELD.IO',
      summary: 'Creative Intelligence Practice',
      entities: [
        { name: 'FIELD.IO', type: 'company', domain: 'work', confidence: 0.95, source: url },
        { name: 'Nike', type: 'project', domain: 'work', confidence: 0.8, source: url },
        { name: 'Chanel', type: 'project', domain: 'work', confidence: 0.8, source: url },
        { name: 'IBM', type: 'project', domain: 'work', confidence: 0.8, source: url },
      ],
    };
  }
  
  return {
    title: 'Web page',
    summary: 'Content fetched from URL',
    entities: [],
  };
}
