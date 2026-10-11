// Area comparables: every registered residential-unit sale (MoJ) in the last `months` months.
// Units under 25 sqm are dropped as likely parking/storage registrations.
export const MIN_DEALS = 8;

export function areaPriceStats(deals = [], { months = 12 } = {}) {
  if (!deals.length) return null;
  const latest = deals.reduce((m, d) => (d.date > m ? d.date : m), '');
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - months);
  const from = cutoff.toISOString().slice(0, 10);
  const obs = deals.filter((d) => d.date > from && d.sqm >= 25).map((d) => d.ppsqm).sort((a, b) => a - b);
  if (obs.length < MIN_DEALS) return null;
  return {
    n_deals: obs.length,
    p10: quantile(obs, 0.1),
    p25: quantile(obs, 0.25),
    median: quantile(obs, 0.5),
    p75: quantile(obs, 0.75),
    p90: quantile(obs, 0.9),
    min: obs[0],
    max: obs[obs.length - 1],
    from,
    to: latest,
  };
}

export function statsForArea(data, areaId, opts) {
  const { areaId: compsId, deals } = data.compsFor(areaId);
  const stats = areaPriceStats(deals, opts);
  return stats ? { ...stats, compsId, borrowed: compsId !== areaId } : null;
}

// Monthly median price per sqm, for trend charts.
export function monthlyMedians(deals = []) {
  const byMonth = {};
  for (const d of deals) if (d.sqm >= 25) (byMonth[d.date.slice(0, 7)] ||= []).push(d.ppsqm);
  return Object.keys(byMonth).sort().map((m) => {
    const v = byMonth[m].sort((a, b) => a - b);
    return { month: m, median: quantile(v, 0.5), n: v.length };
  });
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Neutral positioning: where a price sits relative to the area's interquartile range.
export function pricePosition(pricePerSqm, stats) {
  if (!pricePerSqm || !stats) return null;
  const band = pricePerSqm < stats.p25 ? 'below' : pricePerSqm > stats.p75 ? 'above' : 'within';
  const vsMedian = pricePerSqm / stats.median - 1;
  return { band, vsMedian };
}

// Apartment-type units only: comparables are registered apartment sales, and MoJ villa
// records give plot area, so a villa's price per sqm is not comparable.
const NOT_APARTMENT = new Set(['villa', 'townhouse']);

export function projectPricePerSqm(project) {
  if (project.price_per_sqm_qar) return project.price_per_sqm_qar;
  const vals = (project.unit_mix || [])
    .filter((u) => u.price_from_qar && u.size_sqm_min && !NOT_APARTMENT.has(u.type))
    .map((u) => u.price_from_qar / u.size_sqm_min);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function grossYield(priceQar, monthlyRentQar) {
  if (!priceQar || !monthlyRentQar) return null;
  return (monthlyRentQar * 12) / priceQar;
}

// Yield per unit type, matching the project's unit mix to area asking rents.
export function unitYields(project, areaRents = []) {
  return (project.unit_mix || []).map((u) => {
    const rent = areaRents.find((r) => r.unit_type === u.type);
    return {
      type: u.type,
      price: u.price_from_qar ?? null,
      rent: rent?.median_qar_month ?? null,
      rentSource: rent ?? null,
      yield: grossYield(u.price_from_qar, rent?.median_qar_month),
    };
  });
}
