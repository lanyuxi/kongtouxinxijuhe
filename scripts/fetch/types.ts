/** 数据源适配器统一接口 */
import type { RawItem } from '../lib/normalize';

export interface AdapterResult {
  name: string;
  url: string;
  ok: boolean;
  items: RawItem[];
  error?: string;
}

export interface SourceAdapter {
  /** false 时明确记为未配置，不发起网络请求。 */
  configured?: () => boolean;
  name: string;
  url: string;
  /** 抓取并归一为 RawItem。实现方必须保证失败时 throw，由 runner 捕获隔离。 */
  fetch(): Promise<RawItem[]>;
}
