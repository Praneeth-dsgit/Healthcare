export interface JitsiMeetExternalAPI {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface JitsiMeetExternalAPIConstructor {
  new (domain: string, options: Record<string, unknown>): JitsiMeetExternalAPI;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiMeetExternalAPIConstructor;
  }
}

export {};
