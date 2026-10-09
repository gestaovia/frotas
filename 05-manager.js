/* ===================== Telas da gestão ===================== */
const tbl = (head, rows, emptyTxt = 'Nenhum registro.') => rows.length
  ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map(h => `<th class="${h.startsWith('>') ? 'r' : ''}">${h.replace(/^>/, '')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : empty(emptyTxt);
const barCell = (v, max, c = '') => `<div class="bar ${c}" style="width:100%"><i style="width:${max ? Math.max(2, Math.min(100, v / max * 100)) : 0}%"></i></div>`;
const monthLabel = () => new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const ownTag = v => v.ownership === 'locada' ? pill(`${ic('key')} Locada`, 'amber') : pill('Própria', '');
const seatsTag = v => `<span class="ico muted small" title="Ocupantes">${ic('seat')} ${v.seats || '—'}</span>`;
const ring = (score, sm) => `<div class="ring ${sm ? 'sm' : ''}" style="--p:${Math.round(score)};--c:${scoreColor(score)}"><span>${nf(score, 0)}</span></div>`;
const kpi = (label, value, icon, cls = '', go = '', sub = '') => `<button class="kpi ${cls} ${String(value) === '0' ? 'zero' : ''}" ${go}><div class="l">${ic(icon)}${label}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</button>`;

/* ===================== Mapa (Leaflet + base vetorial real) ===================== */
let MAPS = [];
function destroyMaps() { MAPS.forEach(m => { try { m.remove(); } catch (e) { } }); MAPS = []; }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const statusHex = c => ({ ok: cssVar('--green'), neu: cssVar('--blue'), warn: cssVar('--yellow'), urg: cssVar('--orange'), bad: cssVar('--red'), gray: cssVar('--text3') }[c] || cssVar('--text3'));
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
function buildMap(el, vehicles, opts = {}) {
  if (!el) return null;
  if (!window.L) { el.innerHTML = '<div class="empty">Mapa indisponível: a biblioteca de mapas não carregou.</div>'; return null; }
  const map = L.map(el, { scrollWheelZoom: false, zoomSnap: .5, fadeAnimation: false, zoomAnimation: true, attributionControl: true, minZoom: 9, maxZoom: 18 });
  MAPS.push(map);
  map.createPane('vbase').style.zIndex = 150;
  map.createPane('vlabel').style.zIndex = 160;
  const BM = window.BASEMAP;
  if (BM) {
    L.geoJSON(BM.mun, { pane: 'vbase', interactive: false, style: { color: cssVar('--map-line'), weight: 1, fillColor: cssVar('--map-mun'), fillOpacity: 1 } }).addTo(map);
    L.geoJSON(BM.urban, { pane: 'vbase', interactive: false, style: { stroke: false, fillColor: cssVar('--map-urban'), fillOpacity: 1 } }).addTo(map);
    L.geoJSON(BM.roads, { pane: 'vbase', interactive: false, style: { color: cssVar('--map-road-case'), weight: 6, opacity: 1 } }).addTo(map);
    L.geoJSON(BM.roads, { pane: 'vbase', interactive: false, style: { color: cssVar('--map-road'), weight: 3.5, opacity: 1 } }).addTo(map);
    BM.mun.features.forEach(f => L.marker(f.properties.c, { pane: 'vlabel', interactive: false, icon: L.divIcon({ className: '', html: `<div class="mlabel">${esc(f.properties.n)}</div>`, iconSize: [0, 0] }) }).addTo(map));
  }
  // ruas reais quando a rede permite (Hostinger); no visualizador fica a base vetorial acima
  const tl = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${isDark() ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap · © CARTO' });
  let failed = 0;
  tl.on('tileerror', () => { if (++failed === 1) { map.removeLayer(tl); map.attributionControl.addAttribution('Base: IBGE · Natural Earth'); } });
  tl.addTo(map);
  const pts = [];
  if (opts.projects !== false) S.projects.filter(p => p.active).forEach(p => {
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="ppin"></div><div class="mlabel proj">${esc(p.code)}</div>`, iconSize: [0, 0] }) }).bindTooltip(`${esc(p.code)} · ${esc(p.name)}`).addTo(map);
    if (!opts.fitVehiclesOnly) pts.push([p.lat, p.lng]);
  });
  map._vm = {};
  vehicles.forEach(v => {
    const loc = lastLocation(v.id); if (!loc) return;
    const st = vStatus(v);
    const m = L.marker([loc.lat, loc.lng], { riseOnHover: true, zIndexOffset: 1000, icon: vehicleIcon(v, st) });
    m._st = st; m.bindPopup(() => vehiclePopup(v, lastLocation(v.id)));
    m.addTo(map); pts.push([loc.lat, loc.lng]); map._vm[v.id] = m;
  });
  if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: opts.maxZoom || 12, animate: false });
  else if (pts.length === 1) map.setView(pts[0], opts.zoom || 13, { animate: false });
  else map.setView([-22.9, -47.06], 11, { animate: false });
  setTimeout(() => { if (MAPS.includes(map)) map.invalidateSize({ animate: false }); }, 60);
  return map;
}
const vehicleIcon = (v, st) => L.divIcon({ className: '', html: `<div class="vpin"><i style="background:${statusHex(V_STATUS[st].c)}"></i><b>${v.plate}</b></div>`, iconSize: [0, 0] });
function vehiclePopup(v, loc) {
  const st = vStatus(v); const c = activeCustody(v.id); const seg = currentSegment(c); const t = S.locations[v.id];
  return `<div class="map-pop"><b>${v.plate}</b> · ${esc(v.model)}<br>${stTag(st)}<br>${c ? `${esc(drv(c.driverId).name)} · ${seg ? esc(prj(seg.projectId).code) : 'sem obra'}<br>` : ''}<span class="muted">${esc(loc.what)} · ${fmtShort(loc.at)}</span>${t?.source === 'traccar' && v.tracker ? `<br><span class="muted">Hodômetro ${nf(v.odometer)} km · ignição ${t.ignition ? 'ligada' : 'desligada'}</span>` : ''}<br><button class="link" data-go="veiculo" data-id="${v.id}">Abrir veículo</button></div>`;
}
const mapLegend = () => `<div class="map-legend">${['em_uso', 'disponivel', 'aguardando_transferencia', 'manutencao', 'bloqueado'].map(k => `<span class="st"><span class="dot ${V_STATUS[k].c}"></span>${V_STATUS[k].l}</span>`).join('')}<span class="st"><span class="ppin" style="transform:none;display:inline-block;width:11px;height:11px"></span>Obra</span></div>`;

/* ===================== Painel (dashboard) ===================== */
PAGES.dashboard = {
  title: 'Painel da frota',
  render() {
    const k = fleetCounts(); const att = attentionItems(); const crit = att.filter(a => ['bad', 'urg'].includes(a.c)).length;
    const inUse = S.custody.filter(c => !c.end).sort((a, b) => a.start - b.start);
    const order = { bloqueado: 0, pendencia: 1, aguardando_transferencia: 2, em_uso: 3, deslocamento: 3, parado: 4, manutencao: 5, disponivel: 6 };
    const vs = S.vehicles.filter(v => v.active).slice().sort((a, b) => order[vStatus(a)] - order[vStatus(b)] || a.plate.localeCompare(b.plate));
    return `<div class="stack">
      <div class="kpis">
        ${kpi('Veículos', k.total, 'car', '', 'data-go="veiculos"', `${k.locados} locados`)}
        ${kpi('Em uso', k.emUso, 'road', 'c-blue', 'data-go="veiculos" data-f="em_uso"', `${inUse.length} condutores`)}
        ${kpi('Disponíveis', k.disp, 'check', 'c-green', 'data-go="veiculos" data-f="disponivel"')}
        ${kpi('Manutenção', k.manut, 'wrench', k.manutVenc ? 'c-red' : '', 'data-go="calendario"', `${k.manutVenc} vencida(s)`)}
        ${kpi('Alertas', crit, 'alert', crit ? 'c-red' : '', 'data-go="dashboard" data-f="alertas"', `${att.length} no total`)}
        ${kpi('Locações', k.locVence, 'key', k.locVence ? 'c-amber' : '', 'data-go="veiculos" data-f="locada"', 'vencendo em 30 dias')}
      </div>
      <div class="split">
        <div class="panel"><div class="panel-h"><h2>Mapa da frota</h2>${tcBadge()}</div>
          <div class="panel-b"><div class="fleet-map" id="dash-map" role="img" aria-label="Mapa com a posição dos veículos"></div>${mapLegend()}</div></div>
        <div class="panel"><div class="panel-h"><h2>Status dos veículos</h2><button class="link small" data-go="veiculos">Ver todos</button></div>
          <div class="vlist">${vs.map(v => { const st = vStatus(v); const c = activeCustody(v.id); const seg = currentSegment(c); const loc = lastLocation(v.id);
            return `<div class="vrow" data-go="veiculo" data-id="${v.id}">${plate(v.plate)}<div class="who2"><b>${c ? esc(drv(c.driverId).name) : V_STATUS[st].l}</b><small>${c ? `${seg ? esc(prj(seg.projectId).code) : 'Sem obra'} · desde ${fmtShort(c.start)}` : loc ? `${esc(nearestPlace(loc))}` : esc(v.model)}</small></div><span class="dot ${V_STATUS[st].c}" title="${V_STATUS[st].l}"></span></div>`; }).join('')}</div></div>
      </div>
      <div class="panel"><div class="panel-h"><h2>Condutores em posse</h2><span class="pill blue">${inUse.length}</span></div>
        <div class="panel-b"><div class="cards">${inUse.map(c => { const v = veh(c.vehicleId); const d = drv(c.driverId); const seg = currentSegment(c); const dly = dailyDoneToday(v.id);
          return `<div class="vcard" data-go="condutor" data-id="${d.id}" style="gap:10px"><div class="person"><span class="avatar lg">${initials(d.name)}</span><div style="min-width:0"><b>${esc(d.name)}</b><small>${seg ? esc(prj(seg.projectId).code) : '<span style="color:var(--orange)">Sem obra</span>'} · ${dur(nowTs() - c.start)}</small></div></div>
            <div class="foot" style="padding-top:8px">${plate(v.plate)}<span class="st small"><span class="dot ${dly ? 'ok' : 'warn'}"></span>${dly ? 'Checklist ok' : 'Sem checklist'}</span></div></div>`; }).join('') || empty('Nenhum veículo em uso.')}</div></div></div>
    </div>`;
  },
  mount() { buildMap($('#dash-map'), S.vehicles.filter(v => v.active)); },
  rightbar() {
    const att = attentionItems().slice(0, 7);
    const ev = upcomingEvents(30).slice(0, 7);
    const from = startOfMonth(nowTs()); const rows = periodCosts(from, nowTs() + 1); const kms = kmInPeriod(from, nowTs() + 1); const tot = sum(rows, r => r.value);
    return `<div class="rb-section"><div class="rb-title">${ic('alert')}Atenção</div>${att.map(a => `<div class="rb-item ${a.c}" data-go="${a.go.page}" ${a.go.id ? `data-id="${a.go.id}"` : ''} ${a.go.vid ? `data-vid="${a.go.vid}"` : ''} ${a.go.f ? `data-f="${a.go.f}"` : ''} ${a.go.tab ? `data-tab="${a.go.tab}"` : ''}><div style="min-width:0"><b style="white-space:normal">${esc(a.title)}</b><small>${esc(a.sub)}</small></div></div>`).join('') || '<p class="empty">Tudo em dia.</p>'}</div>
      <div class="rb-section"><div class="rb-title">${ic('cal')}Próximos 30 dias</div>${ev.map(e => `<div class="rb-item ${e.c}" data-go="calendario" data-vid="${e.vid}"><div style="min-width:0"><b style="white-space:normal">${e.plate} · ${esc(e.label)}</b><small>${e.kind === 'rent' ? 'Locação' : 'Manutenção'}</small></div><b>${e.date <= startOfDay(nowTs()) ? 'hoje' : fmtDate(e.date).slice(0, 5)}</b></div>`).join('') || '<p class="empty">Nada agendado.</p>'}</div>
      <div class="rb-section"><div class="rb-title">${ic('report')}Custos de ${new Date().toLocaleDateString('pt-BR', { month: 'long' })}</div>
        <div class="rb-item" data-go="relatorios"><span>Total da frota</span><b>${money(tot)}</b></div>
        <div class="rb-item" data-go="abastecimento"><span>Combustível</span><b>${money(sum(rows.filter(r => r.kind === 'Combustível'), r => r.value))}</b></div>
        <div class="rb-item" data-go="relatorios"><span>Custo por km</span><b>${money(tot / kms)}</b></div></div>`;
  }
};

/* ===================== Veículos ===================== */
const VFILTERS = {
  '': ['Todos', () => true], em_uso: ['Em uso', v => !!activeCustody(v.id)], disponivel: ['Disponíveis', v => vStatus(v) === 'disponivel'],
  manutencao: ['Manutenção', v => v.maintenance || vehicleMaint(v.id).worst === 'vencido'], alerta: ['Com alerta', v => openIssues(v.id).length > 0 || needsDaily(v) || !!(activeCustody(v.id) && !activeCustody(v.id).segments.length)],
  propria: ['Próprios', v => v.ownership !== 'locada'], locada: ['Locados', v => v.ownership === 'locada']
};
let VSEARCH = '';
function vehicleCard(v) {
  const st = vStatus(v); const c = activeCustody(v.id); const seg = currentSegment(c); const mt = vehicleMaint(v.id); const rs = rentalState(v);
  const nx = mt.next; const pct = nx ? Math.max(0, Math.min(100, 100 - nx.s.remKm / nx.p.everyKm * 100)) : 0;
  return `<div class="vcard" data-go="veiculo" data-id="${v.id}">
    <div class="h"><div>${plate(v.plate)}<div class="model">${esc(v.brand)} ${esc(v.model)} · ${v.year}</div></div><span class="pill ${V_STATUS[st].c === 'gray' ? '' : V_STATUS[st].c === 'neu' ? 'blue' : V_STATUS[st].c}">${V_STATUS[st].l}</span></div>
    <div class="person">${c ? `<span class="avatar">${initials(drv(c.driverId).name)}</span><div style="min-width:0"><b>${esc(drv(c.driverId).name)}</b><small>${seg ? esc(prj(seg.projectId).code) : '<span style="color:var(--orange)">Sem obra</span>'}</small></div>` : `<span class="avatar" style="background:var(--border2);color:var(--text3)">—</span><div><b class="muted">Sem condutor</b><small>${v.maintenance ? 'Na oficina' : 'No pátio'}</small></div>`}</div>
    ${nx ? `<div><div class="row small" style="justify-content:space-between;margin-bottom:5px"><span class="muted">${esc(nx.p.item)}</span><b class="num" style="color:${nx.s.lvl === 'normal' ? 'var(--text2)' : `var(--${{ atencao: 'yellow', urgente: 'orange', vencido: 'red' }[nx.s.lvl]})`}">${nx.s.remKm > 0 ? `${nf(nx.s.remKm)} km` : 'vencida'}</b></div><div class="bar ${M_LEVEL[nx.s.lvl].c}"><i style="width:${pct}%"></i></div></div>` : ''}
    <div class="foot"><span class="tags">${ownTag(v)}${seatsTag(v)}${docBadge(v)}</span><span class="num">${km(v.odometer)}</span></div>
    ${rs ? `<div class="note ${rs.lvl === 'normal' ? '' : M_LEVEL[rs.lvl].c}" style="padding:7px 10px;font-size:.78rem">${ic('key')}<div>${rs.days < 0 ? `Devolução vencida há ${-rs.days} dias` : `Devolver ou renovar até ${fmtDate(v.rental.dueDate)}`}</div></div>` : ''}
  </div>`;
}
PAGES.veiculos = {
  title: 'Veículos',
  render({ f = '' }) {
    const list = S.vehicles.filter(v => v.active).filter(VFILTERS[f]?.[1] || (() => true)).filter(v => !VSEARCH || (v.plate + v.model + v.brand).toLowerCase().includes(VSEARCH.toLowerCase()));
    return `<div class="page-head"><div class="filters">${Object.entries(VFILTERS).map(([k, [l, fn]]) => `<button class="chip ${f === k ? 'on' : ''}" data-go="veiculos" data-f="${k}">${l}<span class="n">${S.vehicles.filter(v => v.active).filter(fn).length}</span></button>`).join('')}</div>
      <div class="row"><input class="inp" id="v-search" placeholder="Buscar placa ou modelo" value="${esc(VSEARCH)}" style="width:210px;min-height:36px" aria-label="Buscar veículo">${isManager() ? `<button class="btn pri" data-act="veh-new">${ic('plus')}Cadastrar</button>` : ''}</div></div>
      <div class="cards" id="v-cards">${list.map(vehicleCard).join('') || empty('Nenhum veículo neste filtro.')}</div>`;
  },
  mount({ f = '' }) {
    $('#v-search')?.addEventListener('input', e => { VSEARCH = e.target.value; const list = S.vehicles.filter(v => v.active).filter(VFILTERS[f]?.[1] || (() => true)).filter(v => !VSEARCH || (v.plate + v.model + v.brand).toLowerCase().includes(VSEARCH.toLowerCase())); $('#v-cards').innerHTML = list.map(vehicleCard).join('') || empty('Nenhum veículo encontrado.'); });
  }
};
const dateInput = t => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseDate = s => s ? new Date(s + 'T00:00').getTime() : null;
function vehicleForm(v = {}) {
  const r = v.rental || {}; const loc = v.ownership === 'locada';
  return `<form id="vform" class="stack" style="gap:16px">
    <div class="form-grid three">
      <label class="field"><span>Placa</span><input class="inp" name="plate" required maxlength="8" placeholder="ABC1D23" value="${esc(v.plate || '')}" ${v.id ? 'readonly' : ''} style="text-transform:uppercase;font-weight:700;letter-spacing:.06em"></label>
      <label class="field"><span>Marca</span><input class="inp" name="brand" value="${esc(v.brand || '')}"></label>
      <label class="field"><span>Modelo</span><input class="inp" name="model" value="${esc(v.model || '')}"></label>
      <label class="field"><span>Ano</span><input class="inp num" name="year" inputmode="numeric" value="${v.year || ''}"></label>
      <label class="field"><span>Combustível</span><select class="inp" name="fuelType">${['Gasolina', 'Etanol', 'Flex', 'Diesel S10'].map(x => `<option ${v.fuelType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span>Ocupantes (lugares)</span><input class="inp num" name="seats" type="number" min="1" max="20" value="${v.seats || 5}"></label>
      <label class="field"><span>Quilometragem atual</span><input class="inp num" name="odometer" inputmode="numeric" value="${v.odometer ?? ''}"></label>
      <label class="field"><span>Consumo de referência (km/l)</span><input class="inp num" name="avgKmL" inputmode="decimal" value="${v.avgKmL ? nf(v.avgKmL, 1) : '10'}"></label>
      <label class="field"><span>Rastreador</span><select class="inp" name="tracker"><option value="1" ${v.tracker !== false ? 'selected' : ''}>Instalado</option><option value="0" ${v.tracker === false ? 'selected' : ''}>Não</option></select></label>
    </div>
    <div class="field"><span>Tipo de frota</span><div class="seg"><label><input type="radio" name="ownership" value="propria" ${!loc ? 'checked' : ''}><span>Frota própria</span></label><label><input type="radio" name="ownership" value="locada" ${loc ? 'checked' : ''}><span>${ic('key')} Locada</span></label></div></div>
    <div id="rent-box" class="panel" style="box-shadow:none;background:var(--surface2)" ${loc ? '' : 'hidden'}><div class="panel-b form-grid" style="padding-top:14px">
      <label class="field"><span>Locadora</span><input class="inp" name="company" value="${esc(r.company || '')}"></label>
      <label class="field"><span>Nº do contrato</span><input class="inp" name="contract" value="${esc(r.contract || '')}"></label>
      <label class="field"><span>Data de retirada</span><input class="inp" type="date" name="pickupDate" value="${dateInput(r.pickupDate)}"></label>
      <label class="field"><span>Prazo para devolução ou renovação</span><input class="inp" type="date" name="dueDate" value="${dateInput(r.dueDate)}"></label>
      <label class="field"><span>Valor mensal (R$)</span><input class="inp num" name="monthly" inputmode="decimal" value="${r.monthly ? nf(r.monthly, 2) : ''}"></label>
    </div></div>
    <p class="err" id="vf-err"></p></form>`;
}
function openVehicleForm(v) {
  openModal({
    title: v ? `Editar ${v.plate}` : 'Cadastrar veículo', wide: true, body: vehicleForm(v || {}),
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="veh-save" ${v ? `data-id="${v.id}"` : ''}>${v ? 'Salvar' : 'Salvar e gerar QR Code'}</button>`,
    onMount: el => el.querySelectorAll('input[name=ownership]').forEach(r => r.addEventListener('change', () => { el.querySelector('#rent-box').hidden = r.value !== 'locada' || !r.checked; }))
  });
}
ACTIONS['veh-new'] = () => openVehicleForm(null);
ACTIONS['veh-edit'] = a => openVehicleForm(veh(a.dataset.id));
ACTIONS['veh-save'] = a => {
  const d = formData($('#vform')); const p = d.plate.toUpperCase().replace(/[^A-Z0-9]/g, ''); const err = t => $('#vf-err').textContent = t;
  const edit = a.dataset.id ? veh(a.dataset.id) : null;
  if (!edit) { if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) return err('Placa inválida. Use o padrão ABC1D23 ou ABC1234.'); if (vehicleByPlate(p)) return err('Já existe um veículo com esta placa.'); }
  if (!d.brand || !d.model || !d.year || !d.odometer) return err('Preencha marca, modelo, ano e quilometragem.');
  const numv = x => parseFloat(String(x || '').replace(/\./g, '').replace(',', '.'));
  let rental = null;
  if (d.ownership === 'locada') {
    if (!d.company || !d.pickupDate || !d.dueDate) return err('Para veículo locado, informe locadora, data de retirada e prazo de devolução.');
    if (parseDate(d.dueDate) <= parseDate(d.pickupDate)) return err('O prazo de devolução deve ser depois da retirada.');
    rental = { ...(edit?.rental || { history: [] }), company: d.company, contract: d.contract, pickupDate: parseDate(d.pickupDate), dueDate: parseDate(d.dueDate), monthly: numv(d.monthly) || 0, status: 'ativa' };
  }
  const fields = { brand: d.brand, model: d.model, year: +d.year, fuelType: d.fuelType, seats: +d.seats || null, avgKmL: numv(d.avgKmL) || 10, odometer: Math.max(+String(d.odometer).replace(/\D/g, ''), edit?.odometer || 0), tracker: d.tracker === '1', ownership: d.ownership, rental };
  if (edit) { Object.assign(edit, fields); log('cadastro', `Cadastro do veículo atualizado por ${CUR.name}`, { vehicleId: edit.id }); save(); closeModal(); toast('Veículo atualizado.'); return render(); }
  const id = uid('veh');
  S.vehicles.push({ id, plate: p, ...fields, maintenance: false, active: true });
  S.qrcodes.push({ id: uid('qr'), vehicleId: id, token: newToken(), active: true, createdAt: nowTs() });
  [['Troca de óleo', 10000, 180], ['Filtros', 10000, 180], ['Alinhamento', 10000, null], ['Balanceamento', 10000, null], ['Revisão', 15000, 365]].forEach(([it, k, dd]) => S.plans.push({ id: uid('mp'), vehicleId: id, item: it, everyKm: k, everyDays: dd, lastKm: fields.odometer, lastDate: startOfDay(nowTs()) }));
  log('cadastro', `Veículo ${p} cadastrado (${d.ownership === 'locada' ? 'locado' : 'frota própria'}) e QR Code gerado`, { vehicleId: id });
  save(); closeModal(); go('veiculo', { id });
};
const newToken = () => { const a = new Uint32Array(16); crypto.getRandomValues(a); return 'VLK1-' + [...a].map(n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(''); };

/* ---------- locação: renovar / devolver ---------- */
ACTIONS['rent-renew'] = a => {
  const v = veh(a.dataset.id);
  openModal({
    title: `Renovar locação · ${v.plate}`, body: `<div class="pairs"><div><dt>Prazo atual</dt><dd>${fmtDate(v.rental.dueDate)}</dd></div><div><dt>Locadora</dt><dd>${esc(v.rental.company)}</dd></div></div>
      <div class="form-grid"><label class="field"><span>Novo prazo</span><input class="inp" type="date" id="rn-date" value="${dateInput(v.rental.dueDate + 180 * DAY)}"></label><label class="field"><span>Valor mensal (R$)</span><input class="inp num" id="rn-val" value="${nf(v.rental.monthly, 2)}"></label><label class="field full"><span>Nº do aditivo / contrato</span><input class="inp" id="rn-ct" value="${esc(v.rental.contract || '')}"></label></div><p class="err" id="rn-err"></p>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="rent-renew-ok" data-id="${v.id}">Renovar</button>`
  });
};
ACTIONS['rent-renew-ok'] = a => {
  const v = veh(a.dataset.id); const nd = parseDate($('#rn-date').value);
  if (!nd || nd <= v.rental.dueDate) return $('#rn-err').textContent = 'O novo prazo deve ser depois do prazo atual.';
  v.rental.history.push({ at: nowTs(), from: v.rental.dueDate, to: nd, by: CUR.id });
  v.rental.dueDate = nd; v.rental.monthly = parseFloat($('#rn-val').value.replace(/\./g, '').replace(',', '.')) || v.rental.monthly; v.rental.contract = $('#rn-ct').value;
  log('locacao', `Locação renovada até ${fmtDate(nd)} (${v.rental.company})`, { vehicleId: v.id }); save(); closeModal(); toast('Locação renovada.'); render();
};
ACTIONS['rent-return'] = a => {
  const v = veh(a.dataset.id); const c = activeCustody(v.id);
  if (c) return toast(`O veículo está com ${drv(c.driverId).name}. Faça a entrega antes da devolução à locadora.`);
  openModal({
    title: `Devolver à locadora · ${v.plate}`, body: `<p>O veículo sai da frota ativa e o histórico continua disponível.</p><label class="field"><span>Quilometragem na devolução</span><input class="inp num" id="rt-km" value="${v.odometer}"></label>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn danger" data-act="rent-return-ok" data-id="${v.id}">Registrar devolução</button>`
  });
};
ACTIONS['rent-return-ok'] = a => {
  const v = veh(a.dataset.id); v.rental.status = 'devolvida'; v.rental.returnedAt = nowTs(); v.odometer = Math.max(v.odometer, +$('#rt-km').value.replace(/\D/g, '') || 0); v.active = false;
  log('locacao', `Veículo devolvido à ${v.rental.company}`, { vehicleId: v.id }); save(); closeModal(); toast('Devolução registrada.'); go('veiculos');
};

/* ---------- Detalhes do veículo ---------- */
function qrSvg(text) {
  if (!window.qrcode) return `<div class="small" style="width:132px;word-break:break-all">${esc(text)}</div>`;
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function timelineHTML(entries) {
  if (!entries.length) return empty('Sem eventos.');
  let day = null; const dotC = { posse_inicio: 'ok', posse_fim: 'gray', problema: 'bad', transferencia: 'warn', transferencia_forcada: 'urg', manutencao: 'urg', problema_resolvido: 'ok', locacao: 'warn' };
  return `<ul class="tl">${entries.map(a => {
    const d = fmtDate(a.at); const head = d !== day ? `<li class="day">${isToday(a.at) ? 'Hoje' : d}</li>` : ''; day = d;
    const who = a.userId && a.userId !== 'sistema' && !a.userId.startsWith('u_d') ? ` · ${esc(userName(a.userId))}` : '';
    const vv = a.vehicleId ? veh(a.vehicleId) : null;
    return `${head}<li class="${dotC[a.type] ?? ''}"><span class="t">${fmtTime(a.at)}</span><div class="x">${esc(a.text)}<small>${vv && ROUTE.page !== 'veiculo' ? vv.plate + ' · ' : ''}${a.driverId && drv(a.driverId) ? esc(drv(a.driverId).name) : ''}${who}</small></div></li>`;
  }).join('')}</ul>`;
}
PAGES.veiculo = {
  title: p => veh(p.id)?.plate || 'Veículo',
  render({ id, tab = 'tl' }) {
    const v = veh(id); if (!v) return empty('Veículo não encontrado.');
    const c = activeCustody(id); const seg = currentSegment(c); const t = activeTransfer(id); const mt = vehicleMaint(id); const loc = lastLocation(id); const rs = rentalState(v);
    const qr = S.qrcodes.find(q => q.vehicleId === id && q.active); const iss = openIssues(id); const dly = dailyDoneToday(id); const M = isManager(); const st = vStatus(v);
    const tabs = [['tl', 'Linha do tempo'], ['posses', 'Posses'], ['ck', 'Checklists'], ['fuel', 'Abastecimentos'], ['mnt', 'Plano de manutenção'], ['docs', 'Documentos'], ['tf', 'Pedágios e multas']];
    let body = '';
    if (tab === 'tl') { const all = S.audit.filter(a => a.vehicleId === id).sort((a, b) => b.at - a.at); const n = +(ROUTE.p.n || 25); body = `<div class="panel-b" style="padding-top:12px">${timelineHTML(all.slice(0, n))}${all.length > n ? `<button class="btn sm" data-go="veiculo" data-id="${id}" data-n="${n + 50}">Mostrar mais (${all.length - n})</button>` : ''}</div>`; }
    if (tab === 'posses') body = tbl(['Condutor', 'Início', 'Fim', 'Duração', '>Km rodados', 'Obras'], S.custody.filter(x => x.vehicleId === id).sort((a, b) => b.start - a.start).map(x => `<tr><td>${drvLink(x.driverId)}</td><td class="nowrap">${fmtDT(x.start)}</td><td class="nowrap">${x.end ? fmtDT(x.end) : pill('Posse ativa', 'ok')}</td><td class="nowrap">${dur((x.end || nowTs()) - x.start)}</td><td class="r">${nf((x.endKm || v.odometer) - x.startKm)}</td><td>${[...new Set(x.segments.map(s => prj(s.projectId).code))].join(', ') || pill('Sem obra', 'urg')}</td></tr>`));
    if (tab === 'ck') body = checklistTable(S.checklists.filter(k => k.vehicleId === id));
    if (tab === 'fuel') body = fuelTable(S.fuel.filter(f => f.vehicleId === id));
    if (tab === 'mnt') body = planEditor(v);
    if (tab === 'docs') body = docsTab(v);
    if (tab === 'tf') body = `<div class="panel-h"><h3>Pedágios</h3></div>${tollTable(S.tolls.filter(x => x.plate === v.plate))}<div class="panel-h"><h3>Multas</h3></div>${fineTable(S.fines.filter(x => x.plate === v.plate))}`;
    return `<div class="stack">
      <div class="panel"><div class="panel-b row" style="padding:16px 18px;justify-content:space-between;gap:16px">
        <div class="row" style="gap:16px">${plate(v.plate, true)}<div><h2 style="font-size:1.15rem">${esc(v.brand)} ${esc(v.model)}</h2><div class="row" style="gap:8px;margin-top:6px">${stTag(st)}${ownTag(v)}${seatsTag(v)}${docBadge(v) ? `<button style="border:none;background:none;padding:0" data-go="veiculo" data-id="${id}" data-tab="docs">${docBadge(v)}</button>` : ''}<span class="muted small">${v.year} · ${v.fuelType}</span></div></div></div>
        <div class="row">${M ? `<button class="btn" data-act="veh-edit" data-id="${id}">${ic('edit')}Editar</button>` : ''}${M && c ? `<button class="btn" data-go="forcar" data-vid="${id}">${ic('swap')}Transferir</button>` : ''}${M && !v.maintenance && !c ? `<button class="btn" data-go="checklist_full" data-vid="${id}" data-type="manut_entrada">${ic('wrench')}Enviar p/ manutenção</button>` : ''}${M && v.maintenance ? `<button class="btn pri" data-go="checklist_full" data-vid="${id}" data-type="manut_saida">${ic('wrench')}Saída de manutenção</button>` : ''}</div>
      </div></div>
      ${iss.map(i => `<div class="note ${i.severity === 'critica' || !i.canRun ? 'bad' : 'warn'}">${ic('alert')}<div style="flex:1"><b>${esc(i.type)} · ${SEVERITY[i.severity].l}</b> — ${esc(i.desc)}<div class="small">${esc(drv(i.driverId)?.name || '')} · ${fmtShort(i.at)}</div></div>${M ? `<button class="btn sm" data-act="iss-resolve" data-id="${i.id}">Resolver</button>` : ''}</div>`).join('')}
      ${t ? `<div class="note warn">${ic('swap')}<div style="flex:1"><b>Transferência:</b> ${esc(drv(t.fromDriverId).name)} → ${esc(drv(t.toDriverId).name)} · ${T_LABEL[t.status]}</div><button class="btn sm" data-go="transferencia" data-id="${t.id}">Abrir</button></div>` : ''}
      <div class="kpis">
        ${kpi('Quilometragem', nf(v.odometer), 'gauge', '', '', 'km')}
        ${kpi('Consumo médio', nf(vehicleAvgKmL(id), 1), 'fuel', '', `data-go="veiculo" data-id="${id}" data-tab="fuel"`, 'km/l')}
        ${mt.next ? kpi(mt.next.p.item, mt.next.s.remKm > 0 ? nf(mt.next.s.remKm) : 'Vencida', 'wrench', { normal: '', atencao: 'c-yellow', urgente: 'c-orange', vencido: 'c-red' }[mt.next.s.lvl], `data-go="veiculo" data-id="${id}" data-tab="mnt"`, mt.next.s.remKm > 0 ? 'km restantes' : `há ${nf(-mt.next.s.remKm)} km`) : ''}
        ${rs ? kpi('Locação', rs.days < 0 ? `${-rs.days}d` : `${rs.days}d`, 'key', { normal: '', atencao: 'c-yellow', urgente: 'c-orange', vencido: 'c-red' }[rs.lvl], '', rs.days < 0 ? 'devolução vencida' : `até ${fmtDate(v.rental.dueDate)}`) : kpi('Uso médio', nf(avgDailyKm(id)), 'road', '', '', 'km por dia')}
      </div>
      <div class="grid3">
        <div class="panel"><div class="panel-h"><h3>Posse atual</h3>${c ? pill('Ativa', 'ok') : ''}</div><div class="panel-b">${c ? `<div class="person" style="margin-bottom:12px"><span class="avatar lg">${initials(drv(c.driverId).name)}</span><div><b>${drvLink(c.driverId)}</b><small>desde ${fmtDT(c.start)}</small></div></div>
          <dl class="pairs"><div><dt>Obra</dt><dd>${seg ? esc(prj(seg.projectId).code) : '<span style="color:var(--orange)">Sem obra</span>'}</dd></div><div><dt>Centro de custo</dt><dd>${seg ? ccOf(seg.ccId).code : '—'}</dd></div><div><dt>Km inicial</dt><dd class="num">${nf(c.startKm)}</dd></div><div><dt>Checklist hoje</dt><dd>${dly ? `<span class="st"><span class="dot ok"></span>${fmtTime(dly.at)}</span>` : '<span class="st"><span class="dot warn"></span>Pendente</span>'}</dd></div></dl>`
          : `<div class="empty" style="padding:20px">${v.maintenance ? `Em manutenção desde ${fmtDate(v.maintenanceSince)}<br><small>${esc(v.maintenanceNote || '')}</small>` : 'Sem condutor · no pátio'}</div>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>Localização</h3><span class="muted small" id="route-info">${loc ? `${esc(loc.what)} · ${fmtShort(loc.at)}` : ''}</span></div><div class="panel-b">${loc ? '<div class="fleet-map sm" id="veh-map"></div>' : empty('Sem localização registrada.')}</div></div>
        ${v.ownership === 'locada' && v.rental ? `<div class="panel"><div class="panel-h"><h3>Contrato de locação</h3>${rs ? `<span class="pill ${M_LEVEL[rs.lvl].c === 'gray' ? 'ok' : M_LEVEL[rs.lvl].c}">${rs.days < 0 ? 'Vencida' : rs.days + ' dias'}</span>` : pill('Devolvida')}</div><div class="panel-b stack" style="gap:10px">
          <dl class="pairs"><div><dt>Locadora</dt><dd>${esc(v.rental.company)}</dd></div><div><dt>Contrato</dt><dd>${esc(v.rental.contract || '—')}</dd></div><div><dt>Retirada</dt><dd>${fmtDate(v.rental.pickupDate)}</dd></div><div><dt>Devolver/renovar</dt><dd>${fmtDate(v.rental.dueDate)}</dd></div></dl>
          ${rs ? `<div class="bar ${M_LEVEL[rs.lvl].c === 'gray' ? '' : M_LEVEL[rs.lvl].c}"><i style="width:${Math.min(100, Math.max(3, (nowTs() - v.rental.pickupDate) / (v.rental.dueDate - v.rental.pickupDate) * 100))}%"></i></div>` : ''}
          ${M && rs ? `<div class="row"><button class="btn sm pri" data-act="rent-renew" data-id="${id}">Renovar</button><button class="btn sm" data-act="rent-return" data-id="${id}">Devolver</button></div>` : ''}</div></div>`
          : `<div class="panel"><div class="panel-h"><h3>QR Code</h3></div><div class="panel-b row" style="align-items:flex-start;gap:14px"><div class="qr-img">${qrSvg(qr.token)}</div><div class="stack" style="gap:8px;flex:1;min-width:120px"><span class="tiny muted" style="word-break:break-all">${qr.token}</span>${M ? `<button class="btn sm" data-act="qr-new" data-id="${id}">Gerar novo</button>` : ''}</div></div></div>`}
      </div>
      ${v.ownership === 'locada' ? `<div class="panel"><div class="panel-h"><h3>QR Code</h3></div><div class="panel-b row" style="gap:14px"><div class="qr-img">${qrSvg(qr.token)}</div><span class="tiny muted" style="word-break:break-all;max-width:240px">${qr.token}</span>${M ? `<button class="btn sm" data-act="qr-new" data-id="${id}">Gerar novo</button>` : ''}</div></div>` : ''}
      <div class="panel"><div class="panel-h"><div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-go="veiculo" data-id="${id}" data-tab="${k}">${l}</button>`).join('')}</div></div>${body}</div>
    </div>`;
  },
  mount({ id }) { const el = $('#veh-map'); if (el) { const m = buildMap(el, [veh(id)], { projects: true, fitVehiclesOnly: true, zoom: 13 }); if (veh(id).traccarId && S.settings.traccar.mode !== 'off') drawTodayRoute(m, id); } PAGES.veiculo._mountPlan?.(id); }
};
ACTIONS['iss-resolve'] = a => {
  const i = byId(S.issues, a.dataset.id);
  openModal({
    title: 'Resolver ocorrência', body: `<p><b>${esc(i.type)}</b> — ${esc(i.desc)}</p><label class="field"><span>O que foi feito?</span><textarea class="inp" id="iss-note" placeholder="Ex.: pastilhas trocadas na Oficina Alvorada"></textarea></label><p class="err" id="iss-err"></p>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="iss-resolve-ok" data-id="${i.id}">Confirmar</button>`
  });
};
ACTIONS['iss-resolve-ok'] = a => {
  const i = byId(S.issues, a.dataset.id); const note = $('#iss-note').value.trim();
  if (note.length < 5) return $('#iss-err').textContent = 'Descreva a solução.';
  i.status = 'resolvida'; i.resolvedAt = nowTs(); i.resolvedBy = CUR.id; i.resolution = note;
  log('problema_resolvido', `Ocorrência resolvida (${i.type}): ${note}`, { vehicleId: i.vehicleId, driverId: i.driverId });
  save(); closeModal(); toast('Ocorrência resolvida. Veículo liberado.'); render();
};
ACTIONS['qr-new'] = a => {
  const id = a.dataset.id;
  S.qrcodes.filter(q => q.vehicleId === id && q.active).forEach(q => { q.active = false; q.revokedAt = nowTs(); });
  S.qrcodes.push({ id: uid('qr'), vehicleId: id, token: newToken(), active: true, createdAt: nowTs() });
  log('qr', 'Novo QR Code gerado. O código anterior foi revogado', { vehicleId: id }); save(); toast('Novo QR Code gerado.'); render();
};

/* ---------- Transferência forçada ---------- */
PAGES.forcar = {
  title: 'Transferência forçada',
  render({ vid }) {
    if (!isManager()) return '<div class="note bad">Exclusivo para gestores.</div>';
    const v = veh(vid); const c = activeCustody(vid);
    if (!c) return `<div class="note">O veículo ${plate(v.plate)} não possui posse ativa.</div>`;
    return `<form class="stack" id="fform" style="max-width:720px">
        <div class="panel"><div class="panel-b row" style="padding-top:16px;gap:14px">${plate(v.plate, true)}<div class="person"><span class="avatar lg">${initials(drv(c.driverId).name)}</span><div><b>${esc(drv(c.driverId).name)}</b><small>desde ${fmtDT(c.start)} · ${projLabel(currentSegment(c)?.projectId)}</small></div></div></div></div>
        <div class="note warn">${ic('alert')}<div>Ação administrativa: fica registrada com seu nome e a justificativa.</div></div>
        <div class="panel"><div class="panel-b form-grid" style="padding-top:16px">
          <label class="field"><span>Novo condutor</span><select class="inp" name="to"><option value="">Nenhum — devolver ao pátio</option>${driverOptions('', d => d.id !== c.driverId && driverActive(d))}</select><small>Ele fará o checklist de recebimento para assumir.</small></label>
          <label class="field"><span>Quilometragem</span><input class="inp num" name="km" inputmode="numeric" value="${suggestedKm(v)}"></label>
          <label class="field full"><span>Justificativa</span><textarea class="inp" name="just" placeholder="Por que a entrega não foi feita pelo condutor?"></textarea></label>
        </div></div>
        <div class="note bad" id="ck-err" hidden></div>
        <div class="row"><button type="button" class="btn" data-go="veiculo" data-id="${vid}">Cancelar</button><button class="btn ok">Confirmar transferência</button></div>
      </form>`;
  },
  mount({ vid }) {
    const f = $('#fform'); if (!f) return;
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f); const v = veh(vid); const c = activeCustody(vid);
      const k = parseInt(d.km.replace(/\D/g, ''), 10); const errs = [];
      if (d.just.length < 15) errs.push('Escreva uma justificativa com pelo menos 15 caracteres.');
      if (!k || k < c.startKm) errs.push('Quilometragem inválida.');
      if (d.to && S.settings.oneVehiclePerDriver && driverCustodies(d.to).length) errs.push(`${drv(d.to).name} já está com outro veículo.`);
      if (errs.length) return showErrors(errs);
      const old = activeTransfer(vid); if (old) setTransfer(old, 'cancelada', 'Substituída por transferência forçada');
      c.end = nowTs(); c.endKm = k; c.closedReason = 'forcada'; v.odometer = Math.max(v.odometer, k);
      log('transferencia_forcada', `Transferência forçada por ${CUR.name}: posse de ${drv(c.driverId).name} encerrada${d.to ? `, liberada para ${drv(d.to).name}` : ''}. Justificativa: ${d.just}`, { vehicleId: vid, driverId: c.driverId });
      notify(c.driverId, `Sua posse do ${v.plate} foi encerrada pela gestão (${CUR.name}).`, { level: 'warn' });
      if (d.to) {
        const t = { id: uid('trf'), vehicleId: vid, fromDriverId: c.driverId, toDriverId: d.to, status: 'aguardando_recebimento', requestedAt: nowTs(), forced: true, justification: d.just, requestedBy: CUR.id, fromCustodyId: c.id, toCustodyId: null, deliverChecklistId: null, receiveChecklistId: null, events: [{ at: nowTs(), status: 'aguardando_recebimento', by: CUR.id, note: `Transferência forçada: ${d.just}` }] };
        S.transfers.push(t); c.transferId = t.id;
        notify(d.to, `A gestão liberou o ${v.plate} para você. Faça o checklist de recebimento.`, { level: 'ok', link: { page: 'inicio' } });
      }
      save(); toast('Transferência forçada registrada.'); go('veiculo', { id: vid });
    });
  }
};

/* ---------- Transferências ---------- */
PAGES.transferencias = {
  title: 'Transferências',
  render({ f = 'abertas' }) {
    const flt = t => f === 'todas' || (f === 'abertas' ? !['concluida', 'cancelada'].includes(t.status) : t.status === 'concluida');
    const list = S.transfers.filter(flt).sort((a, b) => b.requestedAt - a.requestedAt);
    const late = t => !['concluida', 'cancelada'].includes(t.status) && nowTs() - t.requestedAt > S.settings.transferAlertHours * 36e5;
    const order = T_STATUS.map(s => s[0]);
    const rows = list.map(t => { const i = order.indexOf(t.status); return `<tr class="click" data-go="transferencia" data-id="${t.id}"><td>${plate(veh(t.vehicleId).plate)}</td><td><div class="person"><span class="avatar">${initials(drv(t.fromDriverId)?.name || '—')}</span>${esc(drv(t.fromDriverId)?.name || '—')}</div></td><td>→</td><td><div class="person"><span class="avatar">${initials(drv(t.toDriverId)?.name || 'P')}</span>${esc(drv(t.toDriverId)?.name || 'Pátio')}</div></td>
      <td style="min-width:150px"><div class="row" style="gap:6px;flex-wrap:nowrap">${pill(T_LABEL[t.status], t.status === 'concluida' ? 'ok' : t.status === 'cancelada' ? '' : late(t) ? 'urg' : 'warn')}${t.forced ? pill('forçada') : ''}</div>${t.status !== 'cancelada' ? `<div class="bar ${t.status === 'concluida' ? 'ok' : 'blue'}" style="margin-top:6px"><i style="width:${(i / (order.length - 1)) * 100}%"></i></div>` : ''}</td><td class="nowrap small muted">${fmtShort(t.requestedAt)}</td></tr>`; });
    const n = s => S.transfers.filter(t => s === 'todas' || (s === 'abertas' ? !['concluida', 'cancelada'].includes(t.status) : t.status === 'concluida')).length;
    return `<div class="page-head"><div class="filters">${[['abertas', 'Em andamento'], ['concluidas', 'Concluídas'], ['todas', 'Todas']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-go="transferencias" data-f="${k}">${l}<span class="n">${n(k)}</span></button>`).join('')}</div>${isManager() ? `<button class="btn" data-act="force-pick">${ic('swap')}Transferência forçada</button>` : ''}</div>
      <div class="panel">${tbl(['Veículo', 'De', '', 'Para', 'Situação', 'Solicitada'], rows, 'Nenhuma transferência neste filtro.')}</div>`;
  }
};
ACTIONS['force-pick'] = () => openModal({
  title: 'Transferência forçada', body: `<label class="field"><span>Veículo em uso</span><select class="inp" id="fp-v">${S.vehicles.filter(v => activeCustody(v.id)).map(v => `<option value="${v.id}">${v.plate} — ${esc(drv(activeCustody(v.id).driverId).name)}</option>`).join('')}</select></label>`,
  foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn pri" data-act="force-go">Continuar</button>'
});
ACTIONS['force-go'] = () => { const vid = $('#fp-v').value; closeModal(); go('forcar', { vid }); };

/* ---------- Checklists ---------- */
function checklistTable(list) {
  return tbl(['Data', 'Tipo', 'Veículo', 'Condutor', '>Km', 'Resultado', 'Fotos'], list.sort((a, b) => b.at - a.at).slice(0, 150).map(k => {
    const nph = k.photos ? Object.values(k.photos).filter(Boolean).length : 0;
    return `<tr class="click" data-act="ck-view" data-id="${k.id}"><td class="nowrap">${fmtShort(k.at)}${k.late ? ' ' + pill('atraso', 'warn') : ''}</td><td>${CK_TYPES[k.type]}</td><td>${plate(veh(k.vehicleId).plate)}</td><td>${k.driverId ? esc(drv(k.driverId).name) : '<span class="muted">Gestão</span>'}</td><td class="r">${nf(k.km)}</td><td>${k.ok === false ? pill(k.problem ? 'Problema' : 'Apontamentos', k.problem ? 'bad' : 'warn') : pill('Regular', 'ok')}</td><td class="num">${nph || '—'}</td></tr>`;
  }), 'Nenhum checklist.');
}
PAGES.checklists = {
  title: 'Checklists',
  render({ t = '' }) {
    const list = S.checklists.filter(k => !t || k.type === t);
    const today = S.checklists.filter(k => isToday(k.at));
    return `<div class="stack"><div class="kpis">${kpi('Hoje', today.length, 'check', 'c-blue')}${kpi('Sem checklist hoje', S.vehicles.filter(needsDaily).length, 'alert', S.vehicles.filter(needsDaily).length ? 'c-yellow' : '')}${kpi('Com problema hoje', today.filter(k => k.ok === false).length, 'alert', today.filter(k => k.ok === false).length ? 'c-red' : '')}${kpi('Prazo do diário', S.settings.dailyDeadline, 'cal')}</div>
      <div class="filters"><button class="chip ${!t ? 'on' : ''}" data-go="checklists">Todos</button>${Object.entries(CK_TYPES).map(([k, l]) => `<button class="chip ${t === k ? 'on' : ''}" data-go="checklists" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="panel">${checklistTable(list)}</div></div>`;
  }
};

/* ---------- Condutores ---------- */
const driverActive = d => d.active !== false;
PAGES.condutores = {
  title: 'Condutores',
  render({ f = 'ativos' }) {
    const flt = { ativos: driverActive, inativos: d => !driverActive(d), todos: () => true };
    const list = S.drivers.filter(flt[f] || flt.ativos).map(d => ({ d, c: driverCustodies(d.id)[0], sc: driverScore(d.id) })).sort((a, b) => (driverActive(b.d) ? 1 : 0) - (driverActive(a.d) ? 1 : 0) || (b.c ? 1 : 0) - (a.c ? 1 : 0) || b.sc.total - a.sc.total);
    const n = k => S.drivers.filter(flt[k]).length;
    return `<div class="page-head"><div class="filters">${[['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-go="condutores" data-f="${k}">${l}<span class="n">${n(k)}</span></button>`).join('')}</div>${isManager() ? `<button class="btn pri" data-act="drv-new">${ic('plus')}Cadastrar condutor</button>` : ''}</div>
      <div class="cards">${list.map(({ d, c, sc }) => {
      const v = c && veh(c.vehicleId); const seg = currentSegment(c); const cnhDays = Math.floor((d.cnhExp - nowTs()) / DAY); const on = driverActive(d);
      return `<div class="vcard" data-go="condutor" data-id="${d.id}" style="${on ? '' : 'opacity:.6'}"><div class="h"><div class="person"><span class="avatar lg" style="${on ? '' : 'background:var(--border2);color:var(--text3)'}">${initials(d.name)}</span><div><b>${esc(d.name)}</b><small>CNH ${d.cnhCat}${cnhDays < 0 ? ' · <span style="color:var(--red)">CNH vencida</span>' : cnhDays < 60 ? ` · <span style="color:var(--yellow)">vence em ${cnhDays} dias</span>` : ''}</small></div></div>${on ? ring(sc.total, true) : pill('Inativo')}</div>
        <div class="foot">${v ? `${plate(v.plate)}<span class="small">${seg ? esc(prj(seg.projectId).code) : '<span style="color:var(--orange)">Sem obra</span>'}</span>` : `<span class="muted">${on ? 'Sem veículo' : `Inativo desde ${fmtDate(d.inactiveAt)}`}</span><span></span>`}</div></div>`;
    }).join('') || empty('Nenhum condutor neste filtro.')}</div>`;
  }
};
function driverForm(d = {}) {
  const u = d.id ? S.users.find(x => x.driverId === d.id) : null;
  return `<form id="dform-cad" class="form-grid">
    <label class="field full"><span>Nome completo</span><input class="inp" name="name" value="${esc(d.name || '')}"></label>
    <label class="field"><span>Nº da CNH</span><input class="inp num" name="cnh" inputmode="numeric" maxlength="11" value="${esc(d.cnh || '')}"></label>
    <label class="field"><span>Categoria</span><select class="inp" name="cnhCat">${['A', 'B', 'AB', 'C', 'D', 'E'].map(c => `<option ${d.cnhCat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Validade da CNH</span><input class="inp" type="date" name="cnhExp" value="${dateInput(d.cnhExp)}"></label>
    <label class="field"><span>Telefone</span><input class="inp" name="phone" inputmode="tel" value="${esc(d.phone || '')}" placeholder="(19) 99999-9999"></label>
    <label class="field full"><span>E-mail de acesso ao aplicativo</span><input class="inp" name="email" type="email" value="${esc(u?.email || '')}" placeholder="nome.sobrenome@empresa.com.br"></label>
    <p class="err full" id="df-err"></p></form>`;
}
ACTIONS['drv-new'] = () => openModal({ title: 'Cadastrar condutor', body: driverForm(), foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="drv-save">Cadastrar</button>' });
ACTIONS['drv-edit'] = a => openModal({ title: 'Editar condutor', body: driverForm(drv(a.dataset.id)), foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="drv-save" data-id="${a.dataset.id}">Salvar</button>` });
ACTIONS['drv-save'] = a => {
  const d = formData($('#dform-cad')); const err = t => $('#df-err').textContent = t; const edit = a.dataset.id ? drv(a.dataset.id) : null;
  if (d.name.split(' ').filter(Boolean).length < 2) return err('Informe nome e sobrenome.');
  if (!/^\d{9,11}$/.test(d.cnh.replace(/\D/g, ''))) return err('Número da CNH inválido.');
  if (!d.cnhExp) return err('Informe a validade da CNH.');
  if (parseDate(d.cnhExp) < startOfDay(nowTs())) return err('A CNH está vencida. Cadastre com uma CNH válida.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return err('Informe um e-mail válido para o acesso ao aplicativo.');
  const other = S.users.find(u => u.email.toLowerCase() === d.email.toLowerCase() && u.driverId !== edit?.id);
  if (other) return err('Este e-mail já está em uso por outro usuário.');
  const fields = { name: d.name, cnh: d.cnh.replace(/\D/g, ''), cnhCat: d.cnhCat, cnhExp: parseDate(d.cnhExp), phone: d.phone };
  if (edit) {
    Object.assign(edit, fields); const u = S.users.find(x => x.driverId === edit.id); if (u) { u.name = d.name; u.email = d.email; }
    log('cadastro', `Cadastro do condutor ${edit.name} atualizado por ${CUR.name}`, { driverId: edit.id }); save(); closeModal(); toast('Condutor atualizado.');
    if (APP_MODE === 'cloud') cloudDriverAccess(edit, d.email, false).then(render);
    return render();
  }
  const id = uid('drv');
  S.drivers.push({ id, ...fields, active: true, telemetry: { avarias: 0, harsh: 0, speeding: 0 }, createdAt: nowTs() });
  if (APP_MODE !== 'cloud') S.users.push({ id: 'u_' + id, name: d.name, role: 'condutor', driverId: id, email: d.email, active: true });
  log('cadastro', `Condutor ${d.name} cadastrado por ${CUR.name}`, { driverId: id });
  save(); closeModal();
  if (APP_MODE === 'cloud') { a.disabled = true; cloudDriverAccess(drv(id), d.email, true).then(() => go('condutor', { id })); return; }
  toast('Condutor cadastrado e com acesso ao aplicativo.'); go('condutor', { id });
};
ACTIONS['drv-toggle'] = a => {
  const d = drv(a.dataset.id);
  if (driverActive(d)) {
    const c = driverCustodies(d.id)[0];
    if (c) return toast(`${d.name} está com o ${veh(c.vehicleId).plate}. Faça a entrega (ou a transferência forçada) antes de inativar.`);
    if (S.transfers.some(t => !['concluida', 'cancelada'].includes(t.status) && (t.fromDriverId === d.id || t.toDriverId === d.id))) return toast(`${d.name} tem uma transferência em andamento. Conclua ou cancele antes de inativar.`);
    openModal({
      title: `Inativar ${d.name}`, body: `<p>O condutor perde o acesso ao aplicativo e não pode receber veículos. O histórico de posses, multas e checklists continua guardado.</p><label class="field"><span>Motivo</span><input class="inp" id="dt-why" placeholder="Ex.: desligamento, afastamento, CNH suspensa"></label><p class="err" id="dt-err"></p>`,
      foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn danger" data-act="drv-toggle-ok" data-id="${d.id}">Inativar</button>`
    });
  } else ACTIONS['drv-toggle-ok'](a);
};
ACTIONS['drv-toggle-ok'] = a => {
  const d = drv(a.dataset.id); const u = S.users.find(x => x.driverId === d.id); const on = driverActive(d);
  if (on) { const why = $('#dt-why')?.value.trim() || ''; if (why.length < 4) return $('#dt-err').textContent = 'Informe o motivo.'; d.active = false; d.inactiveAt = nowTs(); d.inactiveReason = why; if (u) u.active = false; log('cadastro', `Condutor ${d.name} inativado por ${CUR.name}: ${why}`, { driverId: d.id }); }
  else { d.active = true; d.inactiveAt = null; d.inactiveReason = ''; if (u) u.active = true; log('cadastro', `Condutor ${d.name} reativado por ${CUR.name}`, { driverId: d.id }); }
  save(); closeModal(); toast(on ? `${d.name} inativado.` : `${d.name} reativado.`); render();
  if (APP_MODE === 'cloud') cloudDriverActive(d, !on).then(render);
};
PAGES.condutor = {
  title: p => drv(p.id)?.name || 'Condutor',
  render({ id, tab = 'posses' }) {
    const d = drv(id); const c = driverCustodies(id)[0]; const sc = driverScore(id); const from = startOfMonth(nowTs());
    const cs = S.custody.filter(x => x.driverId === id).sort((a, b) => b.start - a.start);
    const kmM = kmInPeriod(from, nowTs() + 1, x => x.driverId === id);
    const fines = S.fines.filter(f => fineMatch(f).driverId === id);
    const iss = S.issues.filter(i => i.driverId === id);
    const avar = S.checklists.filter(k => k.driverId === id && (k.avarias || (k.items && Object.values(k.items).includes('ruim'))));
    const tabs = [['posses', 'Posses'], ['score', 'Pontuação'], ['ck', 'Checklists'], ['fuel', 'Abastecimentos'], ['multas', 'Multas'], ['ocor', 'Ocorrências'], ['tl', 'Histórico']];
    let body = '';
    if (tab === 'posses') body = tbl(['Veículo', 'Início', 'Fim', 'Duração', '>Km', 'Obras'], cs.map(x => `<tr><td>${vehLink(x.vehicleId)}</td><td class="nowrap">${fmtDT(x.start)}</td><td class="nowrap">${x.end ? fmtDT(x.end) : pill('Posse ativa', 'ok')}</td><td>${dur((x.end || nowTs()) - x.start)}</td><td class="r">${nf((x.endKm || veh(x.vehicleId).odometer) - x.startKm)}</td><td>${[...new Set(x.segments.map(s => prj(s.projectId).code))].join(', ') || 'Sem obra'}</td></tr>`));
    if (tab === 'ck') body = checklistTable(S.checklists.filter(k => k.driverId === id));
    if (tab === 'fuel') body = fuelTable(S.fuel.filter(f => f.driverId === id));
    if (tab === 'multas') body = fineTable(fines);
    if (tab === 'ocor') body = tbl(['Data', 'Veículo', 'Tipo', 'Descrição', 'Situação'], [...iss.map(i => `<tr><td class="nowrap">${fmtShort(i.at)}</td><td>${vehLink(i.vehicleId)}</td><td>${esc(i.type)} ${pill(SEVERITY[i.severity].l, SEVERITY[i.severity].c)}</td><td>${esc(i.desc)}</td><td>${i.status === 'aberta' ? pill('Aberta', 'warn') : pill('Resolvida', 'ok')}</td></tr>`), ...avar.map(k => `<tr><td class="nowrap">${fmtShort(k.at)}</td><td>${vehLink(k.vehicleId)}</td><td>Checklist de ${CK_TYPES[k.type].toLowerCase()}</td><td>${esc(k.avarias || 'Itens avaliados como ruins')}</td><td>${pill('Registrada')}</td></tr>`)], 'Nenhuma ocorrência.');
    if (tab === 'score') body = `<div class="panel-b">${scoreBreakdown(sc)}</div>`;
    if (tab === 'tl') body = `<div class="panel-b" style="padding-top:12px">${timelineHTML(S.audit.filter(a => a.driverId === id).sort((a, b) => b.at - a.at).slice(0, 40))}</div>`;
    return `<div class="stack">
      <div class="panel"><div class="panel-b row" style="padding:16px 18px;justify-content:space-between"><div class="person"><span class="avatar lg">${initials(d.name)}</span><div><h2>${esc(d.name)}</h2><small>CNH ${d.cnhCat} · validade ${fmtDate(d.cnhExp)} · ${esc(d.phone)}</small></div></div>
        <div class="row">${!driverActive(d) ? pill(`Inativo desde ${fmtDate(d.inactiveAt)}`) : c ? `${plate(veh(c.vehicleId).plate)}<span class="small muted">desde ${fmtShort(c.start)}</span>` : '<span class="pill">Sem veículo</span>'}
        ${isManager() ? `<button class="btn sm" data-act="drv-edit" data-id="${id}">${ic('edit')}Editar</button><button class="btn sm ${driverActive(d) ? 'danger' : 'pri'}" data-act="drv-toggle" data-id="${id}">${driverActive(d) ? 'Inativar' : 'Reativar'}</button>` : ''}</div></div></div>
      ${!driverActive(d) && d.inactiveReason ? `<div class="note">${ic('user')}<div>Motivo da inativação: ${esc(d.inactiveReason)}</div></div>` : ''}
      <div class="kpis">${kpi('Pontuação do mês', nf(sc.total, 0), 'trophy', 's-' + scoreTone(sc.total), `data-go="condutor" data-id="${id}" data-tab="score"`)}${kpi('Prêmio previsto', money(sc.bonus), 'star', sc.bonus ? 'c-green' : '')}${kpi('Km no mês', nf(kmM), 'road')}${kpi('Checklists', `${sc.done}/${sc.req}`, 'check')}${kpi('Multas', fines.length, 'fine', fines.length ? 'c-red' : '')}</div>
      <div class="panel"><div class="panel-h"><div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-go="condutor" data-id="${id}" data-tab="${k}">${l}</button>`).join('')}</div></div>${body}</div></div>`;
  }
};
function scoreBreakdown(sc) {
  return `<div class="stack" style="gap:12px">${sc.parts.map(p => `<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><div><b>${p.l}</b><div class="tiny muted">${esc(p.info)}</div></div><b class="num">${nf(p.v, 1)} / ${p.max}</b></div>${barCell(p.v, p.max, 's-' + pctTone(p.v, p.max))}</div>`).join('')}
    <div class="row" style="justify-content:space-between;border-top:1px solid var(--border2);padding-top:12px"><div class="row">${ring(sc.total)}<div><b>Índice de conformidade</b><div class="tiny muted">${sc.tier ? `Faixa ≥ ${sc.tier.min} pontos` : `Abaixo de ${Math.min(...S.settings.score.tiers.map(t => t.min))} pontos`}</div></div></div><b style="font-size:1.2rem;color:${sc.bonus ? 'var(--green)' : 'var(--text3)'}">${money(sc.bonus)}</b></div></div>`;
}
