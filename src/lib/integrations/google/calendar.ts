// Google Calendar Integration Plugin
// Syncs upcoming events and surfaces agenda in Ray's context

import type {
  CanopyPlugin,
  IntegrationSignal,
  OAuthConfig,
} from '../types';

// =============================================================================
// GOOGLE CALENDAR API TYPES
// =============================================================================

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    self?: boolean;
    organizer?: boolean;
  }>;
  conferenceData?: {
    conferenceId?: string;
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink: string;
  recurringEventId?: string;
}

interface GoogleCalendarList {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

// =============================================================================
// GOOGLE CALENDAR API CLIENT
// =============================================================================

class GoogleCalendarAPI {
  private baseUrl = 'https://www.googleapis.com/calendar/v3';
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearToken() {
    this.accessToken = null;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Calendar');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google Calendar authentication expired');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google Calendar API error: ${error.error?.message || response.status}`);
    }

    return response.json();
  }

  /**
   * Get upcoming events from primary calendar
   */
  async getUpcomingEvents(options?: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    singleEvents?: boolean;
  }): Promise<GoogleCalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: (options?.timeMin || new Date()).toISOString(),
      timeMax: options?.timeMax?.toISOString() || this.getEndOfWeek().toISOString(),
      maxResults: String(options?.maxResults || 20),
      singleEvents: String(options?.singleEvents ?? true),
      orderBy: 'startTime',
    });

    const response = await this.fetch<GoogleCalendarList>(
      `/calendars/primary/events?${params}`
    );

    return response.items.filter(e => e.status !== 'cancelled');
  }

  /**
   * Get today's events
   */
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

  /**
   * Get this week's events
   */
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
    const dayOfWeek = today.getDay();
    const daysUntilSunday = 7 - dayOfWeek;
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + daysUntilSunday);
    endOfWeek.setHours(23, 59, 59, 999);
    return endOfWeek;
  }
}

const api = new GoogleCalendarAPI();

// =============================================================================
// HELPERS
// =============================================================================

function formatEventTime(event: GoogleCalendarEvent): string {
  if (event.start.date) {
    // All-day event
    return 'All day';
  }

  if (event.start.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null;

    const timeFormat = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (end) {
      return `${timeFormat.format(start)} - ${timeFormat.format(end)}`;
    }
    return timeFormat.format(start);
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

  if (date >= today && date < tomorrow) {
    return 'Today';
  }

  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  if (date >= tomorrow && date < dayAfter) {
    return 'Tomorrow';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getEventDomain(event: GoogleCalendarEvent): 'work' | 'personal' | 'family' | 'health' | 'sport' {
  const title = (event.summary || '').toLowerCase();
  const desc = (event.description || '').toLowerCase();
  const text = `${title} ${desc}`;

  // Check for work indicators
  if (
    text.includes('meeting') ||
    text.includes('call') ||
    text.includes('sync') ||
    text.includes('review') ||
    text.includes('standup') ||
    text.includes('1:1') ||
    text.includes('client') ||
    text.includes('presentation') ||
    event.conferenceData?.entryPoints?.some(e => e.uri.includes('meet.google.com'))
  ) {
    return 'work';
  }

  // Check for health/sport
  if (
    text.includes('workout') ||
    text.includes('gym') ||
    text.includes('training') ||
    text.includes('run') ||
    text.includes('ride') ||
    text.includes('yoga') ||
    text.includes('doctor') ||
    text.includes('dentist') ||
    text.includes('appointment')
  ) {
    return text.includes('doctor') || text.includes('dentist') || text.includes('appointment')
      ? 'health'
      : 'sport';
  }

  // Check for family
  if (
    text.includes('family') ||
    text.includes('birthday') ||
    text.includes('dinner') ||
    text.includes('kids') ||
    text.includes('school')
  ) {
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
    id: `gcal-${event.id}`,
    source: 'google-calendar',
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
      status: event.status,
    },
  };
}

/**
 * Format today's agenda for Ray's context
 */
export function formatAgendaForContext(signals: IntegrationSignal[]): string {
  const todayEvents = signals
    .filter(s => s.source === 'google-calendar' && s.type === 'event')
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

// =============================================================================
// STORAGE
// =============================================================================

const PLUGIN_ID = 'google-calendar';

async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.canopy) return null;
  return window.canopy.getSecret(`${PLUGIN_ID}_access_token`);
}

async function storeToken(token: string): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy) return;
  await window.canopy.setSecret(`${PLUGIN_ID}_access_token`, token);
}

async function clearStoredToken(): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy) return;
  await window.canopy.deleteSecret(`${PLUGIN_ID}_access_token`);
  await window.canopy.deleteSecret(`${PLUGIN_ID}_refresh_token`);
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export const googleCalendarPlugin: CanopyPlugin = {
  id: PLUGIN_ID,
  name: 'Google Calendar',
  description: 'Sync your calendar and see upcoming events',
  icon: '📅',
  domains: ['work', 'personal', 'family'],

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '', // Set from environment or settings
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
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

    const config = googleCalendarPlugin.authConfig!;

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
      throw new Error(result.error || 'Failed to exchange code for tokens');
    }

    // Verify connection works
    const token = await getStoredToken();
    if (token) {
      api.setAccessToken(token);
      await api.getTodayEvents(); // Test call
    }
  },

  disconnect: async () => {
    await clearStoredToken();
    api.clearToken();
  },

  getLastSync: async () => {
    if (typeof window === 'undefined' || !window.canopy) return null;
    const state = await window.canopy.getPluginState(PLUGIN_ID);
    return state?.last_sync ? new Date(state.last_sync) : null;
  },

  sync: async (_since?: Date): Promise<IntegrationSignal[]> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error('Not connected to Google Calendar');
    }

    api.setAccessToken(token);

    try {
      // Get this week's events
      const events = await api.getWeekEvents();

      // Convert to signals
      const signals = events.map(eventToSignal);

      return signals;
    } catch (error) {
      // Try to refresh token if expired
      if (error instanceof Error && error.message.includes('expired')) {
        if (typeof window !== 'undefined' && window.canopy?.oauth) {
          const config = googleCalendarPlugin.authConfig!;
          const refreshResult = await window.canopy.oauth.refresh(PLUGIN_ID, {
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
          });

          if (refreshResult.success && refreshResult.accessToken) {
            api.setAccessToken(refreshResult.accessToken);
            const events = await api.getWeekEvents();
            return events.map(eventToSignal);
          }
        }
      }
      throw error;
    }
  },
};

export default googleCalendarPlugin;
