import { t, L, nf, qar, pct, km } from '../i18n.js';
import { esc, regimeBadge } from '../ui.js';
import { statsForArea, pricePosition, projectPricePerSqm, unitYields } from '../calc/pricing.js';
import { livability } from '../calc/livability.js';
import { noiseProfile } from '../calc/noise.js';
import { facadeSunAllSeasons, ORIENTATIONS, heatRating } from '../calc/sun.js';
import { residencyCheck } from '../calc/residency.js';
import { getCompare, setCompare, bandLabel } from './projects.js';

export function renderCompare(el, data, query = '') {
  const fromUrl = new URLSearchParams(query).get('ids');
  let ids = (fromUrl ? fromUrl.split(',') : getCompare()).filter((id) => data.projectById[id]).slice(0, 4);
  if (fromUrl) setCompare(ids);

  const projects = ids.map((id) => data.projectById[id]);
  const rows = projects.map((p) => metrics(p, data));

  el.innerHTML = `
    <div class="page-head"><div><h1>${t('compare.title')}</h1><p class="muted">${t('compare.lede')}</p></div>
      ${ids.length ? `<button id="share" class="btn secondary">${t('compare.share')}</button>` : ''}</div>
    <div class="filters">
      <label class="field">${t('compare.addLabel')}<select id="add"><option value="">—</option>
        ${data.projects.filter((p) => !ids.includes(p.id)).map((p) => `<option value="${p.id}">${esc(L(p))}</option>`).join('')}</select></label>
      <div class="chips">${projects.map((p) => `<span class="chip">${esc(L(p))}<button data-rm="${p.id}" aria-label="${t('compare.remove')}">×</button></span>`).join('')}</div>
    </div>
    ${ids.length < 2 ? `<div class="card empty">${t('compare.empty')}</div>` : `
    <div class="card table-wrap"><table class="compare-table">
      <thead><tr><th></th>${projects.map((p) => `<th><a href="#/project/${p.id}">${esc(L(p))}</a></th>`).join('')}</tr></thead>
      <tbody>
        ${row(t('col.area'), rows.map((r) => `${esc(L(r.area))}<br>${regimeBadge(r.area.regime)}`))}
        ${row(t('col.developer'), rows.map((r) => esc(r.p.developer)))}
        ${row(t('col.handover'), rows.map((r) => esc(r.p.handover || '—')))}
        ${row(t('col.status'), rows.map((r) => t(`status.${r.p.status}`)))}
        ${row(t('col.fromPrice'), rows.map((r) => qar(r.from)))}
        ${row(t('col.priceSqm'), rows.map((r) => qar(r.ppsqm)))}
        ${row(t('col.vsArea'), rows.map((r) => (r.pos ? `${bandLabel(r.pos.band)} ${pct(r.pos.vsMedian)}` : '—')))}
        ${row(t('compare.bestYield'), rows.map((r) => (r.bestYield ? `${pct(r.bestYield.yield)} (${t(`utype.${r.bestYield.type}`)})` : '—')))}
        ${row(t('residency.title'), rows.map((r) => (r.res.best ? esc(L(r.res.best, 'label')) : r.res.foreignEligible ? t('residency.below') : t('residency.notForeign'))))}
        ${row(t('liv.title'), rows.map((r) => (r.liv.total == null ? '—' : `${nf(r.liv.total)}/100`)))}
        ${row(t('poi.metro'), rows.map((r) => km(r.liv.parts.find((x) => x.type === 'metro')?.distanceM)))}
        ${row(t('poi.beach'), rows.map((r) => km(r.liv.parts.find((x) => x.type === 'beach')?.distanceM)))}
        ${row(t('noise.air'), rows.map((r) => t(`noise.${r.noise.airLevel}`)))}
        ${row(t('noise.road'), rows.map((r) => t(`noise.${r.noise.roadLevel}`)))}
        ${row(t('compare.sunS'), rows.map((r) => `${nf(r.sun.summer.afternoonHours, { maximumFractionDigits: 1 })} ${t('unit.h')} · ${t(`heat.${heatRating(r.sun.summer.afternoonHours)}`)}`))}
        ${row(t('views.title'), rows.map((r) => (r.p.views || []).map((v) => t(`view.${v}`)).join(', ') || '—'))}
      </tbody></table></div>
    <p class="small muted">${t('compare.note')}</p>`}`;

  el.querySelector('#add').addEventListener('change', (e) => {
    if (!e.target.value) return;
    if (ids.length >= 4) { alert(t('compare.max')); return; }
    location.hash = `#/compare?ids=${[...ids, e.target.value].join(',')}`;
  });
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const next = ids.filter((x) => x !== b.dataset.rm);
    setCompare(next);
    location.hash = `#/compare?ids=${next.join(',')}`;
  }));
  el.querySelector('#share')?.addEventListener('click', async (e) => {
    const url = `${location.origin}${location.pathname}#/compare?ids=${ids.join(',')}`;
    try { await navigator.clipboard.writeText(url); e.target.textContent = t('compare.copied'); } catch { prompt(t('compare.share'), url); }
  });
}

function metrics(p, data) {
  const area = data.areaById[p.area_id] || {};
  const ppsqm = projectPricePerSqm(p);
  const from = Math.min(...(p.unit_mix || []).map((u) => u.price_from_qar).filter(Boolean));
  const yields = unitYields(p, data.rentsFor(p.area_id)).filter((y) => y.yield != null);
  return {
    p, area, ppsqm,
    from: Number.isFinite(from) ? from : null,
    pos: pricePosition(ppsqm, statsForArea(data, p.area_id)),
    bestYield: yields.sort((a, b) => b.yield - a.yield)[0] || null,
    res: residencyCheck({ priceQar: Number.isFinite(from) ? from : 0, regime: area.regime }, data.rules),
    liv: livability(p, data.poi),
    noise: noiseProfile(p, data.noise),
    sun: facadeSunAllSeasons({ lat: p.lat, lng: p.lng, facadeDeg: ORIENTATIONS[p.default_facade || 'S'], floor: 10, density: area.density || 'medium' }),
  };
}

function row(label, cells) {
  return `<tr><th scope="row">${label}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}
