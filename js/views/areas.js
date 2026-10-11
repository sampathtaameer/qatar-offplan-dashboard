import { t, L, nf, qar, qarShort, pct, dateFmt } from '../i18n.js';
import { chart, esc, regimeBadge, sourceNote, calcPanel, tableView, confBadge, css } from '../ui.js';
import { statsForArea, grossYield, monthlyMedians } from '../calc/pricing.js';
import { livability } from '../calc/livability.js';
import { noiseProfile } from '../calc/noise.js';
import { livabilityCard, noiseCard, locationMap, mapLegend } from './shared.js';

// Property categories in a fixed order so colours follow the category, never its rank.
export const CATS = ['unit', 'villa', 'land', 'other'];
const catOf = (t) => (CATS.includes(t) ? t : 'other');

export function lastWeeks(data, n = 52) {
  return new Set([...new Set(data.transactions.map((r) => r.week))].sort().slice(-n));
}

function areaRow(a, data, weeks) {
  const tx = (data.txByArea[a.id] || []).filter((r) => weeks.has(r.week));
  return {
    a,
    stats: statsForArea(data, a.id),
    deals: tx.reduce((s, r) => s + r.count, 0),
    units: tx.filter((r) => r.property_type === 'unit').reduce((s, r) => s + r.count, 0),
    projects: (data.projectsByArea[a.id] || []).length,
    liv: livability(a, data.poi).total,
    air: noiseProfile(a, data.noise).airLevel,
  };
}

export function renderAreas(el, data) {
  const weeks = lastWeeks(data);
  const rows = data.areas.map((a) => areaRow(a, data, weeks));
  el.innerHTML = `
    <div class="page-head"><div><h1>${t('areas.title')}</h1><p class="muted">${t('areas.lede')}</p></div></div>
    <div class="filters">
      <label class="field">${t('filter.search')}<input id="q" type="search"></label>
      <label class="field">${t('filter.regime')}<select id="regime"><option value="">${t('filter.all')}</option>
        ${['freehold', 'usufruct', 'qatari_only'].map((r) => `<option value="${r}">${t(`regime.${r}`)}</option>`).join('')}</select></label>
      <label class="field">${t('filter.municipality')}<select id="muni"><option value="">${t('filter.all')}</option>
        ${[...new Set(data.areas.map((a) => a.municipality))].sort().map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
    </div>
    <div class="card table-wrap"><table>
      <thead><tr><th>${t('col.area')}</th><th>${t('col.regime')}</th><th class="num">${t('col.medianSqm')}</th><th class="num">${t('col.units52')}</th>
        <th class="num">${t('col.deals52')}</th><th class="num">${t('col.projects')}</th><th class="num">${t('liv.title')}</th><th>${t('noise.air')}</th></tr></thead>
      <tbody id="tb"></tbody></table></div>`;

  const tb = el.querySelector('#tb');
  const draw = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    const rg = el.querySelector('#regime').value;
    const mu = el.querySelector('#muni').value;
    const list = rows.filter(({ a }) => (!rg || a.regime === rg) && (!mu || a.municipality === mu) &&
      (!q || `${a.name_en} ${a.name_ar}`.toLowerCase().includes(q)));
    tb.innerHTML = list.map((r) => `<tr class="clickable" data-id="${r.a.id}">
      <td><a href="#/area/${r.a.id}">${esc(L(r.a))}</a><div class="small muted">${esc(r.a.municipality)}</div></td>
      <td>${regimeBadge(r.a.regime)}</td>
      <td class="num">${r.stats && !r.stats.borrowed ? nf(r.stats.median) : '—'}</td>
      <td class="num">${nf(r.units)}</td><td class="num">${nf(r.deals)}</td><td class="num">${nf(r.projects)}</td>
      <td class="num">${r.liv == null ? '—' : nf(r.liv)}</td><td>${t(`noise.${r.air}`)}</td></tr>`).join('') ||
      `<tr><td colspan="8" class="empty">${t('empty.filter')}</td></tr>`;
  };
  el.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', draw));
  tb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.target.tagName !== 'A') location.hash = `#/area/${tr.dataset.id}`; });
  draw();
}

// Monthly count and value by category, for stacked demand charts.
export function monthlyByCategory(tx) {
  const months = {};
  for (const r of tx) {
    const m = r.week.slice(0, 7);
    const row = (months[m] ||= Object.fromEntries(CATS.flatMap((c) => [[c, 0], [`${c}_v`, 0]])));
    row[catOf(r.property_type)] += r.count;
    row[`${catOf(r.property_type)}_v`] += r.value_qar;
  }
  return Object.keys(months).sort().map((m) => ({ month: m, ...months[m] }));
}

export function renderArea(el, data, id) {
  const a = data.areaById[id];
  if (!a) { el.innerHTML = `<div class="card empty">${t('empty.notFound')}</div>`; return; }
  const weeks = lastWeeks(data);
  const tx = (data.txByArea[id] || []).slice().sort((x, y) => x.week.localeCompare(y.week));
  const tx52 = tx.filter((r) => weeks.has(r.week));
  const stats = statsForArea(data, id);
  const { areaId: compsId, deals } = data.compsFor(id);
  const trend = monthlyMedians(deals).filter((m) => m.n >= 3);
  const monthly = monthlyByCategory(tx);
  const rents = data.rentsFor(id);
  const pipeline = (data.pipelineByArea[id] || []).slice().sort((x, y) => x.year - y.year);
  const projects = data.projectsByArea[id] || [];
  const compsName = data.areaById[compsId] ? L(data.areaById[compsId]) : '';

  el.innerHTML = `
    <div class="page-head"><div>
      <a href="#/areas" class="small">← ${t('nav.areas')}</a>
      <h1>${esc(L(a))}</h1>
      <div>${regimeBadge(a.regime)} <span class="muted small">${esc(a.municipality)}${a.zone ? ` · ${t('area.zone')} ${esc(a.zone)}` : ''}</span> ${confBadge(a.confidence)}</div>
    </div></div>
    ${a.note_en ? `<p class="muted">${esc(L(a, 'note'))}</p>` : ''}

    <h2 class="section">${t('area.demand')}</h2>
    <div class="grid g-kpi">
      ${kpi(t('col.medianSqm'), stats ? qar(stats.median) : '—', stats ? t('area.iqr', { lo: nf(stats.p25), hi: nf(stats.p75) }) + (stats.borrowed ? ` · ${t('area.compsFrom', { a: esc(compsName) })}` : '') : t('overview.noData'))}
      ${kpi(t('col.units52'), nf(tx52.filter((r) => r.property_type === 'unit').reduce((s, r) => s + r.count, 0)), t('kpi.unitsSub'))}
      ${kpi(t('col.deals52'), nf(tx52.reduce((s, r) => s + r.count, 0)), t('kpi.allTypes'))}
      ${kpi(t('kpi.value52'), qarShort(tx52.reduce((s, r) => s + r.value_qar, 0)), t('kpi.allTypes'))}
    </div>
    <div class="grid g-2 section">
      <div class="card"><div class="card-head"><h3>${t('area.dealsChart')}</h3><span class="small muted">${t('src.moj')}</span></div>
        ${monthly.length ? `<div class="chart-box"><canvas id="cDeals"></canvas></div>
        ${tableView([t('col.month'), ...CATS.map((c) => t(`ptype.${c}`))], monthly.map((m) => [m.month, ...CATS.map((c) => nf(m[c]))]))}` : `<p class="muted">${t('overview.noData')}</p>`}
        ${sourceNote({ source: data.raw.transactions.source, source_url: data.raw.transactions.source_url, as_of: data.raw.transactions.as_of })}</div>
      <div class="card"><div class="card-head"><h3>${t('area.priceChart')}</h3>${stats?.borrowed ? `<span class="small muted">${esc(compsName)}</span>` : ''}</div>
        ${trend.length ? `<div class="chart-box"><canvas id="cPrice"></canvas></div>
        ${tableView([t('col.month'), t('col.medianSqm'), t('col.deals')], trend.map((m) => [m.month, nf(m.median), nf(m.n)]))}` : `<p class="muted">${t('overview.noData')}</p>`}
        ${calcPanel(t('calc.how'), `<p>${t('calc.areaMedianBody')}</p>${stats ? `<p>${t('calc.window', { from: dateFmt(stats.from), to: dateFmt(stats.to), n: stats.n_deals })}</p>
          <p><code>P10 ${nf(stats.p10)} · P25 ${nf(stats.p25)} · P50 ${nf(stats.median)} · P75 ${nf(stats.p75)} · P90 ${nf(stats.p90)}</code></p>` : ''}`)}</div>
    </div>

    <h2 class="section">${t('area.supply')}</h2>
    <div class="grid g-2">
      <div class="card"><div class="card-head"><h3>${t('area.pipelineChart')}</h3></div>
        ${pipeline.length ? `<div class="chart-box"><canvas id="cPipe"></canvas></div>
        ${tableView([t('col.year'), t('col.units')], pipeline.map((p) => [p.year, nf(p.units)]))}${sourceNote(pipeline[0])}` : `<p class="muted">${t('area.noPipeline')}</p>`}</div>
      <div class="card"><div class="card-head"><h3>${t('area.projects')}</h3><span class="muted small">${nf(projects.length)}</span></div>
        ${projects.length ? `<div class="table-wrap"><table><thead><tr><th>${t('col.project')}</th><th>${t('col.developer')}</th><th>${t('col.handover')}</th><th class="num">${t('col.units')}</th></tr></thead><tbody>
          ${projects.map((p) => `<tr><td><a href="#/project/${p.id}">${esc(L(p))}</a></td><td>${esc(p.developer)}</td><td>${esc(p.handover || '—')}</td><td class="num">${nf(p.units_total)}</td></tr>`).join('')}
        </tbody></table></div>` : `<p class="muted">${t('area.noProjects')}</p>`}</div>
    </div>

    <h2 class="section">${t('area.rents')}</h2>
    <div class="card table-wrap">
      ${rents.length ? `<table><thead><tr><th>${t('col.type')}</th><th class="num">${t('col.rentMedian')}</th><th class="num">${t('col.rentRange')}</th><th class="num">${t('col.size')}</th><th class="num">${t('col.yield')}</th></tr></thead><tbody>
        ${rents.map((r) => {
          const price = stats && r.typical_size_sqm ? stats.median * r.typical_size_sqm : null;
          return `<tr><td>${t(`utype.${r.unit_type}`)}</td><td class="num">${qar(r.median_qar_month)}</td>
            <td class="num">${r.min_qar_month ? `${nf(r.min_qar_month)}–${nf(r.max_qar_month)}` : '—'}</td>
            <td class="num">${r.typical_size_sqm ? nf(r.typical_size_sqm) : '—'}</td>
            <td class="num">${pct(grossYield(price, r.median_qar_month))}</td></tr>`;
        }).join('')}</tbody></table>
        <p class="small muted">${t('area.rentCaveat')}</p>${sourceNote(rents[0])}
        ${calcPanel(t('calc.how'), `<p>${t('calc.areaYieldBody')}</p>`)}` : `<p class="muted">${t('area.noRents')}</p>`}
    </div>

    <h2 class="section">${t('area.location')}</h2>
    <div class="grid g-2">${livabilityCard(a, data)}${noiseCard(a, data)}</div>
    <div class="card section"><div id="map" class="map"></div>${mapLegend()}</div>`;

  if (monthly.length) {
    chart(el.querySelector('#cDeals'), {
      labels: monthly.map((m) => m.month), stacked: true,
      datasets: CATS.map((c, i) => ({ label: t(`ptype.${c}`), data: monthly.map((m) => m[c]), color: css(`--series-${i + 1}`) })),
      yFormat: nf,
    });
  }
  if (trend.length) {
    chart(el.querySelector('#cPrice'), { type: 'line', labels: trend.map((m) => m.month),
      datasets: [{ label: t('col.medianSqm'), data: trend.map((m) => m.median), pointRadius: 3 }], yFormat: nf });
  }
  if (pipeline.length) chart(el.querySelector('#cPipe'), { labels: pipeline.map((p) => p.year), datasets: [{ label: t('col.units'), data: pipeline.map((p) => p.units) }], yFormat: nf });
  locationMap(el.querySelector('#map'), a, data, { zoom: 13, label: L(a) });
}

function kpi(label, value, sub) {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub || ''}</div></div>`;
}
