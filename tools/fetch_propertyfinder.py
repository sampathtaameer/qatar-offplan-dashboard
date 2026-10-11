"""Refresh data/projects.json and data/rents.json from Property Finder Qatar public pages.

Usage: python -I tools/fetch_propertyfinder.py [project_root] [--projects] [--rents]
(no flag = both). Low volume: one request every 1.5 s, one results page per area and
bedroom count. Reads the page's embedded __NEXT_DATA__ JSON; no logins, no APIs.

projects.json keeps manual fields (name_ar, default_facade, views, notes, units_total, floors)
from the previous file when the listing does not provide them.
"""
import datetime as dt
import json
import os
import re
import statistics
import sys
import time
import urllib.request

ROOT = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(os.path.dirname(__file__), '..')))
BASE = 'https://www.propertyfinder.qa'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en'}
TODAY = dt.date.today().isoformat()

PROJECT_INDEXES = ['/en/new-projects', '/en/new-projects/lp/lusail', '/en/new-projects/lp/doha',
                   '/en/new-projects/lp/al-wakra', '/en/new-projects/lp/al-khor']

RENT_PAGES = {
    'the-pearl': 'doha/apartments-for-rent-the-pearl-island',
    'lusail': 'lusail/apartments-for-rent',
    'jabal-thuaileb': 'lusail/apartments-for-rent-fox-hills',
    'legtaifiya': 'doha/apartments-for-rent-west-bay-lagoon',
    'al-dafna': 'doha/apartments-for-rent-west-bay',
    'al-sadd': 'doha/apartments-for-rent-al-sadd',
    'al-mansoura': 'doha/apartments-for-rent-al-mansoura',
    'al-wakra': 'al-wakra/apartments-for-rent',
    'fereej-bin-mahmoud': 'doha/apartments-for-rent-fereej-bin-mahmoud',
    'najma': 'doha/apartments-for-rent-najma',
}

PLAN_LABELS = {
    'down_payment': ('down payment', 'دفعة أولى'),
    'during_construction': ('during construction', 'أثناء البناء'),
    'handover': ('on handover', 'عند التسليم'),
    'after_handover': ('after handover', 'بعد التسليم'),
}
STATUS = {'completed': 'completed', 'under_construction': 'under_construction', 'not_started': 'off_plan'}
GENERIC_COORDS = {(25.4084, 51.5121), (25.4162, 51.518)}  # PF district centroids, not buildings


def next_data(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode('utf-8', 'replace')
    time.sleep(1.5)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError(f'no __NEXT_DATA__ on {path}')
    return json.loads(m.group(1))['props']['pageProps']


def quantile(v, q):
    v = sorted(v)
    if not v:
        return None
    i = (len(v) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


# ---------- projects ----------

def area_for(loc, lat):
    if 'Qetaifan' in loc:
        return 'qetaifan-islands'
    if 'Fox Hills' in loc:
        return 'jabal-thuaileb'
    if loc.startswith('Lusail'):
        return 'lusail'
    if 'Al Wukair' in loc:
        return 'al-wukair'
    if 'Ezdan Village' in loc:
        return 'al-wukair' if lat < 25.14 else 'al-wakra'
    if re.search('muraikh', loc, re.I):
        return 'al-muraikh'
    if 'Abu Hamour' in loc:
        return 'abu-hamour'
    if 'Salata' in loc:
        return 'al-salata'
    if re.search('Sumaysimah|Simaisma', loc):
        return 'simaisma'
    if 'Pearl' in loc:
        return 'the-pearl'
    if 'Gewan' in loc:
        return 'gewan-island'
    return None


def unit_type(ptype, beds):
    if ptype in ('villa', 'townhouse', 'duplex', 'penthouse'):
        return ptype
    return 'studio' if not beds else f'{beds}br'


def plan_text(plans, li):
    out = []
    for pl in plans:
        parts = []
        for ph in pl.get('phases') or []:
            label = PLAN_LABELS.get(ph.get('label'), (ph.get('label'), ph.get('label')))[li]
            notes = '; '.join(m['label'].strip() for m in ph.get('miles') or [] if m.get('label', '').strip())
            parts.append(f"{ph.get('value')}% {label}" + (f' ({notes})' if notes else ''))
        if parts:
            out.append(f"{(pl.get('title') or '').strip()}: " + ', '.join(parts))
    return ' · '.join(out)


def views_from_name(name):
    v = []
    if re.search('marina', name, re.I):
        v.append('marina')
    if re.search('waterfront|sea|vagues|horizon|bay', name, re.I):
        v.append('sea')
    if re.search('canal', name, re.I):
        v.append('canal')
    return v


def fetch_projects():
    listings = {}
    for idx in PROJECT_INDEXES:
        for page in range(1, 6):
            try:
                pp = next_data(f'{idx}?page={page}' if page > 1 else idx)
            except Exception as e:  # noqa: BLE001
                print(f'skip {idx} p{page}: {e}', file=sys.stderr)
                break
            sr = pp.get('searchResult') or {}
            for p in (sr.get('data') or {}).get('projects') or []:
                listings[p['id']] = p
            pag = (sr.get('meta') or {}).get('pagination') or {}
            if page >= (pag.get('total') or 1):
                break

    prev_path = os.path.join(ROOT, 'data', 'projects.json')
    prev = {r['id']: r for r in json.load(open(prev_path, encoding='utf-8'))['records']} if os.path.exists(prev_path) else {}
    if len(listings) < max(10, len(prev) // 2):
        # Blocked or site changed: keep the previous file rather than wiping it.
        print(f'projects: only {len(listings)} listings found (had {len(prev)}); keeping previous file', file=sys.stderr)
        return None
    records = []
    for p in listings.values():
        slug = p['shareUrl'].rstrip('/').split('/')[-1]
        try:
            d = next_data(p['shareUrl']).get('detailResult') or {}
        except Exception as e:  # noqa: BLE001
            print(f'detail failed {slug}: {e}', file=sys.stderr)
            d = {}
        coords = (p.get('location') or {}).get('coordinates') or {}
        lat, lng = coords.get('lat'), coords.get('lon')
        loc = (d.get('location') or {}).get('fullName') or (p.get('location') or {}).get('fullName') or ''
        ptypes = p.get('propertyTypes') or []

        mix = []
        for g in d.get('units') or []:
            for u in g.get('units') or []:
                for x in u.get('list') or []:
                    lo, hi, price = x.get('areaFrom') or 0, x.get('areaTo') or 0, x.get('startingPrice') or 0
                    if not (lo or hi or price):
                        continue
                    mix.append({'type': unit_type(u.get('propertyType'), x.get('bedrooms')),
                                'size_sqm_min': (lo or hi) or None, 'size_sqm_max': (hi or lo) or None,
                                'price_from_qar': price or None})
        start = p.get('startingPrice') or 0
        if start and not any(u['price_from_qar'] for u in mix):
            # Listing gives only a project starting price; do not pair it with a unit size,
            # since we cannot tell which unit it belongs to.
            beds = (p.get('bedrooms') or [None])[0]
            is_villa = 'villa' in ptypes or 'townhouse' in ptypes or 'villa' in (p.get('title') or '').lower()
            typ = 'villa' if is_villa else unit_type(None, int(beds) if beds and beds.isdigit() else 1)
            mix.append({'type': typ, 'size_sqm_min': None, 'size_sqm_max': None, 'price_from_qar': start})

        desc = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', d.get('description') or ''))
        floors = re.search(r'(\d{1,3})[\s-]*(?:storey|story|floors?)\b', desc, re.I)
        units = re.search(r'(\d{2,4})\s+(?:residential\s+)?(?:units|apartments|residences)\b', desc, re.I)
        old = prev.get(slug, {})
        generic = lat is not None and (round(lat, 4), round(lng, 4)) in GENERIC_COORDS
        sized = [u for u in mix if u['price_from_qar'] and u['size_sqm_min']]
        plans = d.get('paymentPlans') or []
        rec = {
            'id': slug,
            'name_en': (p.get('title') or '').strip(),
            **({'name_ar': old['name_ar']} if old.get('name_ar') else {}),
            'developer': (p.get('developer') or {}).get('name'),
            'area_id': old.get('area_id') or area_for(loc, lat or 0),
            'lat': round(lat, 5) if lat else None, 'lng': round(lng, 5) if lng else None,
            'status': STATUS.get(p.get('constructionPhase'), 'off_plan'),
            'handover': (p.get('deliveryDate') or '')[:7] or None,
            'units_total': int(units.group(1)) if units else old.get('units_total'),
            'floors': int(floors.group(1)) if floors else old.get('floors'),
            'unit_mix': mix,
            'views': old.get('views') or views_from_name(p.get('title') or ''),
            'stock': p.get('stockAvailability'),
            'source': 'Property Finder Qatar, new projects',
            'source_url': BASE + p['shareUrl'],
            'as_of': TODAY,
            'confidence': 'low' if generic or not sized else 'medium',
        }
        if plans:
            rec['payment_plan_en'] = plan_text(plans, 0)
            rec['payment_plan_ar'] = plan_text(plans, 1)
        if generic:
            rec['coords_note'] = 'generic'
        for k in ('default_facade', 'note_en', 'note_ar'):
            if old.get(k):
                rec[k] = old[k]
        if not rec['area_id']:
            print(f'UNMAPPED project area: {rec["name_en"]} ({loc})', file=sys.stderr)
        records.append(rec)

    records.sort(key=lambda r: (r['area_id'] or '', r['name_en']))
    with open(prev_path, 'w', encoding='utf-8') as f:
        json.dump({'as_of': TODAY,
                   'notes': 'Developer listings from Property Finder Qatar new-projects pages. Prices are launch/starting prices; '
                            'unit sizes from published floor plans. coords_note=generic: the listing uses a district centroid, not the building.',
                   'records': records}, f, ensure_ascii=False, indent=1)
    print(f'projects: {len(records)}')
    return records


# ---------- rents ----------

def fetch_rents():
    recs = []
    for area, path in RENT_PAGES.items():
        for beds, utype in ((0, 'studio'), (1, '1br'), (2, '2br'), (3, '3br')):
            url = f'/en/rent/{path}.html?bdr[]={beds}'
            try:
                pp = next_data(url)
            except Exception as e:  # noqa: BLE001
                print(f'rent skip {area} {utype}: {e}', file=sys.stderr)
                continue
            title = pp.get('pageTitle') or ''
            sr = pp.get('searchResult') or {}
            want = {'studio', '0'} if beds == 0 else {str(beds)}
            props = [x['property'] for x in sr.get('listings') or [] if x.get('property') and str(x['property'].get('bedrooms')) in want]
            rents = []
            for pr in props:
                price = pr.get('price') or {}
                if price.get('period') == 'monthly':
                    rents.append(price['value'])
                elif price.get('period') == 'yearly':
                    rents.append(price['value'] / 12)
            sizes = [(pr.get('size') or {}).get('value') / (10.7639 if (pr.get('size') or {}).get('unit') == 'sqft' else 1)
                     for pr in props if (pr.get('size') or {}).get('value')]
            # PF falls back to a city-wide page when an area has no stock; reject those.
            if len(rents) < 5 or title.startswith('Properties for rent'):
                continue
            recs.append({
                'area_id': area, 'unit_type': utype,
                'median_qar_month': round(statistics.median(rents)),
                'min_qar_month': round(quantile(rents, 0.1)), 'max_qar_month': round(quantile(rents, 0.9)),
                'typical_size_sqm': round(statistics.median(sizes)) if sizes else None,
                'sample': len(rents), 'listings_total': (sr.get('meta') or {}).get('total_count'),
                'source': 'Property Finder Qatar asking rents (first results page, P10-P90 range)',
                'source_url': BASE + url, 'as_of': TODAY,
                'confidence': 'medium' if len(rents) >= 20 else 'low',
            })
    if len(recs) < 20:
        print(f'rents: only {len(recs)} records; keeping previous file', file=sys.stderr)
        return
    with open(os.path.join(ROOT, 'data', 'rents.json'), 'w', encoding='utf-8') as f:
        json.dump({'as_of': TODAY,
                   'notes': 'Asking rents, not signed leases. One results page (~25 listings) per area and bedroom count; '
                            'min/max are the 10th and 90th percentiles of that sample.',
                   'records': recs}, f, ensure_ascii=False, indent=1)
    print(f'rents: {len(recs)}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    flags = {a for a in sys.argv[1:] if a.startswith('--')}
    if not flags or '--projects' in flags:
        fetch_projects()
    if not flags or '--rents' in flags:
        fetch_rents()
