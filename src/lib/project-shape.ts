import type { AirdropProject, ListProject } from './types';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(text);
const optionalText = (v: unknown) => v === undefined || text(v);
const nullableNumber = (v: unknown) => v === null || number(v);
const nullableBoolean = (v: unknown) => v === null || typeof v === 'boolean';
const risks = ['low', 'medium', 'high', 'critical'];
const verification = (v: unknown) => object(v) && ['method','source_url','checked_at','note'].every(k => text(v[k]));

/** 校验渲染必需的形状；不把结构完整当作事实已核验。 */
export function isListProject(p: unknown): p is ListProject {
  if (!object(p) || !['id','name','slug','tagline','category','created_at','discovered_at','last_checked_at','last_changed_at'].every(k => text(p[k])) ||
      !['new','potential','pending','confirmed','claim_live','ended'].includes(p.status) ||
      !['sourced','third_party','template'].includes(p.guide_source) ||
      !['chains','tasks','requirements'].every(k => strings(p[k])) ||
      !['status_note','logo','tagline_en','guide_version','verified_official_website'].every(k => optionalText(p[k])) ||
      !object(p.official) || !Object.values(p.official).every(optionalText) ||
      !object(p.scores) || !number(p.scores.authenticity) || !number(p.scores.value) || !risks.includes(p.scores.risk) || !['S','A','B','C','D'].includes(p.scores.grade) ||
      !object(p.recommendation) || !text(p.recommendation.summary) || !['participate','observe','avoid'].includes(p.recommendation.action) ||
      !object(p.cost) || !text(p.cost.summary) || !['capital_min_usd','capital_max_usd','gas_estimate_usd'].every(k => nullableNumber(p.cost[k])) || !number(p.cost.time_minutes) || typeof p.cost.long_term !== 'boolean' ||
      (p.cost.basis !== undefined && !verification(p.cost.basis)) ||
      !Array.isArray(p.sources) || !p.sources.every(s => object(s) && ['name','url','fetched_at','type'].every(k => text(s[k]))) ||
      !Array.isArray(p.guide) || !p.guide.every(g => object(g) && Number.isInteger(g.step) && g.step > 0 && text(g.title) && number(g.minutes) && nullableBoolean(g.needs_wallet) && nullableBoolean(g.needs_signature) && [...risks,'unknown'].includes(g.risk) && optionalText(g.id) && optionalText(g.content_status))) return false;
  if (p.meta !== undefined && (!object(p.meta) || !['funding','token_status','airdrop_status'].every(k => optionalText(p.meta[k])) || (p.meta.investors !== undefined && !strings(p.meta.investors)))) return false;
  return true;
}

export function isDetailProject(value: unknown): value is AirdropProject {
  if (!isListProject(value)) return false;
  const p = value as unknown as Record<string, any>;
  return strings(p.risks) && Array.isArray(p.faq) && p.faq.every(f => object(f) && text(f.q) && text(f.a)) &&
    Array.isArray(p.evidence) && p.evidence.every(e => object(e) && ['type','label','url'].every(k => text(e[k])) && typeof e.verified === 'boolean' && optionalText(e.note) && (e.verification === undefined || verification(e.verification))) &&
    p.guide.every((g: Record<string, any>) => ['description','official_url','done_when'].every(k => text(g[k])) && nullableNumber(g.cost_usd) && typeof g.source_verified === 'boolean' && ['source_url','original_title','original_description'].every(k => optionalText(g[k]))) &&
    ['authenticityItems','valueItems','riskItems'].every(k => Array.isArray(p.scores[k]) && p.scores[k].every((item: unknown) => object(item) && ['key','label','reason'].every(key => text(item[key])) && number(item.value) && number(item.max) && optionalText(item.evidenceUrl))) &&
    ['authenticityVerifiedCount','authenticityPartialCount','authenticityTotalCount'].every(k => p.scores[k] === undefined || number(p.scores[k])) &&
    (p.scores.evidenceChecklist === undefined || Array.isArray(p.scores.evidenceChecklist) && p.scores.evidenceChecklist.every((c: unknown) => object(c) && text(c.label) && text(c.note) && ['verified','partial','missing','not_applicable'].includes(c.status)));
}
