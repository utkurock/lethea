import { Buffer } from 'buffer';

// Stellar SDK and the widget's bridge deps expect Node globals at module load.
const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  process?: { env: Record<string, string | undefined>; browser: boolean; version: string };
};
g.Buffer ??= Buffer;
g.global ??= globalThis;
g.process ??= { env: {}, browser: true, version: '' };
