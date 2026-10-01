export function hostOf(url?: string | null): string | null;
export function isOfficialHost(host?: string | null): boolean;
export function faviconUrls(host: string): string[];
export function llamaIconUrl(slug: string): string;
export function sniffImage(buf: Buffer): 'png' | 'ico' | 'gif' | 'jpg' | 'webp' | 'svg' | null;
export function isPlaceholderSvg(text: string): boolean;
export function rootDomainOf(host?: string | null): string | null;
export function parseImageSize(buf: Buffer): { w: number; h: number } | null;
