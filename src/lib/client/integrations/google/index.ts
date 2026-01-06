// Google Integration
// Unified plugin for Gmail + Calendar with single OAuth

import type {
  CanopyPlugin,
  IntegrationSignal,
  OAuthConfig,
} from '../types';

// =============================================================================
// GOOGLE API TYPES
// =============================================================================

// Calendar types
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
  }>;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink: string;
}

interface GoogleCalendarList {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

// Gmail types
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { size: number; data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { size: number; data?: string };
      parts?: Array<{ mimeType: string; body?: { size: number; data?: string } }>;
    }>;
  };
  internalDate: string;
}

interface GmailMessageList {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate: number;
}

// =============================================================================
// UNIFIED GOOGLE API CLIENT
// =============================================================================

class GoogleAPI {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearToken() {
    this.accessToken = null;
  }

  private async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google authentication expired');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google API error: ${error.error?.message || response.status}`);
    }

    return response.json();
  }

  // ======================== CALENDAR ========================

  async getUpcomingEvents(options?: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<GoogleCalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: (options?.timeMin || new Date()).toISOString(),
      timeMax: options?.timeMax?.toISOString() || this.getEndOfWeek().toISOString(),
      maxResults: String(options?.maxResults || 20),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const response = await this.fetch<GoogleCalendarList>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
    );

    return response.items.filter(e => e.status !== 'cancelled');
  }

  async getTodayEvents(): Promise<GoogleCalendarEvent[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getUpcomingEvents({
      timeMin: today,
      timeMax: tomorrow,
      maxResults: 50,
    });
  }

  async getWeekEvents(): Promise<GoogleCalendarEvent[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.getUpcomingEvents({
      timeMin: today,
      timeMax: this.getEndOfWeek(),
      maxResults: 100,
    });
  }

  private getEndOfWeek(): Date {
    const today = new Date();
    const daysUntilSunday = 7 - today.getDay();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + daysUntilSunday);
    endOfWeek.setHours(23, 59, 59, 999);
    return endOfWeek;
  }

  // ======================== PROFILE ========================

  async getUserProfile(): Promise<{ email: string; name?: string; picture?: string }> {
    return this.fetch<{ email: string; name?: string; picture?: string }>(
      'https://www.googleapis.com/oauth2/v2/userinfo'
    );
  }

  // ======================== GMAIL ========================

  async searchMessages(query: string, options?: {
    maxResults?: number;
  }): Promise<GmailMessageList> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(options?.maxResults || 10),
    });

    return this.fetch<GmailMessageList>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`
    );
  }

  async getMessage(messageId: string, format: 'full' | 'metadata' = 'full'): Promise<GmailMessage> {
    return this.fetch<GmailMessage>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`
    );
  }

  async getUnreadCount(): Promise<number> {
    const result = await this.searchMessages('is:unread in:inbox', { maxResults: 1 });
    return result.resultSizeEstimate;
  }

  async getRecentImportant(maxResults: number = 5): Promise<GmailMessage[]> {
    const result = await this.searchMessages('is:important is:unread', { maxResults });
    if (!result.messages) return [];

    const messages: GmailMessage[] = [];
    for (const msg of result.messages.slice(0, maxResults)) {
      try {
        const full = await this.getMessage(msg.id, 'metadata');
        messages.push(full);
      } catch {
        // Skip failed messages
      }
    }
    return messages;
  }
}

export const googleApi = new GoogleAPI();

// =============================================================================
// HELPERS
// =============================================================================

function formatEventTime(event: GoogleCalendarEvent): string {
  if (event.start.date) return 'All day';

  if (event.start.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null;

    const timeFormat = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return end
      ? `${timeFormat.format(start)} - ${timeFormat.format(end)}`
      : timeFormat.format(start);
  }

  return '';
}

function formatEventDate(event: GoogleCalendarEvent): string {
  const dateStr = event.start.dateTime || event.start.date;
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date >= today && date < tomorrow) return 'Today';

  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  if (date >= tomorrow && date < dayAfter) return 'Tomorrow';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getEventDomain(event: GoogleCalendarEvent): 'work' | 'personal' | 'family' | 'health' | 'sport' {
  const text = `${event.summary || ''} ${event.description || ''}`.toLowerCase();

  if (
    text.includes('meeting') || text.includes('call') || text.includes('sync') ||
    text.includes('standup') || text.includes('1:1') || text.includes('client') ||
    event.conferenceData?.entryPoints?.some(e => e.uri.includes('meet.google.com'))
  ) {
    return 'work';
  }

  if (text.includes('workout') || text.includes('gym') || text.includes('training') ||
      text.includes('run') || text.includes('ride')) {
    return 'sport';
  }

  if (text.includes('doctor') || text.includes('dentist') || text.includes('appointment')) {
    return 'health';
  }

  if (text.includes('family') || text.includes('birthday') || text.includes('dinner') ||
      text.includes('kids') || text.includes('school')) {
    return 'family';
  }

  return 'personal';
}

function eventToSignal(event: GoogleCalendarEvent): IntegrationSignal {
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime)
    : new Date(event.start.date!);

  const endTime = event.end.dateTime
    ? new Date(event.end.dateTime)
    : new Date(event.end.date!);

  const attendeeCount = event.attendees?.filter(a => !a.self).length || 0;
  const hasVideoCall = !!event.conferenceData?.entryPoints?.some(
    e => e.entryPointType === 'video'
  );

  return {
    id: `google-cal-${event.id}`,
    source: 'google',
    type: 'event',
    timestamp: startTime,
    domain: getEventDomain(event),
    data: {
      title: event.summary || 'Untitled Event',
      description: event.description,
      location: event.location,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      isAllDay: !event.start.dateTime,
      attendeeCount,
      hasVideoCall,
      videoLink: event.conferenceData?.entryPoints?.find(
        e => e.entryPointType === 'video'
      )?.uri,
      link: event.htmlLink,
      formattedTime: formatEventTime(event),
      formattedDate: formatEventDate(event),
    },
  };
}

function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

function emailToSignal(message: GmailMessage): IntegrationSignal {
  const from = getHeader(message, 'From') || 'Unknown';
  const subject = getHeader(message, 'Subject') || '(no subject)';
  const date = new Date(parseInt(message.internalDate, 10));

  // Extract sender name
  const senderMatch = from.match(/^([^<]+)?<?([^>]+)?>?$/);
  const senderName = senderMatch?.[1]?.trim() || senderMatch?.[2] || from;

  return {
    id: `google-mail-${message.id}`,
    source: 'google',
    type: 'message_received',
    timestamp: date,
    domain: 'work', // Assume work for now
    data: {
      from: senderName,
      subject,
      snippet: message.snippet,
      isUnread: message.labelIds?.includes('UNREAD'),
      isImportant: message.labelIds?.includes('IMPORTANT'),
      link: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
    },
  };
}

// =============================================================================
// STORAGE
// =============================================================================

const PLUGIN_ID = 'google';

async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.canopy) return null;
  return window.canopy.getSecret(`${PLUGIN_ID}_access_token`);
}

async function clearStoredToken(): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy) return;
  await window.canopy.deleteSecret(`${PLUGIN_ID}_access_token`);
  await window.canopy.deleteSecret(`${PLUGIN_ID}_refresh_token`);
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export const googlePlugin: CanopyPlugin = {
  id: PLUGIN_ID,
  name: 'Google',
  description: 'Calendar events and Gmail inbox',
  icon: '🔷',
  domains: ['productivity', 'work', 'personal', 'family'],
  category: 'productivity',

  // Multiple Google accounts can be connected (marcus@field.io, hello@field.io)
  multiInstance: true,

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '', // Set from environment or settings
    scopes: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
  } as OAuthConfig,

  syncSchedule: {
    type: 'smart',
    activeHours: { start: 6, end: 22 },
    activeIntervalMs: 15 * 60 * 1000,   // Every 15 min during active hours
    inactiveIntervalMs: 60 * 60 * 1000, // Every hour otherwise
    syncOnConnect: true,
    syncOnWake: true,
  },

  isConnected: async () => {
    const token = await getStoredToken();
    return !!token;
  },

  connect: async () => {
    if (typeof window === 'undefined' || !window.canopy?.oauth) {
      throw new Error('OAuth not available');
    }

    const config = googlePlugin.authConfig!;

    // Start OAuth flow
    const { code } = await window.canopy.oauth.start(PLUGIN_ID, {
      authUrl: config.authUrl,
      clientId: config.clientId,
      scopes: config.scopes,
      redirectUri: 'http://localhost:5173/oauth/callback',
    });

    // Exchange code for tokens
    const result = await window.canopy.oauth.exchange(PLUGIN_ID, code, {
      tokenUrl: config.tokenUrl,
      clientId: config.clientId,
      redirectUri: 'http://localhost:5173/oauth/callback',
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect to Google');
    }

    // Verify connection works
    const token = await getStoredToken();
    if (token) {
      googleApi.setAccessToken(token);
      await googleApi.getTodayEvents(); // Test call
    }
  },

  disconnect: async () => {
    await clearStoredToken();
    googleApi.clearToken();
  },

  getLastSync: async () => {
    if (typeof window === 'undefined' || !window.canopy) return null;
    const state = await window.canopy.getPluginState(PLUGIN_ID);
    return state?.last_sync ? new Date(state.last_sync) : null;
  },

  getAccountInfo: async () => {
    const token = await getStoredToken();
    if (!token) return null;

    try {
      googleApi.setAccessToken(token);
      const profile = await googleApi.getUserProfile();
      return {
        id: profile.email,
        label: profile.email,  // Could also use profile.name if preferred
      };
    } catch {
      return null;
    }
  },

  sync: async (_since?: Date): Promise<IntegrationSignal[]> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error('Not connected to Google');
    }

    googleApi.setAccessToken(token);

    const signals: IntegrationSignal[] = [];

    try {
      // Sync calendar events
      const events = await googleApi.getWeekEvents();
      signals.push(...events.map(eventToSignal));

      // Sync important unread emails (lightweight - just metadata)
      const emails = await googleApi.getRecentImportant(5);
      signals.push(...emails.map(emailToSignal));

      return signals;
    } catch (error) {
      // Try to refresh token if expired
      if (error instanceof Error && error.message.includes('expired')) {
        if (typeof window !== 'undefined' && window.canopy?.oauth) {
          const config = googlePlugin.authConfig!;
          const refreshResult = await window.canopy.oauth.refresh(PLUGIN_ID, {
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
          });

          if (refreshResult.success && refreshResult.accessToken) {
            googleApi.setAccessToken(refreshResult.accessToken);
            // Retry
            const events = await googleApi.getWeekEvents();
            signals.push(...events.map(eventToSignal));
            const emails = await googleApi.getRecentImportant(5);
            signals.push(...emails.map(emailToSignal));
            return signals;
          }
        }
      }
      throw error;
    }
  },
};

// =============================================================================
// GMAIL SEARCH (for reference plugin integration)
// =============================================================================

export interface GmailSearchResult {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
  link: string;
  isUnread: boolean;
}

/**
 * Search Gmail - used by reference system
 */
export async function searchGmail(query: string, maxResults: number = 10): Promise<GmailSearchResult[]> {
  const token = await getStoredToken();
  if (!token) throw new Error('Not connected to Google');

  googleApi.setAccessToken(token);

  const searchResult = await googleApi.searchMessages(query, { maxResults });
  if (!searchResult.messages) return [];

  const results: GmailSearchResult[] = [];

  for (const msg of searchResult.messages.slice(0, maxResults)) {
    try {
      const message = await googleApi.getMessage(msg.id, 'metadata');
      const from = getHeader(message, 'From') || 'Unknown';
      const subject = getHeader(message, 'Subject') || '(no subject)';

      const senderMatch = from.match(/^([^<]+)?<?([^>]+)?>?$/);
      const senderName = senderMatch?.[1]?.trim() || senderMatch?.[2] || from;

      results.push({
        id: message.id,
        from: senderName,
        subject,
        snippet: message.snippet,
        date: new Date(parseInt(message.internalDate, 10)),
        link: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
        isUnread: message.labelIds?.includes('UNREAD') || false,
      });
    } catch {
      // Skip failed messages
    }
  }

  return results;
}

/**
 * Format today's agenda for Ray's context
 */
export function formatAgendaForContext(signals: IntegrationSignal[]): string {
  const todayEvents = signals
    .filter(s => s.source === 'google' && s.type === 'event')
    .filter(s => {
      const eventDate = new Date(s.data.startTime);
      const today = new Date();
      return (
        eventDate.getDate() === today.getDate() &&
        eventDate.getMonth() === today.getMonth() &&
        eventDate.getFullYear() === today.getFullYear()
      );
    })
    .sort((a, b) => new Date(a.data.startTime).getTime() - new Date(b.data.startTime).getTime());

  if (todayEvents.length === 0) {
    return 'No events scheduled for today';
  }

  const lines = todayEvents.map(e => {
    let line = `- ${e.data.formattedTime}: ${e.data.title}`;
    if (e.data.hasVideoCall) line += ' (video call)';
    if (e.data.attendeeCount > 0) line += ` (${e.data.attendeeCount} attendees)`;
    return line;
  });

  return `Today's agenda:\n${lines.join('\n')}`;
}

export default googlePlugin;
