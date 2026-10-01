import type { CostModel } from './types';

export function hasKnownCost(cost: CostModel): boolean {
  return [cost.capital_min_usd, cost.capital_max_usd, cost.gas_estimate_usd]
    .every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
    cost.capital_min_usd! <= cost.capital_max_usd!;
}

export function capitalLabel(cost: CostModel): string {
  if (cost.capital_max_usd === null || cost.capital_min_usd === null) {
    return cost.capital_required ? '需要本金，金额待核实' : '本金要求待核实';
  }
  return cost.capital_max_usd === 0 ? '无需本金' : `$${cost.capital_min_usd}–${cost.capital_max_usd}`;
}

export function gasLabel(cost: CostModel): string {
  return cost.gas_estimate_usd === null ? cost.gas_required ? '需要手续费，金额待核实' : '手续费待核实' :
    cost.gas_estimate_usd === 0 ? '无需手续费' : `约 $${cost.gas_estimate_usd}`;
}

export function stepCostLabel(cost: number | null): string {
  return cost === null ? '待核实' : cost > 0 ? `约 $${cost}` : '免费';
}
