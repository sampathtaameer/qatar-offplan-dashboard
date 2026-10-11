import { t, L, nf, qarShort, qar, dateFmt } from '../i18n.js';
import { chart, makeMap, Leaflet, esc, css, regimeBadge, tableView, calcPanel } from '../ui.js';
import { statsForArea } from '../calc/pricing.js';

export function weeklyTotals(tx, weeks = 52) {
  const byWeek = {};
  for (const r of tx) {
    const w = (byWeek[r.week] ||= { week: r.week, count: 0, value: 0 });
    w.count += r.count || 0;
    w.value += r.value_qar || 0;
  }
  return Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)).slice(-weeks);
}

const SEQ = ['--seq-0', '--seq-1', '--seq-2', '--seq-3', '--seq-4'];

export function renderOverview(el, data) {
  const weeks = weeklyTotals(data.transactions);
  const last = weeks[weeks.length - 1];
  const sum = (k) => weeks.reduce((s, w) => s + w[k], 0);
  const year = new Date().getFullYear();
  const pipelineNext3 = data.pipeline.filter((p) => p.year >= year && p.year <= year + 2).reduce((s, p) => s + p.units, 0);
  const offplan = data.projects.filter((p) => p.status !== 'completed');

  const areaStats = data.areas.map((a) => ({ area: a, stats: statsForArea(data, a.id) })).filter((x) => x.stats && !x.stats.borrowed);
  const medians = areaStats.map((x) => x.stats.median).sort((a, b) => a - b);
  const bins = medians.length ? [0.2, 0.4, 0.6, 0.8].map((q) => medians[Math.floor(q * (medians.length - 1))]) : [];
  const binOf = (v) => bins.filter((b) => v > b).length;

  el.innerHTML = `
    <div class="page-head"><div><h1>${t('overview.title')}</h1><p class="muted">${t('overview.lede')}</p></div></div>
    <div class="grid g-kpi">
      ${kpi(t('kpi.deals52'), nf(sum('count')), t('kpi.allTypes'))}
      ${kpi(t('kpi.value52'), qarShort(sum('value')), t('kpi.allTypes'))}
      ${kpi(t('kpi.lastWeek'), last ? qarShort(last.value) : '—', last ? `${nf(last.count)} ${t('kpi.deals')} · ${dateFmt(last.week)}` : '')}
      ${kpi(t('kpi.projects'), nf(offplan.length), t('kpi.projectsSub'))}
      ${kpi(t('kpi.pipeline'), nf(pipelineNext3), t('kpi.pipelineSub', { from: year, to: year + 2 }))}
    </div>

    <div class="grid g-2 section">
      <div class="card">
        <div class="card-head"><h2>${t('overview.valueChart')}</h2><span class="small muted">${t('src.moj')}</span></div>
        <div class="chart-box"><canvas id="cValue"></canvas></div>
        ${tableView([t('col.week'), t('col.deals'), t('col.value')], weeks.map((w) => [w.week, nf(w.count), qar(w.value)]))}
      </div>
      <div class="card">
        <div class="card-head"><h2>${t('overview.countChart')}</h2><span class="small muted">${t('src.moj')}</span></div>
        <div class="chart-box"><canvas id="cCount"></canvas></div>
      </div>
    </div>

    <div class="card section">
      <div class="card-head"><h2>${t('overview.map')}</h2><span class="small muted">${t('overview.mapSub')}</span></div>
      <div id="map" class="map"></div>
      <div class="legend">${bins.length ? SEQ.map((v, i) => `<span><i style="background:var(${v})"></i>${i === 0 ? '≤ ' + nf(bins[0]) : i === 4 ? '> ' + nf(bins[3]) : nf(bins[i - 1]) + '–' + nf(bins[i])}</span>`).join('') : ''}
        <span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>${t('overview.noData')}</span></div>
      ${calcPanel(t('calc.areaMedian'), `<p>${t('calc.areaMedianBody')}</p>`)}
    </div>

    <div class="card section">
      <h2>${t('overview.changes')}</h2>
      ${data.changes.length ? `<ul class="changes">${data.changes.slice(0, 3).map((c) => `<li><strong>${dateFmt(c.date)}</strong><ul>${c.items.map((i) => `<li>${esc(L(i, 'text'))}</li>`).join('')}</ul></li>`).join('')}</ul>` : `<p class="muted">${t('overview.noChanges')}</p>`}
    </div>`;

  const labels = weeks.map((w) => dateFmt(w.week));
  chart(el.querySelector('#cValue'), { labels, datasets: [{ label: t('col.value'), data: weeks.map((w) => w.value) }], yFormat: (v) => qarShort(v) });
  chart(el.querySelector('#cCount'), { type: 'line', labels, datasets: [{ label: t('col.deals'), data: weeks.map((w) => w.count) }], yFormat: (v) => nf(v) });

  const map = makeMap(el.querySelector('#map'));
  const statsById = Object.fromEntries(areaStats.map((x) => [x.area.id, x.stats]));
  for (const a of data.areas) {
    const s = statsById[a.id];
    const fill = s ? css(SEQ[binOf(s.median)]) : css('--surface-2');
    Leaflet.circleMarker([a.lat, a.lng], { radius: 9, weight: 2, color: css('--surface'), fillColor: fill, fillOpacity: 0.95 })
      .bindPopup(`<strong>${esc(L(a))}</strong><br>${regimeBadge(a.regime)}<br>${s ? `${t('col.medianSqm')}: ${qar(s.median)}` : t('overview.noData')}<br><a href="#/area/${a.id}">${t('action.open')}</a>`)
      .addTo(map);
  }
}

function kpi(label, value, sub) {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub || ''}</div></div>`;
}
