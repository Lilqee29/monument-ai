/* eslint-disable @typescript-eslint/no-explicit-any */

// Global type declarations for RELICA app.
// Fixes CI errors with Node 22 + strict TypeScript where `global` and
// CSS side-effect imports are not automatically typed.

declare var global: typeof globalThis & {
  __CRASH_REPORTER_ERRORS__?: Array<{
    phase: string;
    message: string;
    stack?: string;
  }>;
};

// Side-effect CSS imports (nativewind / expo-router)
declare module '*.css' {}
