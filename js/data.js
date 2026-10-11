// Loads every data file once and builds lookup indexes.
const FILES = ['areas', 'projects', 'transactions', 'deals', 'rents', 'pipeline', 'poi', 'noise', 'rules', 'changes'];
const STALE_DAYS = { transactions: 21, deals: 21, rents: 120, projects: 120, pipeline: 180, areas: 365, poi: 365, noise: 365, rules: 180 };

let cache = null;

export async function loadData() {
  if (cache) return cache;
  const entries = await Promise.all(FILES.map(async (name) => {
    const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
    return [name, await res.json()];
  }));
  const raw = Object.fromEntries(entries);
  cache = index(raw);
  return cache;
}

function index(raw) {
  const areas = raw.areas.records;
  const projects = raw.projects.records;
  const byId = (list) => Object.fromEntries(list.map((r) => [r.id, r]));
  const groupBy = (list, key) => list.reduce((acc, r) => ((acc[r[key]] ||= []).push(r), acc), {});

  // deals.json rows are [date, area_id, sqm, value]; expand once.
  const deals = raw.deals.records.map(([date, area_id, sqm, value]) => ({ date, area_id, sqm, value, ppsqm: value / sqm }));
  const dealsByArea = groupBy(deals, 'area_id');
  const areaById = byId(areas);
  // Areas without their own registered deals (e.g. Qetaifan, Gewan) borrow comparables.
  const compsFor = (areaId) => {
    const a = areaById[areaId];
    const own = dealsByArea[areaId] || [];
    if (own.length >= 20 || !a?.comps_area) return { areaId, deals: own };
    return { areaId: a.comps_area, deals: dealsByArea[a.comps_area] || [] };
  };

  const rentsByArea = groupBy(raw.rents.records, 'area_id');
  const rentsFor = (areaId) => rentsByArea[areaId] || rentsByArea[areaById[areaId]?.comps_area] || [];

  // Supply pipeline: external records (pipeline.json) plus tracked projects' units by handover year.
  const pipeline = [...raw.pipeline.records];
  for (const p of projects) {
    const year = Number(String(p.handover || '').slice(0, 4));
    if (!year || !p.units_total || p.status === 'completed') continue;
    const hit = pipeline.find((r) => r.area_id === p.area_id && r.year === year && r.derived);
    if (hit) hit.units += p.units_total;
    else pipeline.push({ area_id: p.area_id, year, units: p.units_total, derived: true, source: 'Tracked projects (projects.json)', as_of: raw.projects.as_of, confidence: 'medium' });
  }

  return {
    raw,
    meta: Object.fromEntries(FILES.map((f) => [f, { as_of: raw[f].as_of, stale: isStale(raw[f].as_of, STALE_DAYS[f]) }])),
    areas,
    areaById,
    deals,
    dealsByArea,
    compsFor,
    projects,
    projectById: byId(projects),
    projectsByArea: groupBy(projects, 'area_id'),
    transactions: raw.transactions.records,
    txByArea: groupBy(raw.transactions.records, 'area_id'),
    rents: raw.rents.records,
    rentsByArea,
    rentsFor,
    pipeline,
    pipelineByArea: groupBy(pipeline, 'area_id'),
    poi: raw.poi.records,
    noise: raw.noise,
    rules: raw.rules,
    changes: raw.changes.records,
  };
}

export function isStale(asOf, days) {
  if (!asOf || !days) return false;
  return (Date.now() - new Date(asOf).getTime()) / 86400000 > days;
}

export const SQFT_PER_SQM = 10.7639;
