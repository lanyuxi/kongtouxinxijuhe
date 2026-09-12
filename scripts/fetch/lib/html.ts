/**
 * 极简 HTML 解析工具。
 *
 * 为何不引入 cheerio / jsdom：
 * - 方案要求「零服务端、零数据库」，依赖越少越稳定；
 * - 我们只需要抽取标题、链接、列表这几类固定结构，正则足够且更快；
 * - 避免新增依赖带来的安装体积与供应链面。
 */

/** 去标签，解码常见 HTML 实体，压缩空白 */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-');
}

/** 移除 script / style / svg —— 解析前必须先剔除，否则会污染文本 */
export function pruneNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** 取出所有 `class` 命中指定 CSS 类的元素原始 HTML（不做嵌套平衡，按就近闭合） */
export function blocksByClass(html: string, className: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<(\\w+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[2]);
  return out;
}

/** 取第一个匹配元素的内部 HTML */
export function firstBlockByClass(html: string, className: string): string | null {
  return blocksByClass(html, className)[0] ?? null;
}

/**
 * 取一段 HTML 中所有 <a> 的 href 与文本。
 * 用于从描述里提取官网、X、Docs 等官方链接。
 */
export function extractLinks(html: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    out.push({ href: decodeEntities(hrefMatch[1]), text: stripTags(m[2]) });
  }
  return out;
}

/** 解析 JSON-LD 块（可能多个），返回解析成功的对象数组 */
export function parseJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* 单个块损坏不影响其它块 */
    }
  }
  return out;
}

/** 从绝对/相对链接还原为绝对 URL */
export function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}


/**
 * 取指定 class 元素的完整内部 HTML —— 使用标签栈做**深度平衡**匹配。
 *
 * blocksByClass 的正则在遇到同标签嵌套（如 <div> 里还有 <div>）时会提前截断，
 * 对 airdrops.io 的 .airdrop-guide（内部有多层 section / div）会解析失败。
 * 这里做一次线性扫描完成正确的标签配对，可靠性更高。
 */
export function extractBalancedBlock(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<([a-z][a-z0-9]*)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    'i',
  );
  const start = html.search(openRe);
  if (start < 0) return null;

  const openTag = html.slice(start).match(openRe);
  if (!openTag) return null;
  const tagName = openTag[1];

  return innerOf(html, start, tagName, openTag[0].length);
}

/** 从 `start` 处开始，返回同名标签「内部」的 HTML（不含自身标签） */
export function innerOf(html: string, start: number, tagName: string, openTagLen: number): string {
  let cursor = start + openTagLen;
  let depth = 1;
  const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*?(/?)>`, 'gi');
  tagRe.lastIndex = cursor;

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    if (m[2] === '/') continue; // 自闭合标签不改变深度
    if (m[1] === '/') {
      depth--;
      if (depth === 0) return html.slice(cursor, m.index);
    } else {
      depth++;
    }
  }
  return html.slice(cursor);
}

/**
 * 从 `start` 处取一个完整的平衡元素（含自身标签）。
 * 用于「h3 步骤标题 + 紧随的 step-body」这类同层兄弟节点的切分。
 */
export function sliceBalanced(html: string, start: number, tagName: string): string {
  const openTagRe = new RegExp(`<${tagName}\\b[^>]*>`, 'i');
  const open = html.slice(start).match(openTagRe);
  if (!open) return '';
  const inner = innerOf(html, start, tagName, open[0].length);
  return open[0] + inner + `</${tagName}>`;
}
