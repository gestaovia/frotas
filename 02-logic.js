/* ===================== Regras de negócio ===================== */
const drv = id => byId(S.drivers, id);
const veh = id => byId(S.vehicles, id);
const prj = id => byId(S.projects, id);
const ccOf = id => byId(S.costCenters, id);
const userName = uidv => { if (!uidv || uidv === 'sistema') return 'Sistema'; const u = byId(S.users, uidv); return u ? u.name : (isUUID(uidv) ? 'Equipe da frota' : uidv); };

// A posse é a fonte de verdade da responsabilidade
const activeCustody = vid => S.custody.find(c => c.vehicleId === vid && !c.end) || null;
const driverCustodies = did => S.custody.filter(c => c.driverId === did && !c.end);
const custodyAt = (vid, ts) => S.custody.find(c => c.vehicleId === vid && c.start <= ts && (!c.end || ts < c.end)) || null;
const segmentAt = (c, ts) => c ? (c.segments.filter(s => s.at <= ts).at(-1) || null) : null;
const currentSegment = c => c ? (c.segments.at(-1) || null) : null;
const activeTransfer = vid => S.transfers.find(t => t.vehicleId === vid && !['concluida', 'cancelada'].includes(t.status)) || null;
const openIssues = vid => S.issues.filter(i => i.vehicleId === vid && i.status === 'aberta');
const vehicleByPlate = p => S.vehicles.find(v => v.plate === String(p).toUpperCase().replace(/[^A-Z0-9]/g, ''));

function vStatus(v) {
  const iss = openIssues(v.id);
  if (iss.some(i => !i.canRun)) return 'bloqueado';
  if (v.maintenance) return 'manutencao';
  if (activeTransfer(v.id)) return 'aguardando_transferencia';
  if (iss.some(i => ['alta', 'critica'].includes(i.severity))) return 'pendencia';
  const c = activeCustody(v.id);
  if (c) {
    const loc = S.locations[v.id];
    if (loc && v.tracker) { if (loc.speed > 5) return 'deslocamento'; if (!loc.ignition) return 'parado'; }
    return 'em_uso';
  }
  return 'disponivel';
}
function dailyDoneToday(vid) {
  const c = activeCustody(vid); if (!c) return null;
  return S.checklists.find(k => k.vehicleId === vid && k.custodyId === c.id && ['diario', 'recebimento'].includes(k.type) && isToday(k.at)) || null;
}
function needsDaily(v) { const c = activeCustody(v.id); return !!c && !v.maintenance && !dailyDoneToday(v.id); }
function lastChecklist(vid) { return S.checklists.filter(k => k.vehicleId === vid).sort((a, b) => b.at - a.at)[0] || null; }

/* ----- manutenção ----- */
function planState(p) {
  const v = veh(p.vehicleId); const m = S.settings.maint;
  let lvl = 'normal', remKm = null, nextKm = null, nextDate = null, remDays = null;
  const rank = l => M_LEVEL[l].r;
  if (p.everyKm && p.lastKm != null) {
    nextKm = p.lastKm + p.everyKm; remKm = nextKm - v.odometer;
    const l = remKm <= 0 ? 'vencido' : remKm <= m.urgentKm ? 'urgente' : remKm <= m.attentionKm ? 'atencao' : 'normal';
    if (rank(l) > rank(lvl)) lvl = l;
  }
  if (p.everyDays && p.lastDate) {
    nextDate = p.lastDate + p.everyDays * DAY; remDays = Math.floor((nextDate - startOfDay(nowTs())) / DAY);
    const l = remDays < 0 ? 'vencido' : remDays <= m.urgentDays ? 'urgente' : remDays <= m.attentionDays ? 'atencao' : 'normal';
    if (rank(l) > rank(lvl)) lvl = l;
  }
  return { lvl, remKm, nextKm, nextDate, remDays };
}
function vehicleMaint(vid) {
  const items = S.plans.filter(p => p.vehicleId === vid).map(p => ({ p, s: planState(p) })).sort((a, b) => M_LEVEL[b.s.lvl].r - M_LEVEL[a.s.lvl].r || (a.s.remKm ?? 1e9) - (b.s.remKm ?? 1e9));
  const worst = items[0]?.s.lvl || 'normal';
  const next = items.filter(x => x.s.remKm != null).sort((a, b) => a.s.remKm - b.s.remKm)[0] || null;
  return { items, worst, next };
}

/* ----- abastecimento ----- */
function fuelMetrics(f) {
  const prev = S.fuel.filter(x => x.vehicleId === f.vehicleId && x.at < f.at).sort((a, b) => b.at - a.at)[0];
  const v = veh(f.vehicleId);
  if (!prev) return { dist: null, kmL: null, costKm: null, delta: null, avg: v.avgKmL };
  const dist = f.km - prev.km;
  const kmL = dist > 0 ? dist / f.liters : null;
  const costKm = dist > 0 ? f.total / dist : null;
  const avg = vehicleAvgKmL(f.vehicleId, f.at) || v.avgKmL;
  const delta = kmL ? (kmL - avg) / avg * 100 : null;
  return { dist, kmL, costKm, delta, avg };
}
function vehicleAvgKmL(vid, before = Infinity) {
  const fs = S.fuel.filter(x => x.vehicleId === vid && x.at < before).sort((a, b) => a.at - b.at);
  if (fs.length < 3) return veh(vid).avgKmL;
  const first = fs[0], last = fs.at(-1);
  const liters = sum(fs.slice(1), x => x.liters);
  return liters > 0 ? (last.km - first.km) / liters : veh(vid).avgKmL;
}
const fuelOutlier = f => { const m = fuelMetrics(f); return m.delta != null && Math.abs(m.delta) > S.settings.fuelDeviationPct ? m : null; };

/* ----- cruzamento pedágio / multa com a posse ----- */
function matchAt(plate, ts) {
  const v = vehicleByPlate(plate); if (!v) return { v: null };
  const c = custodyAt(v.id, ts);
  if (!c) return { v, c: null };
  const sg = segmentAt(c, ts);
  return { v, c, driverId: c.driverId, projectId: sg?.projectId || null, ccId: sg?.ccId || null };
}
function tollMatch(t) {
  if (t.manual) return { ...t.manual, how: 'manual' };
  const m = matchAt(t.plate, t.at);
  if (!m.c) return { how: 'sem', vehicleId: m.v?.id };
  return { how: 'auto', vehicleId: m.v.id, driverId: m.driverId, projectId: m.projectId, ccId: m.ccId, custodyId: m.c.id };
}
function fineMatch(f) {
  const m = matchAt(f.plate, f.at);
  if (f.manualDriverId) return { how: 'manual', vehicleId: m.v?.id, driverId: f.manualDriverId, projectId: f.manualProjectId || m.projectId, custodyId: m.c?.id };
  if (!m.c) return { how: 'sem', vehicleId: m.v?.id };
  return { how: 'auto', vehicleId: m.v.id, driverId: m.driverId, projectId: m.projectId, custodyId: m.c.id, custody: m.c };
}

/* ----- custos e indicadores ----- */
function periodCosts(from, to) {
  const inP = t => t >= from && t < to;
  const rows = [];
  S.fuel.filter(f => inP(f.at)).forEach(f => rows.push({ kind: 'Combustível', value: f.total, vehicleId: f.vehicleId, driverId: f.driverId, projectId: f.projectId }));
  S.tolls.filter(t => inP(t.at)).forEach(t => { const m = tollMatch(t); rows.push({ kind: 'Pedágios', value: t.value, vehicleId: m.vehicleId, driverId: m.driverId, projectId: m.projectId }); });
  S.fines.filter(f => inP(f.at)).forEach(f => { const m = fineMatch(f); rows.push({ kind: 'Multas', value: f.value, vehicleId: m.vehicleId, driverId: m.driverId, projectId: m.projectId }); });
  S.maintRecords.filter(r => inP(r.at)).forEach(r => { const c = custodyAt(r.vehicleId, r.at); rows.push({ kind: 'Manutenção', value: r.cost, vehicleId: r.vehicleId, driverId: null, projectId: c ? segmentAt(c, r.at)?.projectId : null }); });
  rows.push(...docCosts(from, to));
  return rows;
}
function kmInPeriod(from, to, filter = () => true) {
  // km rodados = soma dos trechos de posse dentro do período (proporcional quando a posse cruza o período)
  let total = 0;
  S.custody.filter(filter).forEach(c => {
    const end = c.end || nowTs(); const endKm = c.endKm ?? veh(c.vehicleId).odometer;
    const a = Math.max(c.start, from), b = Math.min(end, to);
    if (b <= a || end <= c.start) return;
    total += (endKm - c.startKm) * (b - a) / (end - c.start);
  });
  return total;
}
function groupSum(rows, key) { const m = {}; rows.forEach(r => { const k = r[key] || '_'; m[k] = (m[k] || 0) + r.value; }); return m; }

/* ----- índice de conformidade do condutor (métricas configuradas pelo gestor) ----- */
const CRITERIA = {
  checklist: { l: 'Checklists e registros', d: 'Checklists diários feitos no prazo' },
  conservacao: { l: 'Conservação do veículo', d: 'Avarias não comunicadas e limpeza' },
  abastecimento: { l: 'Abastecimentos', d: 'Registros completos com cupom e km' },
  infracoes: { l: 'Sem infrações', d: 'Multas no período' },
  procedimentos: { l: 'Procedimentos', d: 'Transferências, obra vinculada e telemetria' }
};
function driverScore(did, from = startOfMonth(nowTs()), to = nowTs()) {
  const cfg = S.settings.score; const C = cfg.criteria; const P = cfg.penalties; const d = drv(did);
  const cs = S.custody.filter(c => c.driverId === did && c.start < to && (!c.end || c.end > from));
  let req = 0, done = 0, late = 0;
  cs.forEach(c => {
    for (let day = startOfDay(Math.max(c.start, from)); day <= startOfDay(Math.min(c.end || to, to)); day += DAY) {
      if (new Date(day).getDay() === 0) continue;
      req++;
      const k = S.checklists.find(k => k.custodyId === c.id && ['diario', 'recebimento'].includes(k.type) && startOfDay(k.at) === day);
      if (k) { done++; if (k.late) late++; }
    }
  });
  const ratio = { checklist: req ? Math.max(0, (done - late * (P.atraso / 100)) / req) : 1 };
  const fulls = S.checklists.filter(k => k.driverId === did && k.at >= from && k.at < to && k.items);
  const dirty = fulls.filter(k => k.items.limpeza === 'ruim').length;
  const avarias = d.telemetry?.avarias || 0;
  const fuels = S.fuel.filter(f => f.driverId === did && f.at >= from && f.at < to);
  const okFuel = fuels.filter(f => f.receipt && f.km && f.liters && f.total).length;
  const fines = S.fines.filter(f => f.at >= from && f.at < to && fineMatch(f).driverId === did);
  const forced = S.transfers.filter(t => t.forced && t.fromDriverId === did && t.requestedAt >= from).length;
  const noProj = cs.filter(c => !c.segments.length).length;
  const tel = (S.trackerEvents || []).filter(e => e.driverId === did && e.at >= from && e.at < to && TELEMETRY_ALARMS.includes(e.type)).length;
  const pen = {
    conservacao: avarias * P.avaria + dirty * P.limpeza,
    infracoes: sum(fines, f => P[f.gravity] ?? P.media),
    procedimentos: forced * P.forcada + noProj * P.semObra + tel * P.telemetria
  };
  const info = {
    checklist: req ? `${done} de ${req} diários · ${late} com atraso` : 'Sem posse no período',
    conservacao: `${avarias} avaria(s) não comunicada(s) · ${dirty} limpeza ruim`,
    abastecimento: fuels.length ? `${okFuel} de ${fuels.length} completos` : 'Sem abastecimentos',
    infracoes: fines.length ? `${fines.length} multa(s)` : 'Nenhuma multa',
    procedimentos: `${forced} forçada(s) · ${noProj} sem obra · ${tel} alerta(s) do rastreador`
  };
  const parts = Object.entries(C).filter(([, c]) => c.on).map(([k, c]) => {
    let v;
    if (k === 'checklist') v = c.weight * ratio.checklist;
    else if (k === 'abastecimento') v = fuels.length ? c.weight * okFuel / fuels.length : c.weight;
    else v = Math.max(0, c.weight - pen[k]);
    return { k, l: CRITERIA[k].l, v, max: c.weight, info: info[k] };
  });
  const maxT = sum(parts, p => p.max) || 100;
  const total = sum(parts, p => p.v) / maxT * 100;
  return { total, bonus: bonusFor(total), tier: tierFor(total), parts, req, done, late, fines };
}
function tierFor(score) { const t = [...S.settings.score.tiers].sort((a, b) => b.min - a.min).find(t => score >= t.min); return t || null; }
function bonusFor(score) {
  const cfg = S.settings.score;
  if (cfg.mode === 'faixas') return tierFor(score)?.value || 0;
  return score >= cfg.minScore ? cfg.maxBonus * score / 100 : 0;
}
/* cor da pontuação: verde (faixa máxima), amarelo, laranja (faixa mínima), vermelho (sem prêmio).
   Usa as 3 primeiras faixas configuradas; sem elas, 90/80/70. */
function scoreCuts() {
  const t = (S.settings.score.tiers || []).map(x => +x.min).filter(n => n > 0).sort((a, b) => b - a);
  return t.length >= 3 ? t.slice(0, 3) : [90, 80, 70];
}
function scoreTone(s) { const [a, b, c] = scoreCuts(); return s >= a ? 'ok' : s >= b ? 'warn' : s >= c ? 'urg' : 'bad'; }
const SCORE_VAR = { ok: '--u-green', warn: '--u-yellow', urg: '--u-orange', bad: '--u-red' };
const scoreColor = s => `var(${SCORE_VAR[scoreTone(s)]})`;
const pctTone = (v, max) => scoreTone(max ? v / max * 100 : 0);

/* ----- locação ----- */
function rentalState(v) {
  if (v.ownership !== 'locada' || !v.rental || v.rental.status !== 'ativa') return null;
  const days = Math.floor((v.rental.dueDate - startOfDay(nowTs())) / DAY);
  const R = S.settings.rental;
  const lvl = days < 0 ? 'vencido' : days <= R.urgentDays ? 'urgente' : days <= R.warnDays ? 'atencao' : 'normal';
  return { days, lvl };
}

/* ----- projeção de manutenção pelo uso médio ----- */
function avgDailyKm(vid) {
  const now = nowTs(); const km = kmInPeriod(now - 30 * DAY, now, c => c.vehicleId === vid);
  return km > 100 ? km / 30 : 45;
}
function planDue(p) {
  const s = planState(p); const today = startOfDay(nowTs());
  let date = null, basis = '';
  if (s.remKm != null) { const d = today + Math.max(0, Math.round(s.remKm / avgDailyKm(p.vehicleId))) * DAY; date = d; basis = 'km'; }
  if (s.nextDate != null && (date == null || s.nextDate < date)) { date = startOfDay(s.nextDate); basis = 'data'; }
  if (s.lvl === 'vencido' && date > today) date = today;
  return { ...s, date, basis };
}

/* ----- lista "Atenção necessária" ----- */
function attentionItems() {
  const out = [];
  const [dh, dm] = S.settings.dailyDeadline.split(':').map(Number);
  const pastDeadline = new Date().getHours() * 60 + new Date().getMinutes() > dh * 60 + dm;
  S.issues.filter(i => i.status === 'aberta').forEach(i => {
    const v = veh(i.vehicleId);
    out.push({ c: i.severity === 'critica' || !i.canRun ? 'bad' : i.severity === 'alta' ? 'urg' : 'warn', r: i.severity === 'critica' ? 10 : 6, icon: 'alert', title: `${v.plate} · ${i.type}`, sub: `Problema ${SEVERITY[i.severity].l.toLowerCase()}${i.canRun ? '' : ' · bloqueado'}`, text: `Veículo ${v.plate} possui problema ${SEVERITY[i.severity].l.toLowerCase()}: ${i.type}.`, at: i.at, go: { page: 'veiculo', id: v.id } });
  });
  S.vehicles.forEach(v => {
    const c = activeCustody(v.id);
    if (c && !c.segments.length) out.push({ c: 'urg', r: 7, icon: 'pin', title: `${v.plate} sem obra`, sub: drv(c.driverId).name, text: `Veículo ${v.plate} está sem obra vinculada.`, at: c.start, go: { page: 'veiculo', id: v.id } });
    if (needsDaily(v)) out.push({ c: pastDeadline ? 'urg' : 'warn', r: pastDeadline ? 5 : 3, icon: 'check', title: `${v.plate} sem checklist hoje`, sub: `${drv(c.driverId).name}${pastDeadline ? ` · prazo ${S.settings.dailyDeadline}` : ''}`, text: `Veículo ${v.plate} está sem checklist hoje.`, at: null, go: { page: 'veiculo', id: v.id } });
    vehicleMaint(v.id).items.filter(x => ['urgente', 'vencido'].includes(x.s.lvl)).forEach(({ p, s }) => {
      const sub = s.lvl === 'vencido' ? (s.remKm != null && s.remKm <= 0 ? `Vencida há ${nf(-s.remKm)} km` : `Vencida há ${-s.remDays} dias`) : (s.remKm != null && s.remKm <= S.settings.maint.urgentKm ? `Faltam ${nf(s.remKm)} km` : `Faltam ${s.remDays} dias`);
      out.push({ c: M_LEVEL[s.lvl].c, r: s.lvl === 'vencido' ? 8 : 4, icon: 'wrench', title: `${v.plate} · ${p.item}`, sub, text: `Veículo ${v.plate}: ${p.item} — ${sub.toLowerCase()}.`, at: null, go: { page: 'calendario', vid: v.id } });
    });
    const rs = rentalState(v);
    if (rs && rs.lvl !== 'normal') out.push({ c: M_LEVEL[rs.lvl].c, r: rs.lvl === 'vencido' ? 9 : rs.lvl === 'urgente' ? 6 : 2, icon: 'key', title: `${v.plate} · locação`, sub: rs.days < 0 ? `Devolução vencida há ${-rs.days} dias` : rs.days === 0 ? 'Devolver ou renovar hoje' : `Devolver ou renovar em ${rs.days} dias`, text: `Locação do ${v.plate} vence em ${rs.days} dias.`, at: null, go: { page: 'veiculo', id: v.id } });
  });
  S.transfers.filter(t => !['concluida', 'cancelada'].includes(t.status)).forEach(t => {
    const age = nowTs() - t.requestedAt; const late = age > S.settings.transferAlertHours * 36e5;
    const who = ['solicitada', 'aguardando_entrega', 'entrega_andamento'].includes(t.status) ? drv(t.fromDriverId).name : drv(t.toDriverId).name;
    out.push({ c: late ? 'urg' : 'warn', r: late ? 6 : 3, icon: 'swap', title: `${veh(t.vehicleId).plate} · transferência`, sub: `${who} · ${T_LABEL[t.status].toLowerCase()} há ${dur(age)}`, text: `Condutor ${who} possui transferência pendente.`, at: t.requestedAt, go: { page: 'transferencia', id: t.id } });
  });
  (S.trackerEvents || []).filter(e => nowTs() - e.at < DAY && ['overspeed', 'sos', 'powerCut', 'tampering'].includes(e.type)).forEach(e => out.push({ c: e.type === 'overspeed' ? 'urg' : 'bad', r: e.type === 'overspeed' ? 4 : 9, icon: 'gauge', title: `${veh(e.vehicleId).plate} · ${ALARM_LABEL[e.type]}`, sub: `${e.speed ? e.speed + ' km/h · ' : ''}${e.driverId ? drv(e.driverId).name : 'sem condutor'}`, text: '', at: e.at, go: { page: 'veiculo', id: e.vehicleId } }));
  S.fuel.filter(f => nowTs() - f.at < 7 * DAY).forEach(f => { const m = fuelOutlier(f); if (m && m.delta < 0) out.push({ c: 'warn', r: 2, icon: 'fuel', title: `${veh(f.vehicleId).plate} · consumo alto`, sub: `${nf(m.kmL, 1)} km/l (${nf(m.delta, 0)}% da média)`, text: '', at: f.at, go: { page: 'abastecimento' } }); });
  const unT = S.tolls.filter(t => tollMatch(t).how === 'sem').length;
  if (unT) out.push({ c: 'warn', r: 1, icon: 'toll', title: `${unT} pedágio(s) sem condutor`, sub: 'Aguardam ajuste manual', text: '', at: null, go: { page: 'pedagios', f: 'sem' } });
  const unF = S.fines.filter(f => fineMatch(f).how === 'sem').length;
  if (unF) out.push({ c: 'warn', r: 1, icon: 'fine', title: `${unF} multa(s) sem condutor`, sub: 'Sem posse no horário', text: '', at: null, go: { page: 'multas' } });
  out.push(...docAttention());
  return out.sort((a, b) => b.r - a.r);
}
function fleetCounts() {
  const st = S.vehicles.map(v => ({ v, s: vStatus(v) }));
  return {
    total: S.vehicles.length,
    emUso: S.vehicles.filter(v => activeCustody(v.id)).length,
    disp: st.filter(x => x.s === 'disponivel').length,
    manut: S.vehicles.filter(v => v.maintenance).length,
    manutVenc: S.vehicles.filter(v => vehicleMaint(v.id).worst === 'vencido').length,
    pend: S.vehicles.filter(v => openIssues(v.id).length).length,
    semCk: S.vehicles.filter(needsDaily).length,
    semObra: S.vehicles.filter(v => { const c = activeCustody(v.id); return c && !c.segments.length; }).length,
    locados: S.vehicles.filter(v => v.ownership === 'locada' && v.rental?.status === 'ativa').length,
    locVence: S.vehicles.filter(v => { const r = rentalState(v); return r && r.lvl !== 'normal'; }).length
  };
}

/* ----- última localização registrada (celular do condutor no checklist) ----- */
function lastLocation(vid) {
  // posição mais recente entre o rastreador (Traccar) e o celular do condutor no checklist
  const k = S.checklists.filter(x => x.vehicleId === vid && x.location).sort((a, b) => b.at - a.at)[0];
  const t = S.locations[vid]; const v = veh(vid);
  const fromT = t && v?.tracker && S.settings.traccar?.mode !== 'off' ? { lat: t.lat, lng: t.lng, at: t.at, source: 'rastreador', what: `Rastreador${t.speed > 3 ? ` · ${t.speed} km/h` : t.ignition ? ' · ligado' : ' · parado'}`, driverId: null } : null;
  const fromK = k ? { lat: k.location.lat, lng: k.location.lng, at: k.at, source: k.location.source, what: `Checklist ${CK_TYPES[k.type].toLowerCase()}`, driverId: k.driverId } : null;
  if (fromT && (!fromK || fromT.at >= fromK.at)) return fromT;
  return fromK || fromT;
}


/* ----- localização ----- */
function currentLocation(vid) {
  const l = S.locations[vid]; if (!l) return null;
  return { lat: l.lat, lng: l.lng, source: 'rastreador', at: l.at };
}
function nearestPlace(l) {
  if (!l) return 'Sem rastreador';
  let best = null, bd = 1e9;
  S.projects.forEach(p => { const d = Math.hypot(p.lat - l.lat, (p.lng - l.lng) * .92) * 111; if (d < bd) { bd = d; best = p; } });
  if (bd < 1.2) return best.code === 'Matriz' ? 'Matriz (pátio)' : `${best.code} (canteiro)`;
  if (Math.abs(l.lat + 22.872) < .004 && Math.abs(l.lng + 47.098) < .004) return 'Oficina Mecânica Alvorada';
  return `${nf(bd, 1)} km de ${best.code}`;
}
// simulação do rastreador: veículos com ignição ligada andam um pouco a cada ciclo
function tickTelemetry() {
  S.vehicles.forEach(v => {
    const l = S.locations[v.id]; if (!l || !v.tracker || !activeCustody(v.id) || v.maintenance || openIssues(v.id).some(i => !i.canRun)) return;
    if (!l.ignition) { if (Math.random() < .08) { l.ignition = true; l.speed = 0; } l.at = nowTs(); return; }
    const seg = currentSegment(activeCustody(v.id)); const p = seg ? prj(seg.projectId) : null;
    const tgt = p || { lat: -22.9, lng: -47.06 };
    const dLat = tgt.lat - l.lat, dLng = tgt.lng - l.lng, dist = Math.hypot(dLat, dLng);
    if (dist < .004) { l.speed = 0; if (Math.random() < .5) l.ignition = false; }
    else {
      const step = Math.min(dist, .003 + Math.random() * .004);
      l.lat += dLat / dist * step + (Math.random() - .5) * .0015; l.lng += dLng / dist * step + (Math.random() - .5) * .0015;
      l.speed = Math.round(35 + Math.random() * 55);
      const inc = Math.round(step * 111 * 1.3);
      v.odometer += inc; l.km = v.odometer;
    }
    l.at = nowTs();
  });
}
