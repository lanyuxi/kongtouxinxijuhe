import type { AirdropProject } from './types';
export function feedbackLink(p: AirdropProject): string {
  const page = `https://lanyuxi.github.io/kongtouxinxijuhe/#/project/${p.slug}`;
  const body = `项目：${p.name}（${p.slug}）\n项目详情：${page}\n资料来源：${p.evidence.map(e => e.url).filter(Boolean).join('、') || '暂无'}\n\n发现的问题：\n\n请补充问题描述及核验依据；不要填写私钥或助记词。`;
  return `https://github.com/lanyuxi/kongtouxinxijuhe/issues/new?title=${encodeURIComponent(`信息反馈：${p.name}`)}&body=${encodeURIComponent(body)}`;
}
