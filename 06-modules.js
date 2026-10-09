/* ===================== Módulos: abastecimento, manutenção, pedágios, multas, bonificação, relatórios, configurações ===================== */

/* ---------- Abastecimento (gestão) ---------- */
function fuelTable(list, emptyTxt = 'Nenhum abastecimento.') {
  return tbl(['Data', 'Veículo', 'Condutor', 'Obra', '>Km', '>Litros', '>Valor', '>km/l', '>Custo/km', '>Variação', 'Cupom'], list.sort((a, b) => b.at - a.at).slice(0, 150).map(f => {
    const m = fuelMetrics(f); const out = m.delta != null && Math.abs(m.delta) > S.settings.fuelDeviationPct;
    return `<tr><td class="nowrap">${fmtShort(f.at)}</td><td>${vehLink(f.vehicleId)}</td><td>${drvLink(f.driverId)}</td><td>${projLabel(f.projectId)}</td><td class="r">${nf(f.km)}</td><td class="r">${nf(f.liters, 2)}</td><td class="r">${money(f.total)}</td>
      <td class="r">${m.kmL ? nf(m.kmL, 1) : '—'}</td><td class="r">${m.costKm ? money(m.costKm) : '—'}</td><td class="r nowrap">${m.delta != null ? (out ? pill(`${m.delta > 0 ? '+' : ''}${nf(m.delta, 0)}%`, m.delta < 0 ? 'urg' : 'warn') : `<span class="muted">${m.delta > 0 ? '+' : ''}${nf(m.delta, 0)}%</span>`) : '—'}</td>
      <td>${f.receipt ? `<img src="${photoSrc(f.receipt)}" alt="Cupom" data-act="photo" style="width:34px;height:26px;object-fit:cover;border:1px solid var(--line);border-radius:2px;cursor:pointer">` : '<span class="muted">—</span>'}</td></tr>`;
  }), emptyTxt);
}
let FUEL_M = 0; const FUEL_F = { v: '', d: '', p: '' };
PAGES.abastecimento = {
  title: 'Abastecimento',
  render() {
    const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0); base.setMonth(base.getMonth() + FUEL_M);
    const from = base.getTime(); const nx = new Date(base); nx.setMonth(nx.getMonth() + 1); const to = Math.min(nx.getTime(), nowTs() + 1);
    const F = FUEL_F;
    const pass = f => (!F.v || f.vehicleId === F.v) && (!F.d || f.driverId === F.d) && (!F.p || f.projectId === F.p);
    const fs = S.fuel.filter(f => f.at >= from && f.at < to && pass(f));
    // consumo pelos próprios registros: km desde o abastecimento anterior ÷ litros (vale para qualquer filtro)
    const cons = list => { const ok = list.map(f => ({ f, d: fuelMetrics(f).dist })).filter(x => x.d > 0); const l = sum(ok, x => x.f.liters); return l ? sum(ok, x => x.d) / l : null; };
    const L = sum(fs, f => f.liters); const V = sum(fs, f => f.total); const avgAll = cons(fs);
    const outs = fs.filter(f => fuelOutlier(f));
    const perV = S.vehicles.map(v => { const x = fs.filter(f => f.vehicleId === v.id); const lv = sum(x, f => f.liters); return { v, L: lv, V: sum(x, f => f.total), n: x.length, avg: cons(x) }; }).filter(x => x.L);
    const mxL = Math.max(...perV.map(x => x.V), 1);
    const first = Math.min(...S.fuel.map(f => f.at)); const canBack = from > first; const label = cap(base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    const nFil = [F.v, F.d, F.p].filter(Boolean).length;
    const sel = (id, all, opts) => `<select class="inp" id="${id}" style="width:auto;min-height:36px;max-width:230px">${`<option value="">${all}</option>`}${opts}</select>`;
    return `<div class="stack">
      <div class="page-head" style="margin:0"><div class="row"><button class="icon-btn" data-act="fuel-m" data-d="-1" aria-label="Mês anterior" ${canBack ? '' : 'disabled'}>${ic('back')}</button><h2 style="min-width:170px;text-align:center">${label}</h2><button class="icon-btn" data-act="fuel-m" data-d="1" aria-label="Próximo mês" style="transform:scaleX(-1)" ${FUEL_M >= 0 ? 'disabled' : ''}>${ic('back')}</button>${FUEL_M ? '<button class="btn sm" data-act="fuel-m" data-d="0">Mês atual</button>' : '<span class="pill blue">mês atual · parcial</span>'}</div>
        <div class="filters">${sel('ff-v', 'Todos os veículos', S.vehicles.map(v => `<option value="${v.id}" ${F.v === v.id ? 'selected' : ''}>${v.plate} · ${esc(v.model)}</option>`).join(''))}${sel('ff-d', 'Todos os condutores', S.drivers.map(d => `<option value="${d.id}" ${F.d === d.id ? 'selected' : ''}>${esc(d.name)}${d.active === false ? ' (inativo)' : ''}</option>`).join(''))}${sel('ff-p', 'Todas as obras', S.projects.map(p => `<option value="${p.id}" ${F.p === p.id ? 'selected' : ''}>${esc(p.code)}</option>`).join(''))}${nFil ? '<button class="btn sm" data-act="fuel-clear">Limpar filtros</button>' : ''}</div></div>
      <div class="kpis">${kpi('Abastecimentos', fs.length, 'fuel', 'c-blue')}${kpi('Litros', nf(L), 'fuel')}${kpi('Custo', money(V), 'report')}${kpi('Consumo médio', avgAll ? nf(avgAll, 1) : '—', 'gauge', '', '', 'km/l')}${kpi('Fora do padrão', outs.length, 'alert', outs.length ? 'c-yellow' : '', '', `acima de ${S.settings.fuelDeviationPct}%`)}</div>
      ${outs.length ? `<div class="panel sev warn"><div class="panel-h"><h3>Consumo fora do padrão</h3><span class="pill warn">acima de ${S.settings.fuelDeviationPct}%</span></div>${fuelTable(outs)}</div>` : ''}
      <div class="panel"><div class="panel-h"><h3>Por veículo · ${label}</h3></div>${tbl(['Veículo', '>Abast.', '>Litros', 'Custo', '>Média km/l', '>Referência'], perV.sort((a, b) => b.V - a.V).map(x => `<tr><td>${vehLink(x.v.id)} <span class="muted small">${esc(x.v.model)}</span></td><td class="r">${x.n}</td><td class="r">${nf(x.L, 1)}</td><td style="min-width:180px"><div class="row" style="flex-wrap:nowrap">${barCell(x.V, mxL)}<span class="num nowrap small">${money(x.V)}</span></div></td><td class="r">${x.avg ? nf(x.avg, 1) : '—'}</td><td class="r muted">${nf(x.v.avgKmL, 1)}</td></tr>`), 'Nenhum abastecimento com estes filtros.')}</div>
      <div class="panel"><div class="panel-h"><h3>Registros · ${label}</h3><span class="muted small">${fs.length}${nFil ? ' · filtrado' : ''}</span></div>${fuelTable(fs.slice(), 'Nenhum abastecimento com estes filtros.')}</div></div>`;
  },
  mount() { [['ff-v', 'v'], ['ff-d', 'd'], ['ff-p', 'p']].forEach(([id, k]) => $('#' + id)?.addEventListener('change', e => { FUEL_F[k] = e.target.value; render(); })); }
};
ACTIONS['fuel-m'] = a => { const d = +a.dataset.d; FUEL_M = d === 0 ? 0 : Math.min(0, FUEL_M + d); render(); };
ACTIONS['fuel-clear'] = () => { FUEL_F.v = FUEL_F.d = FUEL_F.p = ''; render(); };

/* ---------- Manutenção ---------- */
function maintTable(vehicles, lvlFilter) {
  const rows = [];
  vehicles.forEach(v => vehicleMaint(v.id).items.filter(x => !lvlFilter || x.s.lvl === lvlFilter).forEach(({ p, s }) => {
    rows.push({ r: M_LEVEL[s.lvl].r, rem: s.remKm ?? 1e9, html: `<tr class="sev ${M_LEVEL[s.lvl].c === 'gray' ? '' : M_LEVEL[s.lvl].c}"><td>${vehLink(v.id)}</td><td>${esc(p.item)}</td>
      <td class="small">${[p.everyKm ? `a cada ${nf(p.everyKm)} km` : '', p.everyDays ? `a cada ${p.everyDays >= 365 && p.everyDays % 365 === 0 ? p.everyDays / 365 + (p.everyDays / 365 > 1 ? ' anos' : ' ano') : p.everyDays + ' dias'}` : ''].filter(Boolean).join(' ou ')}</td>
      <td class="r">${nf(v.odometer)}</td><td class="r small">${p.lastKm != null ? nf(p.lastKm) + ' km' : ''}${p.lastDate ? `<div class="muted">${fmtDate(p.lastDate)}</div>` : ''}</td>
      <td class="r small">${s.nextKm != null ? nf(s.nextKm) + ' km' : ''}${s.nextDate ? `<div class="muted">${fmtDate(s.nextDate)}</div>` : ''}</td>
      <td class="r nowrap">${s.remKm != null ? `<b>${nf(s.remKm)} km</b>` : ''}${s.remDays != null ? `<div class="small muted">${s.remDays} dias</div>` : ''}</td><td>${mLvl(s.lvl)}</td>
      ${isManager() ? `<td><button class="btn sm" data-act="mp-edit" data-id="${p.id}">Editar</button></td>` : ''}</tr>` });
  }));
  rows.sort((a, b) => b.r - a.r || a.rem - b.rem);
  return tbl(['Veículo', 'Item', 'Controle', '>Km atual', '>Última troca', '>Próxima', '>Restante', 'Situação', ...(isManager() ? [''] : [])], rows.map(r => r.html), 'Nenhum item neste filtro.');
}
PAGES.manutencao = {
  title: 'Manutenção',
  render({ id, l = '' }) {
    const vs = id ? [veh(id)] : S.vehicles;
    const all = S.vehicles.flatMap(v => vehicleMaint(v.id).items);
    const cnt = k => all.filter(x => x.s.lvl === k).length;
    const inShop = S.vehicles.filter(v => v.maintenance);
    return `<div class="page-head"><div class="filters">${id ? `<button class="chip on" data-go="manutencao">${veh(id).plate} ×</button>` : ''}<button class="chip ${!l ? 'on' : ''}" data-go="manutencao" ${id ? `data-id="${id}"` : ''}>Todos</button>${['vencido', 'urgente', 'atencao', 'normal'].map(k => `<button class="chip ${l === k ? 'on' : ''}" data-go="manutencao" data-l="${k}" ${id ? `data-id="${id}"` : ''}><span class="dot ${M_LEVEL[k].c}"></span>${M_LEVEL[k].l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
      <div class="row"><button class="btn" data-go="calendario">${ic('cal')}Calendário</button>${isManager() ? `<button class="btn pri" data-act="mp-new">${ic('plus')}Item no plano</button>` : ''}</div></div>
      <div class="stack">
      ${inShop.length ? `<div class="panel"><div class="panel-h"><h3>Em manutenção agora</h3></div>${tbl(['Veículo', 'Desde', 'Oficina e motivo', ''], inShop.map(v => `<tr><td>${vehLink(v.id)}</td><td>${fmtDT(v.maintenanceSince)}</td><td>${esc(v.maintenanceNote || '—')}</td><td class="r">${isManager() ? `<button class="btn sm pri" data-go="checklist_full" data-vid="${v.id}" data-type="manut_saida">Registrar saída</button>` : ''}</td></tr>`))}</div>` : ''}
      <div class="panel">${maintTable(vs, l)}</div>
      <div class="panel"><div class="panel-h"><h3>Serviços realizados</h3></div>${tbl(['Data', 'Veículo', 'Serviços', 'Oficina', '>Km', '>Custo'], S.maintRecords.filter(r => !id || r.vehicleId === id).sort((a, b) => b.at - a.at).map(r => `<tr><td>${fmtDate(r.at)}</td><td>${vehLink(r.vehicleId)}</td><td>${r.items.join(', ')}</td><td>${esc(r.shop || '')}</td><td class="r">${nf(r.km)}</td><td class="r">${money(r.cost)}</td></tr>`))}</div>
      </div>`;
  }
};
function mpForm(p = {}) {
  return `<form id="mpform" class="form-grid">
    ${p.id ? `<div class="full"><b>${veh(p.vehicleId).plate}</b> · ${esc(p.item)}</div>` : `<label class="field"><span>Veículo</span><select class="inp" name="vehicleId">${S.vehicles.map(v => `<option value="${v.id}">${v.plate} – ${esc(v.model)}</option>`).join('')}</select></label>
    <label class="field"><span>Item</span><select class="inp" name="item">${MAINT_ITEMS.map(i => `<option>${i}</option>`).join('')}</select></label>`}
    <label class="field"><span>Intervalo em km</span><input class="inp num" name="everyKm" inputmode="numeric" value="${p.everyKm ?? ''}" placeholder="Ex.: 10000"></label>
    <label class="field"><span>Intervalo em dias</span><input class="inp num" name="everyDays" inputmode="numeric" value="${p.everyDays ?? ''}" placeholder="Ex.: 180"></label>
    <label class="field"><span>Km da última troca</span><input class="inp num" name="lastKm" inputmode="numeric" value="${p.lastKm ?? ''}"></label>
    <label class="field"><span>Data da última troca</span><input class="inp" type="date" name="lastDate" value="${p.lastDate ? dateInput(p.lastDate) : ''}"></label>
    <p class="small muted full">Preencha km, dias ou ambos. O item vence no que ocorrer primeiro.</p><p class="err full" id="mp-err"></p></form>`;
}
ACTIONS['mp-new'] = () => openModal({ title: 'Adicionar item ao plano', body: mpForm(), foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="mp-save">Salvar</button>' });
ACTIONS['mp-edit'] = a => openModal({ title: 'Editar item do plano', body: mpForm(byId(S.plans, a.dataset.id)), foot: `<button class="btn danger" data-act="mp-del" data-id="${a.dataset.id}">Remover</button><button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="mp-save" data-id="${a.dataset.id}">Salvar</button>` });
ACTIONS['mp-save'] = a => {
  const d = formData($('#mpform')); const n = s => s ? parseInt(String(s).replace(/\D/g, ''), 10) : null;
  const vals = { everyKm: n(d.everyKm), everyDays: n(d.everyDays), lastKm: n(d.lastKm), lastDate: d.lastDate ? new Date(d.lastDate + 'T12:00').getTime() : null };
  if (!vals.everyKm && !vals.everyDays) return $('#mp-err').textContent = 'Informe o intervalo em km, em dias ou ambos.';
  if (vals.everyKm && vals.lastKm == null) return $('#mp-err').textContent = 'Informe o km da última troca.';
  if (vals.everyDays && !vals.lastDate) return $('#mp-err').textContent = 'Informe a data da última troca.';
  if (a.dataset.id) Object.assign(byId(S.plans, a.dataset.id), vals);
  else S.plans.push({ id: uid('mp'), vehicleId: d.vehicleId, item: d.item, ...vals });
  save(); closeModal(); toast('Plano de manutenção atualizado.'); render();
};
ACTIONS['mp-del'] = a => { S.plans = S.plans.filter(p => p.id !== a.dataset.id); save(); closeModal(); render(); };

/* ---------- Pedágios ---------- */
function tollTable(list) {
  return tbl(['Data e hora', 'Placa', 'Local', '>Valor', 'Condutor no horário', 'Obra', 'Centro de custo', 'Correspondência', ...(isManager() ? [''] : [])], list.sort((a, b) => b.at - a.at).slice(0, 200).map(t => {
    const m = tollMatch(t);
    return `<tr><td class="nowrap">${fmtShort(t.at)}</td><td>${plate(t.plate)}</td><td class="small">${esc(t.place)}</td><td class="r">${money(t.value)}</td>
      <td>${m.driverId ? drvLink(m.driverId) : '<span class="muted">—</span>'}</td><td>${m.projectId ? esc(prj(m.projectId).code) : '<span class="muted">—</span>'}</td><td class="small">${m.ccId ? ccOf(m.ccId).code : '—'}</td>
      <td>${m.how === 'auto' ? pill('Automática', 'ok') : m.how === 'manual' ? pill('Ajuste manual', '') : pill('Sem correspondência', 'warn')}</td>
      ${isManager() ? `<td>${m.how !== 'auto' ? `<button class="btn sm" data-act="toll-adj" data-id="${t.id}">Ajustar</button>` : ''}</td>` : ''}</tr>`;
  }), 'Nenhuma passagem.');
}
PAGES.pedagios = {
  title: 'Pedágios',
  render({ f = '' }) {
    const from = startOfMonth(nowTs()); const ms = S.tolls.filter(t => t.at >= from);
    const un = S.tolls.filter(t => tollMatch(t).how === 'sem');
    const list = f === 'sem' ? un : S.tolls.slice();
    return `<div class="page-head"><div class="filters"><button class="chip ${!f ? 'on' : ''}" data-go="pedagios">Todas</button><button class="chip ${f === 'sem' ? 'on' : ''}" data-go="pedagios" data-f="sem">Sem condutor<span class="n">${un.length}</span></button></div>${isManager() ? '<div class="row"><button class="btn" data-act="toll-import">Importar fatura</button><button class="btn pri" data-act="toll-new">Registrar passagem</button></div>' : ''}</div>
      <div class="stack"><div class="kpis">${kpi('Passagens no mês', ms.length, 'toll', 'c-blue')}${kpi('Valor no mês', money(sum(ms, t => t.value)), 'report')}${kpi('Identificadas', nf(S.tolls.filter(t => tollMatch(t).how === 'auto').length / S.tolls.length * 100, 0) + '%', 'check', 'c-green', '', 'pela posse')}${kpi('Sem condutor', un.length, 'alert', un.length ? 'c-yellow' : '', 'data-go="pedagios" data-f="sem"')}</div>
      <div class="panel">${tollTable(list)}</div></div>`;
  }
};
function importTolls(text) {
  let ok = 0; const errs = [];
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const c = line.split(/[;\t]/).map(x => x.trim());
    if (/placa/i.test(c[0])) return;
    const [pl, dt, hr, place, val] = c; const m = dt?.match(/(\d{2})\/(\d{2})\/(\d{4})/); const h = hr?.match(/(\d{1,2}):(\d{2})/);
    const v = parseFloat(String(val || '').replace('R$', '').replace(/\./g, '').replace(',', '.'));
    if (!pl || !m || !h || !place || !v) { errs.push(`Linha ${i + 1}: formato inválido`); return; }
    const at = new Date(+m[3], +m[2] - 1, +m[1], +h[1], +h[2]).getTime();
    S.tolls.push({ id: uid('tol'), plate: pl.toUpperCase().replace(/[^A-Z0-9]/g, ''), at, place, value: v, invoice: 'Importação ' + fmtDate(nowTs()), manual: null }); ok++;
  });
  return { ok, errs };
}
ACTIONS['toll-import'] = () => {
  const ex = S.custody.find(c => c.vehicleId === 'v1' && !c.end) ? `ABC1D23;${fmtDate(nowTs())};09:15;Praça Valinhos – SP-330 km 82;11,60\nTUV3W45;${fmtDate(nowTs() - 2 * DAY)};14:40;Praça Campinas – SP-348 km 72;9,10` : '';
  openModal({
    title: 'Importar fatura de pedágio', wide: true,
    body: `<p class="small muted">Cole as linhas da fatura (CSV ou planilha) no formato: <span class="mono">placa;data;hora;local;valor</span>. O sistema identifica o condutor e a obra de cada passagem.</p><textarea class="inp mono" id="toll-csv" style="min-height:160px">${ex}</textarea><p class="err" id="toll-err"></p>`,
    foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="toll-import-ok">Importar</button>'
  });
};
ACTIONS['toll-import-ok'] = () => {
  const r = importTolls($('#toll-csv').value);
  if (!r.ok) return $('#toll-err').textContent = r.errs.join('. ') || 'Nada para importar.';
  log('pedagio', `${r.ok} passagem(ns) de pedágio importada(s) por ${CUR.name}`, {}); save(); closeModal(); toast(`${r.ok} passagem(ns) importada(s)${r.errs.length ? `, ${r.errs.length} com erro` : ''}.`); render();
};
ACTIONS['toll-new'] = () => openModal({
  title: 'Registrar passagem', body: `<form id="tform" class="form-grid"><label class="field"><span>Placa</span><select class="inp" name="plate">${S.vehicles.map(v => `<option>${v.plate}</option>`).join('')}</select></label><label class="field"><span>Valor (R$)</span><input class="inp num" name="value" inputmode="decimal"></label><label class="field"><span>Data</span><input class="inp" type="date" name="date" value="${dateInput(nowTs())}"></label><label class="field"><span>Hora</span><input class="inp" type="time" name="time" value="08:00"></label><label class="field full"><span>Local</span><input class="inp" name="place" placeholder="Praça / rodovia / km"></label><p class="err full" id="tf-err"></p></form>`,
  foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="toll-save">Registrar</button>'
});
ACTIONS['toll-save'] = () => {
  const d = formData($('#tform')); const v = parseFloat(d.value.replace(/\./g, '').replace(',', '.'));
  if (!v || !d.place || !d.date || !d.time) return $('#tf-err').textContent = 'Preencha todos os campos.';
  S.tolls.push({ id: uid('tol'), plate: d.plate, at: new Date(d.date + 'T' + d.time).getTime(), place: d.place, value: v, invoice: 'Registro manual', manual: null });
  save(); closeModal(); toast('Passagem registrada e cruzada com a posse.'); render();
};
ACTIONS['toll-adj'] = a => {
  const t = byId(S.tolls, a.dataset.id); const v = vehicleByPlate(t.plate);
  const near = v ? S.custody.filter(c => c.vehicleId === v.id).sort((x, y) => Math.abs(x.start - t.at) - Math.abs(y.start - t.at)).slice(0, 2) : [];
  openModal({
    title: 'Ajuste manual de pedágio', body: `<p>${plate(t.plate)} · ${fmtDT(t.at)} · ${esc(t.place)} · <b>${money(t.value)}</b></p>
      <div class="note warn">Não há posse registrada neste horário. ${near.length ? `Posses mais próximas: ${near.map(c => `${esc(drv(c.driverId).name)} (${fmtShort(c.start)} a ${c.end ? fmtShort(c.end) : 'agora'})`).join('; ')}.` : ''}</div>
      <form id="adjform" class="form-grid"><label class="field"><span>Condutor</span><select class="inp" name="driverId">${driverOptions(t.manual?.driverId || near[0]?.driverId)}</select></label>
      <label class="field"><span>Obra</span><select class="inp" name="projectId">${projectOptions(t.manual?.projectId || 'pmat')}</select></label>
      <label class="field full"><span>Motivo do ajuste</span><input class="inp" name="reason" value="${esc(t.manual?.reason || '')}" placeholder="Ex.: veículo usado sem registro de posse"></label><p class="err full" id="adj-err"></p></form>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="toll-adj-ok" data-id="${t.id}">Salvar ajuste</button>`
  });
};
ACTIONS['toll-adj-ok'] = a => {
  const t = byId(S.tolls, a.dataset.id); const d = formData($('#adjform'));
  if (d.reason.length < 5) return $('#adj-err').textContent = 'Informe o motivo do ajuste.';
  t.manual = { driverId: d.driverId, projectId: d.projectId, ccId: prj(d.projectId).ccId, reason: d.reason, by: CUR.id, at: nowTs(), vehicleId: vehicleByPlate(t.plate)?.id };
  log('pedagio', `Pedágio de ${fmtShort(t.at)} (${money(t.value)}) atribuído manualmente a ${drv(d.driverId).name} / ${prj(d.projectId).code}: ${d.reason}`, { vehicleId: t.manual.vehicleId, driverId: d.driverId });
  save(); closeModal(); toast('Ajuste registrado na auditoria.'); render();
};

/* ---------- Multas ---------- */
function fineTable(list) {
  return tbl(['Data e hora', 'Placa', 'Infração', '>Valor', 'Notificação', 'Condutor no momento', 'Obra', 'Identificação'], list.sort((a, b) => b.at - a.at).map(f => {
    const m = fineMatch(f);
    return `<tr class="click" data-act="fine-view" data-id="${f.id}"><td class="nowrap">${fmtShort(f.at)}</td><td>${plate(f.plate)}</td><td class="small">${esc(f.infraction)} ${pill(f.gravity === 'gravissima' ? 'Gravíssima' : f.gravity[0].toUpperCase() + f.gravity.slice(1), '')}</td>
      <td class="r">${money(f.value)}</td><td class="mono small">${esc(f.notice)}</td><td>${m.driverId ? esc(drv(m.driverId).name) : '<span class="muted">—</span>'}</td><td>${m.projectId ? esc(prj(m.projectId).code) : '—'}</td>
      <td>${m.how === 'auto' ? pill('Automática', 'ok') : m.how === 'manual' ? pill('Manual', '') : pill('Sem posse no horário', 'warn')}</td></tr>`;
  }), 'Nenhuma multa.');
}
PAGES.multas = {
  title: 'Multas',
  render() {
    const un = S.fines.filter(f => fineMatch(f).how === 'sem');
    return `<div class="page-head"><span></span>${isManager() ? `<button class="btn pri" data-act="fine-new">${ic('plus')}Registrar multa</button>` : ''}</div>
      <div class="stack"><div class="kpis">${kpi('Multas', S.fines.length, 'fine', 'c-red')}${kpi('Valor total', money(sum(S.fines, f => f.value)), 'report')}${kpi('Pontos na CNH', sum(S.fines, f => f.points), 'alert')}${kpi('Sem condutor', un.length, 'user', un.length ? 'c-yellow' : '')}</div>
      <div class="panel">${fineTable(S.fines.slice())}</div></div>`;
  }
};
ACTIONS['fine-view'] = a => {
  const f = byId(S.fines, a.dataset.id); const m = fineMatch(f); const c = m.custody || (m.custodyId && byId(S.custody, m.custodyId));
  const hist = m.vehicleId ? S.audit.filter(x => x.vehicleId === m.vehicleId && Math.abs(x.at - f.at) < 18 * 36e5).sort((x, y) => y.at - x.at) : [];
  openModal({
    title: `Multa ${f.notice}`, wide: true,
    body: `<dl class="dl"><dt>Placa</dt><dd>${plate(f.plate)}</dd><dt>Data e hora</dt><dd>${fmtDT(f.at)}</dd><dt>Local</dt><dd>${esc(f.place)}</dd><dt>Infração</dt><dd>${esc(f.infraction)}</dd><dt>Valor</dt><dd>${money(f.value)} · ${f.points} pontos</dd></dl>
      <div class="panel"><div class="panel-h"><h3>Responsável no momento da infração</h3>${m.how === 'auto' ? pill('Identificado pela posse', 'ok') : m.how === 'manual' ? pill('Indicado manualmente', '') : pill('Sem posse no horário', 'warn')}</div><div class="panel-b">
        ${m.driverId ? `<dl class="dl"><dt>Condutor</dt><dd><b>${esc(drv(m.driverId).name)}</b> · CNH ${drv(m.driverId).cnhCat}</dd><dt>Obra associada</dt><dd>${projFull(m.projectId)}</dd>${c ? `<dt>Período de posse</dt><dd>${fmtDT(c.start)} até ${c.end ? fmtDT(c.end) : 'agora'}</dd>` : ''}</dl>`
        : `<p>Não havia posse registrada para ${f.plate} neste horário. ${isManager() ? 'Indique o condutor manualmente:' : ''}</p>${isManager() ? `<div class="row" style="margin-top:8px"><select class="inp" id="fine-drv" style="max-width:260px">${driverOptions('')}</select><button class="btn" data-act="fine-assign" data-id="${f.id}">Indicar condutor</button></div>` : ''}`}</div></div>
      <div><p class="label" style="margin-bottom:6px">Anexos</p>${f.attachments.length ? f.attachments.map(x => `<div class="row small">${ic('fine')} ${esc(x)}</div>`).join('') : '<span class="muted small">Nenhum documento anexado.</span>'}
        ${isManager() ? `<label class="btn sm" style="position:relative;margin-top:8px">Anexar documento<input type="file" id="fine-file" data-id="${f.id}" style="position:absolute;inset:0;opacity:0"></label>` : ''}</div>
      <div><p class="label" style="margin-bottom:4px">Histórico do veículo próximo ao horário</p>${timelineHTML(hist)}</div>`,
    onMount: el => { el.querySelector('#fine-file')?.addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; f.attachments.push(file.name); log('multa', `Documento anexado à multa ${f.notice}: ${file.name}`, { vehicleId: m.vehicleId }); save(); ACTIONS['fine-view']({ dataset: { id: f.id } }); }); }
  });
};
ACTIONS['fine-assign'] = a => { const f = byId(S.fines, a.dataset.id); f.manualDriverId = $('#fine-drv').value; log('multa', `Multa ${f.notice} indicada manualmente para ${drv(f.manualDriverId).name}`, { vehicleId: vehicleByPlate(f.plate)?.id, driverId: f.manualDriverId }); save(); closeModal(); render(); };
ACTIONS['fine-new'] = () => openModal({
  title: 'Registrar multa', wide: true, body: `<form id="fnform" class="form-grid">
    <label class="field"><span>Placa</span><select class="inp" name="plate">${S.vehicles.map(v => `<option>${v.plate}</option>`).join('')}</select></label>
    <label class="field"><span>Número da notificação</span><input class="inp mono" name="notice"></label>
    <label class="field"><span>Data</span><input class="inp" type="date" name="date"></label><label class="field"><span>Hora</span><input class="inp" type="time" name="time"></label>
    <label class="field full"><span>Local</span><input class="inp" name="place"></label>
    <label class="field full"><span>Tipo de infração</span><input class="inp" name="infraction" placeholder="Ex.: Transitar em velocidade superior à máxima permitida em até 20%"></label>
    <label class="field"><span>Gravidade</span><select class="inp" name="gravity" id="fn-grav"><option value="leve">Leve</option><option value="media" selected>Média</option><option value="grave">Grave</option><option value="gravissima">Gravíssima</option></select></label>
    <label class="field"><span>Valor (R$)</span><input class="inp num" name="value" id="fn-val" value="130,16"></label>
    <label class="field full"><span>Documento da multa</span><input class="inp" type="file" name="file"></label><p class="err full" id="fn-err"></p></form>`,
  foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="fine-save">Registrar e identificar condutor</button>',
  onMount: el => el.querySelector('#fn-grav').addEventListener('change', e => { el.querySelector('#fn-val').value = nf(FINE_TYPES[e.target.value], 2); })
});
ACTIONS['fine-save'] = () => {
  const form = $('#fnform'); const d = formData(form); const v = parseFloat(d.value.replace(/\./g, '').replace(',', '.'));
  if (!d.notice || !d.date || !d.time || !d.place || !d.infraction || !v) return $('#fn-err').textContent = 'Preencha todos os campos.';
  const file = form.querySelector('[name=file]').files[0];
  const f = { id: uid('fin'), plate: d.plate, at: new Date(d.date + 'T' + d.time).getTime(), place: d.place, infraction: d.infraction, gravity: d.gravity, value: v, notice: d.notice, points: { leve: 3, media: 4, grave: 5, gravissima: 7 }[d.gravity], attachments: file ? [file.name] : [], manualDriverId: null };
  S.fines.push(f); const m = fineMatch(f);
  log('multa', `Multa ${f.notice} registrada (${money(v)})${m.driverId ? ` · condutor identificado: ${drv(m.driverId).name}` : ' · sem posse no horário'}`, { vehicleId: m.vehicleId, driverId: m.driverId });
  save(); closeModal(); toast(m.driverId ? `Condutor identificado: ${drv(m.driverId).name}.` : 'Sem posse no horário: indique o condutor manualmente.'); render();
};


/* ---------- Relatórios ---------- */
let REP_CACHE = null;
PAGES.relatorios = {
  title: 'Relatórios',
  render({ per = 'mes' }) {
    const n = nowTs(); const ranges = { mes: [startOfMonth(n), n + 1, 'Este mês'], ant: [startOfMonth(startOfMonth(n) - DAY), startOfMonth(n), 'Mês anterior'], d60: [n - 60 * DAY, n + 1, 'Últimos 60 dias'] };
    const [from, to] = ranges[per]; const rows = periodCosts(from, to);
    const kinds = ['Combustível', 'Pedágios', 'Multas', 'Manutenção', 'Documentação'];
    const pivot = (key, label, kmFn) => {
      const ids = [...new Set(rows.map(r => r[key] || '_'))];
      const data = ids.map(id => { const rs = rows.filter(r => (r[key] || '_') === id); const o = { id, label: label(id) }; kinds.forEach(k => o[k] = sum(rs.filter(r => r.kind === k), r => r.value)); o.total = sum(rs, r => r.value); o.km = kmFn ? kmFn(id) : null; return o; }).sort((a, b) => b.total - a.total);
      return data;
    };
    const byV = pivot('vehicleId', id => veh(id)?.plate || 'Não identificado', id => kmInPeriod(from, to, c => c.vehicleId === id));
    const byP = pivot('projectId', id => prj(id)?.code || 'Sem obra');
    const byD = pivot('driverId', id => drv(id)?.name || 'Sem condutor (manutenção e não identificados)', id => kmInPeriod(from, to, c => c.driverId === id));
    REP_CACHE = { byV, byP, byD, kinds };
    const table = (data, first, withKm, key) => `<div class="panel"><div class="panel-h"><h3>Custo por ${first.toLowerCase()}</h3><button class="btn sm" data-act="rep-copy" data-k="${key}">Copiar tabela</button></div>${tbl([first, ...kinds.map(k => '>' + k), ...(withKm ? ['>Km', '>Custo/km'] : []), '>Total'], data.map(o => `<tr><td class="nowrap">${esc(o.label)}</td>${kinds.map(k => `<td class="r">${o[k] ? money(o[k]) : '<span class="muted">—</span>'}</td>`).join('')}${withKm ? `<td class="r">${nf(o.km)}</td><td class="r">${o.km > 0 ? money(o.total / o.km) : '—'}</td>` : ''}<td class="r"><b>${money(o.total)}</b></td></tr>`).concat([`<tr><td><b>Total</b></td>${kinds.map(k => `<td class="r"><b>${money(sum(data, o => o[k]))}</b></td>`).join('')}${withKm ? `<td class="r"><b>${nf(sum(data, o => o.km))}</b></td><td></td>` : ''}<td class="r"><b>${money(sum(data, o => o.total))}</b></td></tr>`]))}</div>`;
    return `<div class="page-head">      <div class="filters">${Object.entries(ranges).map(([k, r]) => `<button class="chip ${per === k ? 'on' : ''}" data-go="relatorios" data-per="${k}">${r[2]}</button>`).join('')}</div></div>
      <div class="stack">${table(byP, 'Obra', false, 'byP')}${table(byV, 'Veículo', true, 'byV')}${table(byD, 'Condutor', true, 'byD')}</div>`;
  }
};
ACTIONS['rep-copy'] = async a => {
  const data = REP_CACHE[a.dataset.k]; const k = REP_CACHE.kinds;
  const csv = ['Item;' + k.join(';') + ';Total', ...data.map(o => [o.label, ...k.map(x => nf(o[x], 2)), nf(o.total, 2)].join(';'))].join('\n');
  try { await navigator.clipboard.writeText(csv); toast('Tabela copiada. Cole no Excel.'); }
  catch (e) { openModal({ title: 'Copiar tabela', body: `<textarea class="inp mono" style="min-height:220px" readonly onfocus="this.select()">${esc(csv)}</textarea>` }); }
};

/* ---------- Configurações ---------- */
const DB_ENTITIES = [
  ['users', 'Usuários e perfil de acesso (administrador, gestor, supervisor, condutor)'], ['drivers', 'Condutores: CNH, categoria, validade, contato'],
  ['vehicles', 'Veículos: placa, modelo, ano, combustível, hodômetro, rastreador'], ['vehicle_qr_codes', 'Identificador seguro do QR Code, ativo/revogado'],
  ['vehicle_custody', 'Posse: fonte de verdade da responsabilidade (condutor, início, fim, km inicial e final)'], ['custody_project_changes', 'Obra e centro de custo ao longo da posse (histórico com data e hora)'],
  ['vehicle_transfers', 'Transferências de posse e seus estados, inclusive forçadas com justificativa'], ['projects', 'Obras'], ['cost_centers', 'Centros de custo'],
  ['checklists', 'Checklists diários e completos (recebimento, entrega, manutenção, avaria)'], ['checklist_items', 'Itens avaliados em cada checklist'], ['checklist_photos', 'Fotos associadas à movimentação'],
  ['vehicle_issues', 'Problemas informados, criticidade, bloqueio e resolução'], ['fuel_records', 'Abastecimentos vinculados à posse e à obra'],
  ['maintenance_plans', 'Plano preventivo por veículo (km, data ou ambos)'], ['maintenance_records', 'Serviços realizados e custos'],
  ['tolls', 'Passagens de pedágio e ajuste manual'], ['fines', 'Multas e anexos'], ['vehicle_locations', 'Posições recebidas do Traccar (lat, long, velocidade, ignição, hodômetro)'], ['telemetry_events', 'Alertas do Traccar: excesso de velocidade, frenagem e aceleração bruscas'],
  ['driver_scores', 'Pontuação mensal por critério'], ['driver_bonuses', 'Bonificação calculada e aprovada'], ['notifications', 'Alertas para condutores e gestão'], ['audit_logs', 'Auditoria completa de todas as ações']
];
PAGES.configuracoes = {
  title: 'Configurações',
  render({ tab = 'regras' }) {
    const st = S.settings; const tabs = [['regras', 'Regras da frota'], ['integ', 'Rastreamento (Traccar)'], ['usuarios', 'Usuários e perfis'], ['obras', 'Obras e centros de custo'], ['dados', 'Banco de dados']];
    let body = '';
    if (tab === 'regras') body = `<form class="panel-b form-grid" id="cfg-form" data-sec="regras">
      <label class="field"><span>Prazo do checklist diário</span><input class="inp" type="time" name="dailyDeadline" value="${st.dailyDeadline}"></label>
      <label class="field"><span>Alertar transferência incompleta após (horas)</span><input class="inp num" name="transferAlertHours" value="${st.transferAlertHours}"></label>
      <label class="field"><span>Condutor com mais de um veículo</span><select class="inp" name="oneVehiclePerDriver"><option value="1" ${st.oneVehiclePerDriver ? 'selected' : ''}>Não permitir</option><option value="0" ${!st.oneVehiclePerDriver ? 'selected' : ''}>Permitir</option></select></label>
      <label class="field"><span>Fotos no checklist completo</span><select class="inp" name="requirePhotos"><option value="1" ${st.requirePhotos ? 'selected' : ''}>Obrigatórias (5 fotos)</option><option value="0" ${!st.requirePhotos ? 'selected' : ''}>Opcionais</option></select></label>
      <label class="field"><span>Manutenção: atenção a (km)</span><input class="inp num" name="attentionKm" value="${st.maint.attentionKm}"></label><label class="field"><span>Manutenção: urgente a (km)</span><input class="inp num" name="urgentKm" value="${st.maint.urgentKm}"></label>
      <label class="field"><span>Manutenção: atenção a (dias)</span><input class="inp num" name="attentionDays" value="${st.maint.attentionDays}"></label><label class="field"><span>Manutenção: urgente a (dias)</span><input class="inp num" name="urgentDays" value="${st.maint.urgentDays}"></label>
      <label class="field"><span>Consumo fora do padrão acima de (%)</span><input class="inp num" name="fuelDeviationPct" value="${st.fuelDeviationPct}"></label>
      <label class="field"><span>Locação: avisar com (dias)</span><input class="inp num" name="rentWarn" value="${st.rental.warnDays}"></label><label class="field"><span>Locação: urgente com (dias)</span><input class="inp num" name="rentUrg" value="${st.rental.urgentDays}"></label>
      <div class="full"><button class="btn ok">Salvar regras</button></div></form>`;
    if (tab === 'usuarios' && APP_MODE === 'cloud') body = cloudUsersTab();
    else if (tab === 'usuarios') body = `${tbl(['Nome', 'E-mail', 'Perfil', 'Condutor vinculado', ''], S.users.map(u => `<tr><td>${esc(u.name)}</td><td class="small">${esc(u.email)}</td><td><select class="inp" style="min-height:32px;padding:4px 8px" data-act-change="role" data-id="${u.id}">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td>${u.driverId ? esc(drv(u.driverId).name) : '—'}</td><td>${u.active ? pill('Ativo', 'ok') : pill('Inativo')}</td></tr>`))}
      <div class="panel-b"><h3 style="margin-bottom:8px">Permissões por perfil</h3>${tbl(['Ação', 'Condutor', 'Supervisor', 'Gestor de Frota', 'Administrador'], [['Escanear, receber, entregar, checklists, abastecer', 1, 0, 0, 0], ['Ver dashboard, central, veículos, condutores e relatórios', 0, 1, 1, 1], ['Transferência forçada, ajustes de pedágio e multa, manutenção', 0, 0, 1, 1], ['Configurar regras, usuários e integrações', 0, 0, 0, 1]].map(([l, ...r]) => `<tr><td>${l}</td>${r.map(x => `<td>${x ? '<span class="st"><span class="dot ok"></span>Sim</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`))}
      <p class="small muted" style="margin-top:8px">O condutor vê apenas o próprio veículo, as próprias solicitações e as telas de operação.</p></div>`;
    if (tab === 'obras') body = `${tbl(['Obra', 'Descrição', 'Centro de custo', 'Veículos agora'], S.projects.map(p => `<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${ccLabel(p.ccId)}</td><td>${S.vehicles.filter(v => currentSegment(activeCustody(v.id))?.projectId === p.id).map(v => plate(v.plate)).join(' ') || '<span class="muted">—</span>'}</td></tr>`))}
      <form class="panel-b form-grid" id="proj-form"><label class="field"><span>Código</span><input class="inp" name="code" placeholder="Obra 40"></label><label class="field"><span>Descrição</span><input class="inp" name="name"></label><label class="field"><span>Centro de custo</span><select class="inp" name="ccId">${ccOptions()}</select></label><div class="field" style="justify-content:flex-end"><button class="btn">Adicionar obra</button></div></form>`;
    if (tab === 'integ') body = traccarSettings();
    if (tab === 'dados' && APP_MODE === 'cloud') body = `<div class="panel-b stack">${syncBadge()}<p class="muted">Os dados ficam no Supabase (PostgreSQL) com regras de acesso por perfil (RLS). Fotos e documentos ficam num armazenamento privado; os links abertos no aplicativo expiram em 1 hora.</p>
      ${tbl(['Tabela', 'Conteúdo', '>Registros visíveis'], DB_ENTITIES.map(([t, d]) => `<tr><td class="mono small">${t}</td><td class="small">${d}</td><td class="r">${({ users: S.users, drivers: S.drivers.filter(x => !x._ro), vehicles: S.vehicles, vehicle_qr_codes: S.qrcodes, vehicle_custody: S.custody, vehicle_transfers: S.transfers, projects: S.projects, cost_centers: S.costCenters, checklists: S.checklists, vehicle_issues: S.issues, fuel_records: S.fuel, maintenance_plans: S.plans, maintenance_records: S.maintRecords, tolls: S.tolls, fines: S.fines, notifications: S.notifications, audit_logs: S.audit, telemetry_events: S.trackerEvents, vehicle_locations: Object.keys(S.locations) }[t] || []).length || '—'}</td></tr>`))}
      ${S.vehicles.length ? '' : `<div class="note">${ic('grid')}<div><b>Banco vazio.</b> Para conhecer o sistema com dados, grave os dados de exemplo (9 veículos, 9 condutores, 40 dias de histórico). Os condutores de exemplo não recebem login. <button class="btn sm pri" data-act="cl-seed" style="margin-left:8px">Gravar dados de exemplo</button></div></div>`}</div>`;
    else if (tab === 'dados') body = `<div class="panel-b stack"><p class="muted">Entidades principais do banco. O script SQL completo (PostgreSQL / Supabase) acompanha o protótipo.</p>
      ${tbl(['Tabela', 'Conteúdo', '>Registros no protótipo'], DB_ENTITIES.map(([t, d]) => `<tr><td class="mono small">${t}</td><td class="small">${d}</td><td class="r">${({ users: S.users, drivers: S.drivers, vehicles: S.vehicles, vehicle_qr_codes: S.qrcodes, vehicle_custody: S.custody, vehicle_transfers: S.transfers, projects: S.projects, cost_centers: S.costCenters, checklists: S.checklists, vehicle_issues: S.issues, fuel_records: S.fuel, maintenance_plans: S.plans, maintenance_records: S.maintRecords, tolls: S.tolls, fines: S.fines, notifications: S.notifications, audit_logs: S.audit, telemetry_events: S.trackerEvents, vehicle_locations: Object.keys(S.locations) }[t] || []).length || '—'}</td></tr>`))}
      <div class="note"><b>Dados da demonstração.</b> Tudo o que você registra fica salvo apenas neste navegador. <button class="btn sm danger" data-act="reset" style="margin-left:8px">Restaurar dados de exemplo</button></div></div>`;
    return `<div class="panel"><div class="panel-h"><div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-go="configuracoes" data-tab="${k}">${l}</button>`).join('')}</div></div>${body}</div>`;
  },
  mount() {
    mountTraccarSettings();
    const f = $('#cfg-form');
    f?.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f); const st = S.settings; const n = x => parseFloat(String(x).replace(',', '.'));
      if (f.dataset.sec === 'regras') { st.dailyDeadline = d.dailyDeadline; st.transferAlertHours = n(d.transferAlertHours); st.oneVehiclePerDriver = d.oneVehiclePerDriver === '1'; st.requirePhotos = d.requirePhotos === '1'; Object.assign(st.maint, { attentionKm: n(d.attentionKm), urgentKm: n(d.urgentKm), attentionDays: n(d.attentionDays), urgentDays: n(d.urgentDays) }); st.fuelDeviationPct = n(d.fuelDeviationPct); st.rental = { warnDays: n(d.rentWarn), urgentDays: n(d.rentUrg) }; }
      if (f.dataset.sec === 'integ') { Object.assign(st.tracker, { enabled: d.enabled === '1', provider: d.provider, endpoint: d.endpoint, interval: n(d.interval) }); }
      log('config', `Configurações alteradas (${f.dataset.sec}) por ${CUR.name}`, {}); save(); toast('Configurações salvas.');
    });
    $('#proj-form')?.addEventListener('submit', e => { e.preventDefault(); const d = formData(e.target); if (!d.code || !d.name) return toast('Informe código e descrição.'); S.projects.push({ id: uid('prj'), code: d.code, name: d.name, ccId: d.ccId, lat: -22.9 + (Math.random() - .5) * .25, lng: -47.1 + (Math.random() - .5) * .3, active: true }); save(); toast('Obra adicionada.'); render(); });
    $$('[data-act-change="role"]').forEach(s => s.addEventListener('change', () => { const u = byId(S.users, s.dataset.id); u.role = s.value; log('config', `Perfil de ${u.name} alterado para ${ROLES[u.role]}`, {}); save(); toast('Perfil atualizado.'); }));
  }
};
ACTIONS.reset = () => { resetDemo(); CUR = byId(S.users, CUR.id) || S.users[0]; toast('Dados de exemplo restaurados.'); go(homePage()); };

/* ---------- Login ---------- */
PAGES.login = {
  render() {
    if (APP_MODE === 'cloud') return cloudLoginPage();
    const persona = (uidv, note) => { const u = byId(S.users, uidv); return `<button class="persona" data-act="login-as" data-id="${u.id}"><span class="avatar">${initials(u.name)}</span><span><b>${esc(u.name)}</b><div class="meta">${ROLES[u.role]} · ${note}</div></span></button>`; };
    return `<div class="login">
      <div class="login-l"><div class="brand" style="border:0;padding:0">${brandMark()}<div><b>gestaovia</b><span>Gestão de frota e posse de veículos</span></div></div>
        <div><h1 style="font-size:26px">Entrar</h1><p class="muted" style="margin-top:4px">Use seu e-mail corporativo.</p></div>
        <form id="login-form" class="stack" style="max-width:380px;gap:12px">
          <label class="field"><span>E-mail</span><input class="inp" name="email" type="email" autocomplete="username" value="ana.ribeiro@empresa.com.br"></label>
          <label class="field"><span>Senha</span><input class="inp" name="pass" type="password" autocomplete="current-password" value="demonstracao"></label>
          <p class="err" id="login-err"></p><button class="btn pri lg">Entrar</button>
        </form>
        <p class="small muted">Demonstração: os dados ficam só neste navegador.</p>${cloudConfigured() ? `<button class="btn" data-act="cl-back">${ic('key')}Entrar com meu usuário</button>` : ''}</div>
      <div class="login-r"><div><p class="label">Perfis de demonstração</p><h2 style="margin-top:4px">Entre como um destes usuários</h2></div>
        <div class="stack" style="gap:8px">
          ${persona('u_gestor', 'visão completa e transferência forçada')}
          ${persona('u_d1', 'está com o ABC1D23 na Obra 15')}
          ${persona('u_d8', 'sem veículo: pode receber o MNO2P34')}
          ${persona('u_d6', 'tem pedido de transferência do BRA2E19')}
          ${persona('u_d7', 'aguarda o BRA2E19')}
          ${persona('u_sup', 'acompanhamento, sem ações administrativas')}
          ${persona('u_admin', 'regras, usuários e integrações')}
        </div>
        <p class="small muted">Para testar a transferência: entre como Tiago, escaneie o ABC1D23 e solicite; alterne para João no topo e faça a entrega; volte a Tiago e faça o recebimento.</p></div></div>`;
  },
  mount() {
    if (APP_MODE === 'cloud') return mountCloudLogin();
    $('#login-form').addEventListener('submit', e => { e.preventDefault(); const d = formData(e.target); const u = S.users.find(x => x.email.toLowerCase() === d.email.toLowerCase()); if (!u) return $('#login-err').textContent = 'E-mail não encontrado. Use um dos perfis de demonstração ao lado.'; if (u.active === false) return $('#login-err').textContent = 'Acesso inativo. Procure a gestão da frota.'; doLogin(u); });
  }
};
ACTIONS['login-as'] = a => doLogin(byId(S.users, a.dataset.id));
function doLogin(u) { CUR = u; try { sessionStorage.setItem('vialink-user', u.id); } catch (e) { } go(homePage()); }

/* ---------- Inicialização ---------- */
function boot() {
  let demo = false; try { demo = sessionStorage.getItem('vialink-mode') === 'demo'; } catch (x) { }
  if (cloudConfigured() && !demo) return CLOUD.boot();
  load();
  try { const id = sessionStorage.getItem('vialink-user'); if (id) CUR = byId(S.users, id); } catch (e) { }
  ROUTE = { page: CUR ? homePage() : 'login', p: {} };
  try { history.replaceState(ROUTE, ''); } catch (e) { }
  render();
  TC.start().then(() => TC.paint());
}
boot();
