// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { Session } from '@auth/sveltekit';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth?: () => Promise<Session | null>;
    }
    interface PageData {
      session?: Session | null;
    }
    // interface PageState {}
    // interface Platform {}
  }

  // Canopy Electron IPC Bridge
  interface Window {
    canopy?: {
      // Secrets API
      setSecret: (key: string, value: string) => Promise<void>;
      getSecret: (key: string) => Promise<string | null>;
      deleteSecret: (key: string) => Promise<void>;

      // File API
      readFile?: (path: string) => Promise<string>;
      writeFile?: (path: string, content: string) => Promise<void>;

      // OAuth API
      oauth?: {
        start: (
          provider: string,
          config: { authUrl: string; clientId: string; scopes: string[] }
        ) => Promise<{ code: string }>;
        exchange: (
          provider: string,
          code: string,
          config: { tokenUrl: string; clientId: string }
        ) => Promise<{ error?: string }>;
      };

      // Claude AI API
      claude?: {
        hasApiKey: () => boolean;
        complete: (params: {
          messages: Array<{ role: string; content: string }>;
          system?: string;
          maxTokens?: number;
          temperature?: number;
        }) => Promise<{ content: string }>;
        extract: <T>(params: {
          prompt: string;
          schema: object;
          maxTokens?: number;
        }) => Promise<T>;
        onStreamDelta: (
          callback: (data: { streamId: string; delta: string }) => void
        ) => void;
        onStreamEnd: (callback: (data: { streamId: string }) => void) => void;
        onStreamError: (
          callback: (data: { streamId: string; error: string }) => void
        ) => void;
        streamComplete: (params: {
          messages: Array<{ role: string; content: string }>;
          system?: string;
          maxTokens?: number;
          temperature?: number;
        }) => Promise<{ streamId: string }>;
      };

      // Database API
      getAllPluginStates: () => Promise<
        Array<{
          plugin_id: string;
          enabled: boolean;
          connected: boolean;
          last_sync: string | null;
          settings: string | null;
        }>
      >;
      setPluginState: (state: {
        pluginId: string;
        enabled: boolean;
        connected: boolean;
      }) => Promise<void>;

      // Apple HealthKit API (macOS only)
      healthKit?: {
        isAvailable: () => Promise<boolean>;
        requestAuthorization: (types: string[]) => Promise<boolean>;
        querySleepAnalysis: (
          startDate: Date,
          endDate: Date
        ) => Promise<Array<{
          startDate: string;
          endDate: string;
          value: string;
          sourceName: string;
        }>>;
        queryHeartRate: (
          startDate: Date,
          endDate: Date
        ) => Promise<Array<{
          startDate: string;
          endDate: string;
          value: number;
          motionContext?: string;
        }>>;
        queryHRV: (
          startDate: Date,
          endDate: Date
        ) => Promise<Array<{
          startDate: string;
          value: number;
        }>>;
        queryWorkouts: (
          startDate: Date,
          endDate: Date
        ) => Promise<Array<{
          startDate: string;
          endDate: string;
          activityType: string;
          duration: number;
          totalEnergyBurned?: number;
          totalDistance?: number;
          sourceName: string;
        }>>;
        queryDailySummary: (date: Date) => Promise<{
          date: string;
          activeEnergyBurned: number;
          basalEnergyBurned: number;
          stepCount: number;
          distanceWalkingRunning: number;
          exerciseTime: number;
          standHours: number;
        } | null>;
      };
    };
  }

  // Web Speech API Types
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
    onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    abort(): void;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionAlternative {
    readonly confidence: number;
    readonly transcript: string;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: SpeechRecognitionErrorCode;
    readonly message: string;
  }

  type SpeechRecognitionErrorCode =
    | 'aborted'
    | 'audio-capture'
    | 'bad-grammar'
    | 'language-not-supported'
    | 'network'
    | 'no-speech'
    | 'not-allowed'
    | 'service-not-allowed';

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
    prototype: SpeechRecognition;
  }

  var SpeechRecognition: SpeechRecognitionConstructor;
  var webkitSpeechRecognition: SpeechRecognitionConstructor;

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export {};
