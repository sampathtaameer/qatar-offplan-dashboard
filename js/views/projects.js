import { t, L, nf, qar, pct, dateFmt, store } from '../i18n.js';
import { chart, esc, regimeBadge, sourceNote, calcPanel, tableView, confBadge, css } from '../ui.js';
import { statsForArea, pricePosition, projectPricePerSqm, unitYields } from '../calc/pricing.js';
import { facadeSunAllSeasons, ORIENTATIONS, heatRating, obstructionAltitude } from '../calc/sun.js';
import { residencyCheck } from '../calc/residency.js';
import { livabilityCard, noiseCard, locationMap, mapLegend } from './shared.js';

export function getCompare() {
  try { return JSON.parse(localStorage.getItem('compare') || '[]'); } catch { return []; }
}
export function setCompare(ids) { store('compare', JSON.stringify(ids.slice(0, 4))); }

export function renderProjects(el, data) {
  const years = [...new Set(data.projects.map((p) => (p.handover || '').slice(0, 4)).filter(Boolean))].sort();
  const devs = [...new Set(data.projects.map((p) => p.developer))].sort();
  el.innerHTML = `
    <div class="page-head"><div><h1>${t('projects.title')}</h1><p class="muted">${t('projects.lede')}</p></div>
      <a id="cmpBtn" class="btn" href="#/compare">${t('nav.compare')}</a></div>
    <div class="filters">
      <label class="field">${t('filter.search')}<input id="q" type="search"></label>
      <label class="field">${t('col.area')}<select id="area"><option value="">${t('filter.all')}</option>
        ${data.areas.slice().sort((a, b) => L(a).localeCompare(L(b))).map((a) => `<option value="${a.id}">${esc(L(a))}</option>`).join('')}</select></label>
      <label class="field">${t('col.developer')}<select id="dev"><option value="">${t('filter.all')}</option>${devs.map((d) => `<option>${esc(d)}</option>`).join('')}</select></label>
      <label class="field">${t('col.handover')}<select id="yr"><option value="">${t('filter.all')}</option>${years.map((y) => `<option>${y}</option>`).join('')}</select></label>
      <label class="field">${t('filter.regime')}<select id="regime"><option value="">${t('filter.all')}</option>
        ${['freehold', 'usufruct', 'qatari_only'].map((r) => `<option value="${r}">${t(`regime.${r}`)}</option>`).join('')}</select></label>
    </div>
    <div class="card table-wrap"><table>
      <thead><tr><th>${t('nav.compare')}</th><th>${t('col.project')}</th><th>${t('col.area')}</th><th>${t('col.developer')}</th><th>${t('col.handover')}</th>
        <th class="num">${t('col.fromPrice')}</th><th class="num">${t('col.priceSqm')}</th><th>${t('col.vsArea')}</th></tr></thead>
      <tbody id="tb"></tbody></table></div>`;

  const tb = el.querySelector('#tb');
  const cmpBtn = el.querySelector('#cmpBtn');
  const syncBtn = () => {
    const ids = getCompare();
    cmpBtn.textContent = `${t('nav.compare')} (${ids.length})`;
    cmpBtn.href = `#/compare?ids=${ids.join(',')}`;
  };
  const draw = () => {
    const v = (id) => el.querySelector(id).value;
    const q = v('#q').trim().toLowerCase();
    const sel = getCompare();
    const list = data.projects.filter((p) => {
      const a = data.areaById[p.area_id];
      return (!v('#area') || p.area_id === v('#area')) && (!v('#dev') || p.developer === v('#dev')) &&
        (!v('#yr') || (p.handover || '').startsWith(v('#yr'))) && (!v('#regime') || a?.regime === v('#regime')) &&
        (!q || `${p.name_en} ${p.name_ar} ${p.developer}`.toLowerCase().includes(q));
    });
    tb.innerHTML = list.map((p) => {
      const a = data.areaById[p.area_id];
      const ppsqm = projectPricePerSqm(p);
      const pos = pricePosition(ppsqm, statsForArea(data, p.area_id));
      const from = Math.min(...(p.unit_mix || []).map((u) => u.price_from_qar).filter(Boolean));
      return `<tr>
        <td><input type="checkbox" data-cmp="${p.id}" ${sel.includes(p.id) ? 'checked' : ''} aria-label="${t('nav.compare')}"></td>
        <td><a href="#/project/${p.id}">${esc(L(p))}</a> ${confBadge(p.confidence)}</td>
        <td>${esc(L(a))}</td><td>${esc(p.developer)}</td><td>${esc(p.handover || '—')}</td>
        <td class="num">${Number.isFinite(from) ? nf(from) : '—'}</td><td class="num">${ppsqm ? nf(ppsqm) : '—'}</td>
        <td>${pos ? bandLabel(pos.band) : '—'}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="empty">${t('empty.filter')}</td></tr>`;
    syncBtn();
  };
  el.querySelectorAll('.filters input, .filters select').forEach((i) => i.addEventListener('input', draw));
  tb.addEventListener('change', (e) => {
    const id = e.target.dataset.cmp; if (!id) return;
    let ids = getCompare().filter((x) => x !== id);
    if (e.target.checked) { if (ids.length >= 4) { e.target.checked = false; alert(t('compare.max')); return; } ids.push(id); }
    setCompare(ids); syncBtn();
  });
  draw();
}

export function bandLabel(band) {
  const cls = band === 'within' ? '' : band === 'above' ? 'warn' : 'good';
  return `<span class="badge ${cls}">${t(`band.${band}`)}</span>`;
}

export function renderProject(el, data, id) {
  const p = data.projectById[id];
  if (!p) { el.innerHTML = `<div class="card empty">${t('empty.notFound')}</div>`; return; }
  const a = data.areaById[p.area_id] || {};
  const stats = statsForArea(data, p.area_id);
  const ppsqm = projectPricePerSqm(p);
  const pos = pricePosition(ppsqm, stats);
  const yields = unitYields(p, data.rentsFor(p.area_id));
  const fromPrice = Math.min(...(p.unit_mix || []).map((u) => u.price_from_qar).filter(Boolean));
  const res = residencyCheck({ priceQar: Number.isFinite(fromPrice) ? fromPrice : 0, regime: a.regime }, data.rules);
  const inCompare = getCompare().includes(p.id);

  el.innerHTML = `
    <div class="page-head"><div>
      <a href="#/projects" class="small">← ${t('nav.projects')}</a>
      <h1>${esc(L(p))}</h1>
      <div>${esc(p.developer)} · <a href="#/area/${a.id}">${esc(L(a))}</a> ${regimeBadge(a.regime)} ${confBadge(p.confidence)}</div>
    </div>
    <button id="cmp" class="btn ${inCompare ? 'secondary' : ''}">${inCompare ? t('compare.remove') : t('compare.add')}</button></div>

    <div class="grid g-kpi">
      ${kpi(t('col.status'), t(`status.${p.status}`), p.stock ? t(`stock.${p.stock}`) : '')}
      ${kpi(t('col.handover'), esc(p.handover || '—'), '')}
      ${kpi(t('col.units'), nf(p.units_total), p.floors ? t('project.floors', { n: p.floors }) : '')}
      ${kpi(t('col.fromPrice'), Number.isFinite(fromPrice) ? qar(fromPrice) : '—', '')}
      ${kpi(t('residency.title'), res.best ? esc(L(res.best, 'label')) : res.foreignEligible ? t('residency.below') : t('residency.notForeign'), `<a href="#/residency?price=${Number.isFinite(fromPrice) ? fromPrice : ''}&area=${a.id}">${t('action.check')}</a>`)}
    </div>
    ${p.coords_note === 'generic' ? `<p class="badge warn section">${t('project.genericCoords')}</p>` : ''}
    ${p.payment_plan_en ? `<div class="card section"><h3>${t('project.payment')}</h3><p>${esc(L(p, 'payment_plan'))}</p><p class="small muted">${t('project.paymentNote')}</p></div>` : ''}
    ${sourceNote(p)}

    <h2 class="section">${t('project.pricing')}</h2>
    <div class="grid g-2">
      <div class="card">
        <h3>${t('project.position')}</h3>
        ${ppsqm && stats ? priceBand(ppsqm, stats, pos) : `<p class="muted">${t('project.noComps')}</p>`}
        ${calcPanel(t('calc.how'), `<p>${t('calc.positionBody')}</p>${stats ? `<p>${t('calc.window', { from: dateFmt(stats.from), to: dateFmt(stats.to), n: stats.n_deals })}</p>
          <p><code>P25 ${nf(stats.p25)} · P50 ${nf(stats.median)} · P75 ${nf(stats.p75)} · ${t('col.priceSqm')} ${nf(ppsqm)}</code></p>` : ''}`)}
      </div>
      <div class="card table-wrap">
        <h3>${t('project.unitMix')}</h3>
        <table><thead><tr><th>${t('col.type')}</th><th class="num">${t('col.size')}</th><th class="num">${t('col.fromPrice')}</th><th class="num">${t('col.rentMedian')}</th><th class="num">${t('col.yield')}</th></tr></thead><tbody>
        ${(p.unit_mix || []).map((u, i) => `<tr><td>${t(`utype.${u.type}`)}</td>
          <td class="num">${u.size_sqm_min ? `${nf(u.size_sqm_min)}${u.size_sqm_max && u.size_sqm_max !== u.size_sqm_min ? '–' + nf(u.size_sqm_max) : ''}` : '—'}</td>
          <td class="num">${nf(u.price_from_qar)}</td><td class="num">${nf(yields[i].rent)}</td><td class="num">${pct(yields[i].yield)}</td></tr>`).join('')}
        </tbody></table>
        <p class="small muted">${t('project.yieldCaveat')}</p>
        ${calcPanel(t('calc.how'), `<p>${t('calc.yieldBody')}</p>`)}
      </div>
    </div>

    <h2 class="section">${t('sun.title')}</h2>
    <div class="card">
      <div class="filters">
        <label class="field">${t('sun.facade')}<select id="facade">${Object.keys(ORIENTATIONS).map((o) => `<option value="${o}" ${o === (p.default_facade || 'S') ? 'selected' : ''}>${t(`dir.${o}`)}</option>`).join('')}</select></label>
        <label class="field">${t('sun.floor')}<input id="floor" type="number" min="0" max="${p.floors || 80}" value="${Math.min(10, p.floors || 10)}"></label>
        <label class="field">${t('sun.density')}<select id="density">${['low', 'medium', 'high'].map((d) => `<option value="${d}" ${d === (a.density || 'medium') ? 'selected' : ''}>${t(`density.${d}`)}</option>`).join('')}</select></label>
      </div>
      <div id="sunKpis" class="grid g-kpi"></div>
      <div class="chart-box section"><canvas id="cSun"></canvas></div>
      <div id="sunTable"></div>
      <p class="small muted">${t('sun.caveat')}</p>
      ${calcPanel(t('calc.how'), `<p>${t('calc.sunBody')}</p><p id="sunCalc"></p>`)}
    </div>

    <h2 class="section">${t('views.title')}</h2>
    <div class="card">
      ${(p.views || []).length ? `<div class="chips">${p.views.map((v) => `<span class="chip">${t(`view.${v}`)}</span>`).join('')}</div>` : `<p class="muted">${t('views.none')}</p>`}
      <p class="small muted">${t('views.note')}</p>
    </div>

    <h2 class="section">${t('area.location')}</h2>
    <div class="grid g-2">${livabilityCard(p, data)}${noiseCard(p, data)}</div>
    <div class="card section"><div id="map" class="map"></div>${mapLegend()}</div>`;

  el.querySelector('#cmp').addEventListener('click', () => {
    const ids = getCompare();
    if (ids.includes(p.id)) setCompare(ids.filter((x) => x !== p.id));
    else if (ids.length >= 4) { alert(t('compare.max')); return; } else setCompare([...ids, p.id]);
    renderProject(el, data, id);
  });

  // Sun tool: hours of direct sun for every orientation (summer vs winter), selected one highlighted.
  let sunChart;
  const drawSun = () => {
    const facade = el.querySelector('#facade').value;
    const floor = Number(el.querySelector('#floor').value) || 0;
    const density = el.querySelector('#density').value;
    const all = Object.fromEntries(Object.entries(ORIENTATIONS).map(([k, deg]) => [k, facadeSunAllSeasons({ lat: p.lat, lng: p.lng, facadeDeg: deg, floor, density })]));
    const sel = all[facade];
    el.querySelector('#sunKpis').innerHTML =
      kpi(t('sun.summer'), `${nf(sel.summer.hours, { maximumFractionDigits: 1 })} ${t('unit.h')}`, t('sun.afternoon', { h: nf(sel.summer.afternoonHours, { maximumFractionDigits: 1 }) })) +
      kpi(t('sun.winter'), `${nf(sel.winter.hours, { maximumFractionDigits: 1 })} ${t('unit.h')}`, t('sun.afternoon', { h: nf(sel.winter.afternoonHours, { maximumFractionDigits: 1 }) })) +
      kpi(t('sun.heat'), t(`heat.${heatRating(sel.summer.afternoonHours)}`), t('sun.heatSub'));
    const keys = Object.keys(ORIENTATIONS);
    const dim = (base) => keys.map((k) => (k === facade ? css(base) : css(base) + '66'));
    sunChart?.destroy();
    sunChart = chart(el.querySelector('#cSun'), {
      labels: keys.map((k) => t(`dir.${k}`)),
      datasets: [
        { label: t('sun.summer'), data: keys.map((k) => all[k].summer.hours), backgroundColor: dim('--series-2') },
        { label: t('sun.winter'), data: keys.map((k) => all[k].winter.hours), backgroundColor: dim('--series-1') },
      ],
      yFormat: (v) => `${nf(v, { maximumFractionDigits: 1 })} ${t('unit.h')}`,
    });
    el.querySelector('#sunTable').innerHTML = tableView([t('sun.facade'), t('sun.summer'), t('sun.equinox'), t('sun.winter')],
      keys.map((k) => [t(`dir.${k}`), ...['summer', 'equinox', 'winter'].map((s) => nf(all[k][s].hours, { maximumFractionDigits: 1 }))]));
    el.querySelector('#sunCalc').textContent = t('calc.sunParams', { lat: p.lat.toFixed(4), lng: p.lng.toFixed(4), alt: nf(obstructionAltitude(floor, density), { maximumFractionDigits: 1 }) });
  };
  el.querySelectorAll('#facade, #floor, #density').forEach((i) => i.addEventListener('input', drawSun));
  drawSun();

  locationMap(el.querySelector('#map'), p, data, { zoom: 14, label: L(p) });
}

function priceBand(v, s, pos) {
  // Scale spans the 10th–90th percentile of area deals (outliers would squash the box), widened to include this project.
  const lo = Math.min(s.p10, v) * 0.92, hi = Math.max(s.p90, v) * 1.08;
  const x = (n) => ((n - lo) / (hi - lo)) * 100;
  const side = document.documentElement.dir === 'rtl' ? 'right' : 'left';
  return `<div class="kpi"><div class="value">${qar(v)} <span class="small muted">/ ${t('unit.sqm')}</span></div>
    <div class="sub">${bandLabel(pos.band)} · ${t('project.vsMedian', { p: pct(pos.vsMedian) })}</div></div>
    <div class="band" role="img" aria-label="${t(`band.${pos.band}`)}">
      <div class="track"></div>
      <div class="iqr" style="${side}:${x(s.p25)}%;width:${x(s.p75) - x(s.p25)}%"></div>
      <div class="pin" style="${side}:${x(v)}%"></div>
    </div>
    <div class="band-labels"><span>${nf(lo)}</span><span>${t('project.iqrLabel')}</span><span>${nf(hi)}</span></div>`;
}

function kpi(label, value, sub) {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub || ''}</div></div>`;
}
