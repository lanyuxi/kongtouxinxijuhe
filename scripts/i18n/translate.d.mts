/**
 * translate.mjs 的类型声明。
 *
 * 为什么用 .d.mts：实现刻意写成 ESM（.mjs）——
 *   它同时被构建脚本（tsx，走 ESM）与 `npm run pipeline` 之外的
 *   纯 Node 脚本（scripts/i18n/build-cache.mjs）复用，
 *   写成 .ts 会被 tsc 的输出目录规则牵扯。
 * 而调用方在 .ts 里，因此提供同名的声明文件让类型检查通过。
 */

/** 中英对照结果：en 仅在原文是英文时存在 */
export interface LocalizedText {
  zh: string;
  en?: string;
}

/** 是否含有汉字 */
export function hasChinese(text: unknown): boolean;

/** 把专有名词替换为占位符，返回替换后的文本与词表 */
export function protectTerms(text: string): { text: string; tokens: string[] };

/** 还原被保护的专有名词 */
export function restoreTerms(text: string, tokens: string[]): string;

/** 缓存键归一化 */
export function cacheKey(text: string): string;

/** 加载机器翻译缓存 */
export function loadCache(cache: Record<string, string>): Record<string, string>;

/** 读取当前缓存 */
export function getCache(): Record<string, string>;

/** 由中文译文反查英文原文；无法唯一确定时返回 undefined */
export function reverseLookup(zh: string): string | undefined;

/** 术语表 + 人工修正 */
export function applyGlossary(text: string): string;

/** 文本本地化：始终给出中文，原文为英文时同时给出原文 */
export function localizeText(text: string): LocalizedText;

/** 标题本地化：在 localizeText 基础上做标题化收尾 */
export function localizeTitle(text: string): LocalizedText;
