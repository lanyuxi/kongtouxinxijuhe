/**
 * 图片尺寸探测（零依赖，只用文件头）。
 *
 * 为什么必须自己解析，而不是依赖 ffprobe（这是 2026-09-15 线上部署失败的真正根因）：
 *   GitHub Actions / CNB 的 `node:22` 基础镜像里**没有 ffmpeg**。
 *   原实现用 `ffprobe` 读尺寸，命令不存在时子进程报错、被 catch 吞掉后返回 null，
 *   于是每一个候选图标都被判成「无法解析图像尺寸」——
 *   表现为「188 个项目全部抓不到图标 + npm run logos 非 0 退出」，
 *   而日志看上去完全像是图床挂了，误导排查方向。
 *
 *   尺寸信息本来就在文件头里（PNG 的 IHDR、GIF 的逻辑屏幕、JPEG 的 SOF、WebP 的 VP8/VP8L/VP8X）。
 *   自己解析既准确、又零依赖、还能离线跑 —— 顺带让「尺寸校验」这条规则变得可测试。
 *
 * 这里只做「够用」的解析：目标是识别 1×1 之类的僵尸图与宽高比异常，
 * 解析失败返回 null，由调用方决定是否放行（退化为原 ffprobe 的保守行为）。
 */

const ICO_MAX = 256;

/** PNG：IHDR 固定在第 16 字节起，宽高各 4 字节大端 */
function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w && h ? { w, h } : null;
}

/** GIF：逻辑屏幕宽高，2 字节小端 */
function gifSize(buf) {
  if (buf.length < 10) return null;
  const w = buf.readUInt16LE(6);
  const h = buf.readUInt16LE(8);
  return w && h ? { w, h } : null;
}

/** JPEG：顺序扫描段，SOF0–SOF3 / SOF5–SOF7 / SOF9–SOF11 / SOF13–SOF15 里带尺寸 */
function jpegSize(buf) {
  let i = 2; // 跳过 SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    // 填充字节
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // 无长度字段的标记
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSOF) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w && h ? { w, h } : null;
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** WebP：VP8 / VP8L / VP8X 三种头，尺寸位置各不相同 */
function webpSize(buf) {
  if (buf.length < 30) return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    // 关键帧起始码 0x9d 0x01 0x2a，随后 14 位宽高（小端）
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const w = buf.readUInt16LE(26) & 0x3fff;
    const h = buf.readUInt16LE(28) & 0x3fff;
    return w && h ? { w, h } : null;
  }
  if (fourcc === 'VP8L') {
    // 0x2f 签名 + 14 位宽、14 位高（交叉存储）
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    const w = (bits & 0x3fff) + 1;
    const h = ((bits >> 14) & 0x3fff) + 1;
    return w && h ? { w, h } : null;
  }
  if (fourcc === 'VP8X') {
    // canvas 宽高各 3 字节小端，存的是「实际值 - 1」
    const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return w && h ? { w, h } : null;
  }
  return null;
}

/** ICO：取各条目里最大的那张（favicon 服务常把 16/32/48 打包在一起） */
function getIcoSize(buf) {
  if (buf.length < 6) return null;
  const count = buf.readUInt16LE(4);
  let best = 0;
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    if (at + 16 > buf.length) break;
    // 0 表示 256
    const w = buf[at] || ICO_MAX;
    const h = buf[at + 1] || ICO_MAX;
    if (!w || !h) continue;
    best = Math.max(best, Math.min(w, h));
  }
  return best ? { w: best, h: best } : null;
}

/**
 * 按文件头解析图片尺寸。无法识别 / 解析失败返回 null。
 * @param {Buffer} buf 完整文件内容
 * @param {string|null} format sniffImage() 的返回值，用于减少重复判断
 */
export function imageSize(buf, format = null) {
  const kind = format ?? sniff(buf);
  switch (kind) {
    case 'png':
      return pngSize(buf);
    case 'gif':
      return gifSize(buf);
    case 'jpg':
      return jpegSize(buf);
    case 'webp':
      return webpSize(buf);
    case 'ico':
      return getIcoSize(buf);
    default:
      return null;
  }
}

/** 内部兜底：调用方未传 format 时，用与 sources.mjs 相同的口径再嗅探一次 */
function sniff(buf) {
  if (!buf || buf.length < 16) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('00000100')) return 'ico';
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
