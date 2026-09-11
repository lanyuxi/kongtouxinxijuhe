import type { SourceAdapter } from './types';
import { airdropsIoAdapter } from './airdrops-io';
import { defiLlamaAdapter } from './defillama';
import { galxeAdapter } from './galxe';

export const adapters: SourceAdapter[] = [
  airdropsIoAdapter,
  defiLlamaAdapter,
  galxeAdapter,
];

export type { SourceAdapter };
