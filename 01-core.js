/* ===================== Núcleo: utilitários, estado e dados de exemplo ===================== */
const DAY = 864e5, MIN = 6e4;
const STORE_KEY = 'vialink-frota-proto-v4';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (window.crypto?.randomUUID ? crypto.randomUUID() : p + '_' + Math.random().toString(36).slice(2, 11));
const pad = n => String(n).padStart(2, '0');
const nowTs = () => Date.now();
const fmtDate = t => { if (!t) return '—'; const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtTime = t => { if (!t) return '—'; const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDT = t => t ? `${fmtDate(t)} às ${fmtTime(t)}` : '—';
const fmtShort = t => { if (!t) return '—'; const d = new Date(t); return isToday(t) ? `hoje ${fmtTime(t)}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${fmtTime(t)}`; };
const nf = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const km = n => n == null ? '—' : nf(n) + ' km';
const money = n => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isToday = t => startOfDay(t) === startOfDay(nowTs());
const startOfMonth = t => { const d = new Date(t); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dur = ms => { if (ms < 0) ms = 0; const m = Math.floor(ms / MIN); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); if (h < 48) return `${h} h ${pad(m % 60)} min`; return `${Math.floor(h / 24)} dias`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const sum = (a, f = x => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const byId = (arr, id) => arr.find(x => x.id === id);

/* ----- rótulos ----- */
const ROLES = { admin: 'Administrador', gestor: 'Gestor de Frota', supervisor: 'Supervisor', condutor: 'Condutor' };
const V_STATUS = {
  disponivel: { l: 'Disponível', c: 'ok' }, em_uso: { l: 'Em uso', c: 'neu' }, deslocamento: { l: 'Em deslocamento', c: 'neu' },
  parado: { l: 'Parado', c: 'gray' }, aguardando_transferencia: { l: 'Aguardando transferência', c: 'warn' },
  manutencao: { l: 'Em manutenção', c: 'gray' }, bloqueado: { l: 'Bloqueado', c: 'bad' }, pendencia: { l: 'Com pendência', c: 'warn' }
};
const T_STATUS = [
  ['posse', 'Posse ativa'], ['solicitada', 'Transferência solicitada'], ['aguardando_entrega', 'Aguardando entrega'],
  ['entrega_andamento', 'Checklist de entrega em andamento'], ['aguardando_recebimento', 'Aguardando recebimento'],
  ['recebimento_andamento', 'Checklist de recebimento em andamento'], ['concluida', 'Transferência concluída']
];
const T_LABEL = Object.fromEntries([...T_STATUS, ['cancelada', 'Cancelada']]);
const CK_TYPES = {
  recebimento: 'Recebimento', entrega: 'Entrega', devolucao: 'Devolução', diario: 'Diário',
  manut_entrada: 'Entrada em manutenção', manut_saida: 'Saída de manutenção', avaria: 'Registro de avaria'
};
const CK_ITEMS = [
  ['pneus', 'Estado dos pneus'], ['farois', 'Faróis e lanternas'], ['vidros', 'Vidros'], ['retrovisores', 'Retrovisores'],
  ['lataria', 'Lataria'], ['limpeza', 'Limpeza'], ['estepe', 'Estepe'], ['ferramentas', 'Ferramentas (macaco, chave, triângulo)'], ['documentacao', 'Documentação (CRLV)']
];
const PHOTO_SLOTS = [['frontal', 'Frontal'], ['traseira', 'Traseira'], ['lat_dir', 'Lateral direita'], ['lat_esq', 'Lateral esquerda'], ['painel', 'Painel com hodômetro']];
const FUEL_LEVELS = ['Reserva', '1/4', '1/2', '3/4', 'Cheio'];
const PURPOSES = ['Deslocamento para obra', 'Transporte de equipe', 'Transporte de materiais', 'Visita técnica', 'Serviço administrativo', 'Retorno à matriz'];
const PROBLEM_TYPES = ['Freios', 'Pneus', 'Motor', 'Elétrica / painel', 'Iluminação', 'Lataria / avaria', 'Vazamento', 'Suspensão / direção', 'Documentação', 'Outro'];
const SEVERITY = { baixa: { l: 'Baixa', c: 'gray' }, media: { l: 'Média', c: 'warn' }, alta: { l: 'Alta', c: 'urg' }, critica: { l: 'Crítica', c: 'bad' } };
const MAINT_ITEMS = ['Troca de óleo', 'Filtros', 'Alinhamento', 'Balanceamento', 'Pneus', 'Revisão', 'Correia dentada', 'Freios', 'Bateria', 'Outros'];
const M_LEVEL = { normal: { l: 'Normal', c: 'gray', r: 0 }, atencao: { l: 'Atenção', c: 'warn', r: 1 }, urgente: { l: 'Urgente', c: 'urg', r: 2 }, vencido: { l: 'Vencido', c: 'bad', r: 3 } };
const FINE_TYPES = { leve: 88.38, media: 130.16, grave: 195.23, gravissima: 293.47 };

/* ----- gerador determinístico ----- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ----- estado ----- */
let S = null;
function save() {
  if (APP_MODE === 'cloud') { if (CLOUD.on) CLOUD.queue(); return; }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) {
    try { // sem espaço: remove fotos reais mais antigas e tenta de novo
      const withPhotos = S.checklists.filter(c => c.photos && Object.values(c.photos).some(p => p && p.startsWith('data:')));
      withPhotos.slice(0, Math.ceil(withPhotos.length / 2)).forEach(c => Object.keys(c.photos).forEach(k => { if (c.photos[k]?.startsWith('data:')) c.photos[k] = 'removida:' + k; }));
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch (e2) { /* armazenamento indisponível: segue em memória */ }
  }
}
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const d = JSON.parse(raw); if (d && (d.version >= 4 && d.version <= 6)) { S = migrate(d); return; } } } catch (e) { }
  S = seed();
  save();
}
function resetDemo() { S = seed(); save(); }
// V5: integração Traccar (vínculo de dispositivos e alertas de condução vindos do rastreador)
function migrate(D) {
  if (!(D.version >= 5 && D.settings.traccar)) migrateV5(D);
  if (D.version < 6) { seedDocs(D); D.version = 6; }
  return D;
}
function migrateV5(D) {
  D.settings.traccar = D.settings.traccar || { mode: 'simulador', url: '', token: '', live: true, pollSec: 30, odometer: true, speedLimit: 100 };
  let n = 0;
  D.vehicles.forEach((v, i) => { if (v.tracker && !v.traccarId) { v.traccarId = 101 + i; v.traccarUniqueId = '8604' + String(1000000000 + ((i + 3) * 482711733) % 9000000000).slice(0, 11); } });
  Object.entries(D.locations).forEach(([vid, l]) => { const v = D.vehicles.find(x => x.id === vid); if (v?.traccarId) { l.source = 'traccar'; l.at = Math.max(l.at, nowTs() - 3 * MIN); } });
  // alertas de condução do mês (antes simulados em d.telemetry) viram eventos do rastreador
  D.trackerEvents = D.trackerEvents || [];
  const m0 = startOfMonth(nowTs());
  D.drivers.forEach(d => {
    const t = d.telemetry || {}; const cs = D.custody.filter(c => c.driverId === d.id && (!c.end || c.end > m0) && D.vehicles.find(v => v.id === c.vehicleId)?.tracker);
    const list = [...Array(t.speeding || 0).fill('overspeed'), ...Array(t.harsh || 0).fill('hardBraking')];
    list.forEach((type, k) => {
      const c = cs[k % Math.max(1, cs.length)]; if (!c) return;
      const a = Math.max(c.start, m0), b = Math.min(c.end || nowTs(), nowTs()); let at = a + (b - a) * ((k * 37 % 90) + 5) / 100;
      at = startOfDay(at) + (8 * 60 + (k * 97) % 540) * MIN; if (at > b) at = b - 30 * MIN; if (at < a) at = a + 20 * MIN;
      D.trackerEvents.push({ id: 'tev_seed' + (n++), extId: null, vehicleId: c.vehicleId, driverId: d.id, type, at: Math.round(at), speed: type === 'overspeed' ? 106 + (k * 7) % 17 : null });
    });
    t.harsh = 0; t.speeding = 0;
  });
  D.version = 5;
}

function log(type, text, o = {}) {
  S.audit.push({ id: uid('log'), at: o.at || nowTs(), type, text, vehicleId: o.vehicleId || null, driverId: o.driverId || null, userId: o.userId ?? (CUR?.id || 'sistema'), data: o.data || null });
}
function notify(to, text, o = {}) {
  S.notifications.push({ id: uid('ntf'), to, text, at: o.at || nowTs(), read: false, level: o.level || 'info', link: o.link || null });
}

/* ===================== Dados de exemplo ===================== */
function seed() {
  const R = rng(20260924);
  const r = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.round(r(a, b));
  const pick = a => a[Math.floor(R() * a.length)];
  const today0 = startOfDay(nowTs());
  let clampN = 0;
  const T = (day, hh, mm) => { let t = today0 + day * DAY + hh * 36e5 + mm * MIN; if (t > nowTs() - MIN) t = nowTs() - (++clampN) * 7 * MIN; return t; };

  const D = {
    version: 4, seededAt: nowTs(),
    settings: {
      dailyDeadline: '10:00', transferAlertHours: 4, oneVehiclePerDriver: true, requirePhotos: true,
      maint: { attentionKm: 1500, urgentKm: 500, attentionDays: 30, urgentDays: 7 },
      fuelDeviationPct: 15,
      score: {
        criteria: {
          checklist: { on: true, weight: 30 }, conservacao: { on: true, weight: 20 }, abastecimento: { on: true, weight: 15 },
          infracoes: { on: true, weight: 20 }, procedimentos: { on: true, weight: 15 }
        },
        penalties: { atraso: 50, avaria: 5, limpeza: 2, leve: 3, media: 5, grave: 8, gravissima: 12, forcada: 5, semObra: 5, telemetria: 2 },
        mode: 'faixas', minScore: 70, maxBonus: 300,
        tiers: [{ min: 90, value: 300 }, { min: 80, value: 200 }, { min: 70, value: 100 }]
      },
      rental: { warnDays: 30, urgentDays: 7 },
      tracker: { enabled: true, provider: 'Rastreador (a definir)', endpoint: '/api/tracker/positions', interval: 60 }
    },
    costCenters: [
      { id: 'cc1015', code: '1015', name: 'Obras de Subestação' }, { id: 'cc1022', code: '1022', name: 'Montagem Elétrica' },
      { id: 'cc1031', code: '1031', name: 'Manutenção Industrial' }, { id: 'cc2000', code: '2000', name: 'Administrativo / Matriz' }
    ],
    projects: [
      { id: 'p15', code: 'Obra 15', name: 'SE 138 kV – Distrito Industrial', ccId: 'cc1015', lat: -22.815, lng: -47.165, active: true },
      { id: 'p22', code: 'Obra 22', name: 'Montagem elétrica – CD Logístico Anhanguera', ccId: 'cc1022', lat: -23.035, lng: -46.975, active: true },
      { id: 'p31', code: 'Obra 31', name: 'Retrofit de iluminação – Planta Norte', ccId: 'cc1031', lat: -22.760, lng: -47.005, active: true },
      { id: 'p09', code: 'Obra 09', name: 'Painéis de média tensão – Fábrica Sul', ccId: 'cc1022', lat: -22.985, lng: -47.215, active: true },
      { id: 'pmat', code: 'Matriz', name: 'Base administrativa e pátio', ccId: 'cc2000', lat: -22.905, lng: -47.062, active: true }
    ],
    drivers: [], users: [], vehicles: [], qrcodes: [], custody: [], transfers: [], checklists: [], fuel: [], plans: [], maintRecords: [],
    tolls: [], fines: [], locations: {}, issues: [], notifications: [], audit: []
  };
  const names = ['João Silva', 'Carlos Santos', 'Pedro Lima', 'Rafael Souza', 'Lucas Almeida', 'Marina Costa', 'Tiago Ramos', 'Bruno Ferreira', 'Carla Mendes'];
  const extra = { d4: { avarias: 1, harsh: 1, speeding: 0 }, d5: { avarias: 1, harsh: 2, speeding: 1 }, d2: { avarias: 0, harsh: 1, speeding: 0 }, d7: { avarias: 0, harsh: 0, speeding: 2 } };
  names.forEach((n, i) => {
    const id = 'd' + (i + 1);
    D.drivers.push({ id, name: n, cnh: String(40000000000 + i * 7919137).slice(0, 11), cnhCat: i % 3 === 0 ? 'D' : 'B', cnhExp: today0 + (200 + i * 97) * DAY, phone: `(19) 9${ri(8000, 9999)}-${ri(1000, 9999)}`, active: true, telemetry: extra[id] || { avarias: 0, harsh: 0, speeding: 0 } });
    D.users.push({ id: 'u_' + id, name: n, role: 'condutor', driverId: id, email: n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.') + '@empresa.com.br', active: true });
  });
  D.users.unshift(
    { id: 'u_gestor', name: 'Ana Ribeiro', role: 'gestor', email: 'ana.ribeiro@empresa.com.br', active: true },
    { id: 'u_sup', name: 'Marcos Vieira', role: 'supervisor', email: 'marcos.vieira@empresa.com.br', active: true },
    { id: 'u_admin', name: 'Paulo Andrade', role: 'admin', email: 'paulo.andrade@empresa.com.br', active: true }
  );
  const V = [
    ['v1', 'ABC1D23', 'Fiat', 'Strada Freedom 1.3', 2023, 'Gasolina', 11.8, 48210, true],
    ['v2', 'DEF4G56', 'Toyota', 'Hilux SRV 2.8', 2022, 'Diesel S10', 9.6, 86540, true],
    ['v3', 'JKL7H89', 'Volkswagen', 'Saveiro Robust 1.6', 2021, 'Gasolina', 10.9, 102330, true],
    ['v4', 'XYZ9A99', 'Renault', 'Master Furgão 2.3', 2022, 'Diesel S10', 8.7, 64120, true],
    ['v5', 'MNO2P34', 'Chevrolet', 'S10 LT 2.8', 2023, 'Diesel S10', 10.2, 35480, true],
    ['v6', 'QRS5T67', 'Fiat', 'Fiorino 1.4', 2020, 'Gasolina', 11.2, 118900, true],
    ['v7', 'GHI8J90', 'Mitsubishi', 'L200 Triton 2.4', 2021, 'Diesel S10', 9.1, 97250, true],
    ['v8', 'TUV3W45', 'Volkswagen', 'Gol 1.0', 2022, 'Gasolina', 13.4, 41200, false],
    ['v9', 'BRA2E19', 'Toyota', 'Corolla Cross XRE 2.0', 2024, 'Gasolina', 11.0, 22340, true]
  ];
  const price = { 'Gasolina': 6.29, 'Diesel S10': 6.09 };
  V.forEach(([id, plate, brand, model, year, fuelType, avg, odo, tracker]) => {
    const seats = { v1: 2, v2: 5, v3: 2, v4: 3, v5: 5, v6: 2, v7: 5, v8: 5, v9: 5 }[id];
    const rent = {
      v2: { company: 'Locadora Rota Sul', contract: 'LOC-2025-0418', pickup: -353, due: 12, monthly: 5890 },
      v4: { company: 'Movida Frotas Corporativas', contract: 'MV-77120', pickup: -178, due: 3, monthly: 4720 },
      v9: { company: 'Locadora Rota Sul', contract: 'LOC-2026-0102', pickup: -125, due: 58, monthly: 4380 },
      v8: { company: 'Unidas Empresas', contract: 'UN-55893', pickup: -366, due: -2, monthly: 2190 }
    }[id];
    D.vehicles.push({
      id, plate, brand, model, year, fuelType, avgKmL: avg, odometer: odo, tracker, seats, maintenance: false, maintenanceSince: null, maintenanceNote: '', active: true,
      ownership: rent ? 'locada' : 'propria',
      rental: rent ? { company: rent.company, contract: rent.contract, pickupDate: startOfDay(nowTs()) + rent.pickup * DAY, dueDate: startOfDay(nowTs()) + rent.due * DAY, monthly: rent.monthly, status: 'ativa', history: [] } : null
    });
    const tok = Array.from({ length: 16 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(R() * 32)]).join('');
    D.qrcodes.push({ id: 'qr_' + id, vehicleId: id, token: 'VLK1-' + tok, active: true, createdAt: today0 - 60 * DAY });
  });

  const dr = id => D.drivers.find(d => d.id === id);
  const veh = id => D.vehicles.find(v => v.id === id);
  const proj = id => D.projects.find(p => p.id === id);
  const L = (type, text, at, vehicleId, driverId, userId) => D.audit.push({ id: uid('log'), at, type, text, vehicleId, driverId, userId: userId || (driverId ? 'u_' + driverId : 'sistema') });

  // km inicial de cada veículo (60 dias atrás) — as posses somam até o hodômetro atual
  const current = { v1: ['d1', 0, 7, 32, 'p15'], v2: ['d2', -2, 7, 10, 'p22'], v3: ['d3', -1, 7, 5, 'p09'], v4: ['d4', -3, 8, 0, null], v7: ['d5', -1, 6, 55, 'p31'], v9: ['d6', -2, 7, 40, 'pmat'] };
  const projIds = ['p15', 'p22', 'p31', 'p09', 'pmat'];
  const tollPlaces = ['Praça Valinhos – SP-330 km 82', 'Praça Campinas – SP-348 km 72', 'Praça Jaguariúna – SP-340 km 127', 'Praça Sumaré – SP-348 km 99', 'Praça Itupeva – SP-300 km 70', 'Praça Paulínia – SP-332 km 128'];
  const lastFuelKm = {};

  function genCustody(v, driverId, start, end, startKm, dailyKm, projSeq, opts = {}) {
    const c = { id: uid('cus'), vehicleId: v.id, driverId, start, end, startKm, endKm: null, receiveChecklistId: null, deliverChecklistId: null, segments: [], closedReason: null, transferId: null, imported: !!opts.imported };
    const d = dr(driverId);
    // checklist de recebimento
    if (!opts.imported) {
      const ck = mkChecklist('recebimento', v, driverId, c.id, start - 3 * MIN, startKm, true);
      c.receiveChecklistId = ck.id;
      L('checklist', `Checklist de recebimento concluído (${nf(startKm)} km)`, start - 3 * MIN, v.id, driverId);
      L('posse_inicio', `${d.name} recebeu o veículo`, start, v.id, driverId);
    } else {
      L('posse_inicio', `Posse de ${d.name} importada do controle anterior (planilha), sem obra informada`, start, v.id, driverId, 'u_gestor');
    }
    if (projSeq[0]) {
      c.segments.push({ at: start, projectId: projSeq[0], ccId: proj(projSeq[0]).ccId, purpose: 'Deslocamento para obra', by: driverId });
      L('obra', `Vinculado à ${proj(projSeq[0]).code}`, start + 2 * MIN, v.id, driverId);
    }
    let kmNow = startKm;
    const lastDay = end ? startOfDay(end) : today0;
    for (let day = startOfDay(start); day <= lastDay; day += DAY) {
      const dow = new Date(day).getDay();
      const isStart = day === startOfDay(start);
      if (dow === 0 && !isStart) continue;
      const dayIsToday = day === today0;
      // checklist diário
      const skip = (driverId === 'd5' && (dayIsToday || R() < .25)) || (!isStart && R() < .06);
      if (!isStart && !skip) {
        const late = driverId === 'd4' ? R() < .5 : R() < .08;
        const at = Math.min(day + (late ? ri(10 * 60 + 20, 12 * 60) : ri(6 * 60 + 40, 8 * 60 + 30)) * MIN, dayIsToday ? nowTs() - 20 * MIN : Infinity);
        const ck = mkChecklist('diario', v, driverId, c.id, at, Math.round(kmNow), true);
        L('checklist', `Checklist diário: condições normais (${nf(Math.round(kmNow))} km)`, at, v.id, driverId);
      }
      // troca de obra no meio do dia
      if (projSeq.length > 1 && !isStart && R() < .18) {
        const p = pick(projSeq.filter(x => x !== c.segments.at(-1)?.projectId));
        if (p) { const at = Math.min(day + ri(10 * 60, 15 * 60) * MIN, dayIsToday ? nowTs() - 15 * MIN : Infinity); c.segments.push({ at, projectId: p, ccId: proj(p).ccId, purpose: pick(PURPOSES.slice(0, 4)), by: driverId }); L('obra', `Alteração para ${proj(p).code}`, at, v.id, driverId); }
      }
      // pedágios
      const seg = c.segments.at(-1);
      if (seg && ['p22', 'p15', 'p09'].includes(seg.projectId) && R() < .45 && dow !== 6) {
        const n = R() < .4 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const at = Math.min(day + ri(7 * 60 + 20, 17 * 60) * MIN, dayIsToday ? nowTs() - 30 * MIN : Infinity);
          if (at < start || (end && at > end)) continue;
          D.tolls.push({ id: uid('tol'), plate: v.plate, at, place: pick(tollPlaces), value: +pick([7.4, 9.1, 11.6, 13.2, 16.9]).toFixed(2), invoice: 'Fatura ' + new Date(at).toLocaleString('pt-BR', { month: 'short' }).replace('.', '') + '/2026', manual: null });
        }
      }
      const dk = dayIsToday ? dailyKm * Math.min(1, (nowTs() - Math.max(day + 7 * 36e5, start)) / (10 * 36e5)) : dailyKm * r(.7, 1.3) * (dow === 6 ? .4 : 1);
      const prevKm = kmNow; kmNow += Math.max(0, dk);
      // abastecimento
      if (kmNow - (lastFuelKm[v.id] ?? startKm - 200) > r(330, 480)) {
        const kmF = Math.round(kmNow - r(0, 20));
        const dist = kmF - (lastFuelKm[v.id] ?? startKm - 200);
        let eff = v.avgKmL * r(.93, 1.06);
        if (v.id === 'v7' && day >= today0 - 2 * DAY) eff = v.avgKmL * .74;
        const liters = +(dist / eff).toFixed(2);
        const at = Math.min(day + ri(9 * 60, 17 * 60) * MIN, dayIsToday ? nowTs() - 25 * MIN : Infinity);
        if (at > start && (!end || at < end)) {
          const pr = price[v.fuelType] * r(.97, 1.04);
          addFuelSeed(v, driverId, c, at, kmF, liters, +(liters * pr).toFixed(2), v.fuelType, pick(['Posto Ipiranga Anhanguera', 'Posto Shell Norte-Sul', 'Auto Posto Rota 330', 'Posto BR Amoreiras', 'Posto Graal Valinhos']));
          lastFuelKm[v.id] = kmF;
        }
      }
    }
    kmNow = Math.round(kmNow);
    if (end) {
      c.endKm = kmNow;
      const ck = mkChecklist('entrega', v, driverId, c.id, end - 6 * MIN, kmNow, true);
      c.deliverChecklistId = ck.id; c.closedReason = 'entrega';
      L('checklist', `Checklist de entrega concluído (${nf(kmNow)} km)`, end - 6 * MIN, v.id, driverId);
      L('posse_fim', `${d.name} entregou o veículo. Posse encerrada`, end, v.id, driverId);
    }
    D.custody.push(c);
    return { c, kmNow };
  }
  function mkChecklist(type, v, driverId, custodyId, at, kmv, ok) {
    const full = type !== 'diario';
    const items = full ? Object.fromEntries(CK_ITEMS.map(([k]) => [k, (k === 'limpeza' && R() < .15) ? 'regular' : 'ok'])) : null;
    const loc = D.locations[v.id];
    const ck = {
      id: uid('ck'), type, vehicleId: v.id, driverId, custodyId, at, km: kmv, fuelLevel: full ? pick(FUEL_LEVELS.slice(1)) : null, items, ok,
      problem: null, notes: '', photos: full ? Object.fromEntries(PHOTO_SLOTS.map(([k]) => [k, 'demo:' + k])) : { painel: null },
      projectId: null, location: null, late: false
    };
    if (type === 'diario') { const [h, m] = D.settings.dailyDeadline.split(':').map(Number); ck.late = new Date(at).getHours() * 60 + new Date(at).getMinutes() > h * 60 + m; }
    D.checklists.push(ck); return ck;
  }
  function addFuelSeed(v, driverId, c, at, kmF, liters, total, fuelType, station) {
    const prevKm = lastFuelKm[v.id];
    const f = { id: uid('fuel'), vehicleId: v.id, driverId, custodyId: c.id, projectId: c.segments.filter(s => s.at <= at).at(-1)?.projectId || null, at, km: kmF, liters, total, fuelType, station, receipt: 'demo:cupom' };
    D.fuel.push(f);
    L('abastecimento', `Abastecimento: ${nf(liters, 1)} L, ${money(total)} em ${station}`, at, v.id, driverId);
    return f;
  }

  // janelas históricas sem sobreposição por condutor
  const drvIds = D.drivers.map(d => d.id);
  const wins = [[-41, 7, 0, -21, 17, 30, 3], [-20, 7, 0, -4, 18, 0, 6]];
  D.vehicles.forEach((v, i) => {
    let kmRun = v.odometer - (v.id === 'v6' ? 3300 : 0);
    // calcula km inicial aproximado de trás para frente
    const totalDays = 41; const dailyKm = { v1: 95, v2: 120, v3: 85, v4: 110, v5: 90, v6: 70, v7: 115, v8: 60, v9: 75 }[v.id];
    let startKm = Math.round(v.odometer - dailyKm * totalDays * .82);
    wins.forEach(([sd, sh, sm, ed, eh, em, sh2]) => {
      const drv = drvIds[(i + sh2) % 9];
      const projSeq = [projIds[(i + sh2) % 5], projIds[(i + sh2 + 2) % 5]];
      const res = genCustody(v, drv, T(sd, sh, sm + i * 3), T(ed, eh, em - i * 4), startKm, dailyKm, projSeq);
      startKm = res.kmNow + ri(5, 30);
    });
    if (current[v.id]) {
      const [d, day, h, m, p] = current[v.id];
      const projSeq = p ? (p === 'p15' ? ['p15', 'p22'] : [p, pick(projIds)]) : [null];
      const res = genCustody(v, d, T(day, h, m), null, startKm, dailyKm, p ? projSeq : [], { imported: !p });
      v.odometer = res.kmNow;
    } else {
      v.odometer = startKm + ri(0, 15);
    }
  });

  // ajustes específicos da demonstração ---------------------------------
  const vv = id => D.vehicles.find(v => v.id === id);
  // ABC1D23: dia de hoje igual ao exemplo (recebeu 07:32 na Obra 15; nenhuma troca de obra ainda)
  const cABC = D.custody.find(c => c.vehicleId === 'v1' && !c.end);
  cABC.segments = cABC.segments.slice(0, 1);
  D.audit = D.audit.filter(a => !(a.vehicleId === 'v1' && a.type === 'obra' && a.at > cABC.start + 5 * MIN));

  // QRS5T67 em manutenção desde anteontem
  const v6 = vv('v6'); v6.maintenance = true; v6.maintenanceSince = T(-2, 8, 40); v6.maintenanceNote = 'Revisão dos 120 mil km – Oficina Mecânica Alvorada';
  const ckM = mkChecklist('manut_entrada', v6, null, null, v6.maintenanceSince - 10 * MIN, v6.odometer, true); ckM.userId = 'u_gestor';
  L('manutencao', 'Entrada em manutenção: revisão dos 120 mil km (Oficina Mecânica Alvorada)', v6.maintenanceSince, 'v6', null, 'u_gestor');

  // problema crítico no JKL7H89
  const iss = { id: uid('iss'), vehicleId: 'v3', driverId: 'd3', at: T(0, 8, 50), type: 'Freios', desc: 'Ruído metálico ao frear e pedal baixo. Parei o veículo na obra.', severity: 'critica', canRun: false, photo: null, status: 'aberta', source: 'diario' };
  D.issues.push(iss);
  D.checklists.push({ id: uid('ck'), type: 'diario', vehicleId: 'v3', driverId: 'd3', custodyId: D.custody.find(c => c.vehicleId === 'v3' && !c.end).id, at: iss.at - MIN, km: vv('v3').odometer, ok: false, problem: { issueId: iss.id }, photos: { painel: null }, late: false });
  D.checklists = D.checklists.filter(c => !(c.vehicleId === 'v3' && c.type === 'diario' && isToday(c.at) && c.ok));
  L('problema', 'Problema CRÍTICO informado: Freios – ruído metálico e pedal baixo. Veículo não pode circular', iss.at, 'v3', 'd3');
  D.notifications.push({ id: uid('ntf'), to: 'gestao', text: 'Problema crítico no JKL7H89 (Freios): veículo não pode circular.', at: iss.at, read: false, level: 'bad', link: { page: 'veiculo', id: 'v3' } });

  // transferência pendente no BRA2E19: Tiago solicitou, Marina ainda não entregou
  const cBRA = D.custody.find(c => c.vehicleId === 'v9' && !c.end);
  const tAt = T(0, 16, 5);
  const tr = { id: uid('trf'), vehicleId: 'v9', fromDriverId: 'd6', toDriverId: 'd7', status: 'solicitada', requestedAt: tAt, forced: false, justification: '', requestedBy: 'u_d7', fromCustodyId: cBRA.id, toCustodyId: null, deliverChecklistId: null, receiveChecklistId: null, events: [{ at: tAt, status: 'solicitada', by: 'u_d7', note: 'Solicitado por Tiago Ramos pelo QR Code' }] };
  D.transfers.push(tr);
  L('transferencia', 'Tiago Ramos solicitou a transferência do veículo', tAt, 'v9', 'd7');
  D.notifications.push({ id: uid('ntf'), to: 'd6', text: 'Tiago Ramos solicitou a transferência do BRA2E19. Faça a entrega com o checklist.', at: tAt, read: false, level: 'warn', link: { page: 'transferencia', id: tr.id } });

  // localizações (rastreador)
  const at0 = nowTs() - ri(1, 4) * MIN;
  const P = id => proj(id);
  const locs = {
    v1: [P('p15').lat + .012, P('p15').lng + .02, 54, true], v2: [P('p22').lat, P('p22').lng, 0, false], v3: [P('p09').lat + .002, P('p09').lng, 0, false],
    v4: [-22.93, -47.11, 72, true], v5: [P('pmat').lat + .006, P('pmat').lng - .009, 0, false], v6: [-22.872, -47.098, 0, false],
    v7: [P('p31').lat, P('p31').lng + .003, 0, true], v9: [P('pmat').lat - .001, P('pmat').lng + .001, 0, false]
  };
  // veículos parados ficam no canteiro da obra atual da posse
  ['v2', 'v3', 'v7'].forEach(id => { const c = D.custody.find(x => x.vehicleId === id && !x.end); const pj = P(c.segments.at(-1).projectId); locs[id][0] = pj.lat + .002; locs[id][1] = pj.lng + .002; });
  Object.entries(locs).forEach(([id, [lat, lng, speed, ign]]) => { D.locations[id] = { lat, lng, speed, ignition: ign, km: vv(id).odometer, at: at0 - ri(0, 3) * MIN }; });

  // planos de manutenção
  const planDef = [['Troca de óleo', 10000, 180], ['Filtros', 10000, 180], ['Alinhamento', 10000, null], ['Balanceamento', 10000, null], ['Revisão', 15000, 365], ['Pneus', 45000, null], ['Freios', 25000, null], ['Bateria', null, 730], ['Correia dentada', 60000, 1460]];
  D.vehicles.forEach(v => {
    planDef.forEach(([item, eKm, eDays], k) => {
      const frac = r(.05, .8);
      const lastKm = eKm ? Math.round(v.odometer - eKm * frac) : null;
      const lastDate = today0 - Math.round((eDays || 400) * frac * .8) * DAY;
      D.plans.push({ id: uid('mp'), vehicleId: v.id, item, everyKm: eKm, everyDays: eDays, lastKm, lastDate });
    });
  });
  const setPlan = (vid, item, f) => Object.assign(D.plans.find(p => p.vehicleId === vid && p.item === item), f);
  setPlan('v2', 'Troca de óleo', { lastKm: vv('v2').odometer - 9550, lastDate: today0 - 120 * DAY });
  setPlan('v2', 'Filtros', { lastKm: vv('v2').odometer - 9550, lastDate: today0 - 120 * DAY });
  setPlan('v7', 'Revisão', { lastKm: vv('v7').odometer - 17250, lastDate: today0 - 300 * DAY });
  setPlan('v7', 'Alinhamento', { lastKm: vv('v7').odometer - 8900 });
  setPlan('v3', 'Freios', { lastKm: vv('v3').odometer - 24100 });
  setPlan('v4', 'Bateria', { lastDate: today0 - 712 * DAY });
  setPlan('v6', 'Revisão', { lastKm: vv('v6').odometer - 15400, lastDate: today0 - 380 * DAY });
  // registros de manutenção
  const mr = (vid, dOff, items, cost, shop, kmv) => D.maintRecords.push({ id: uid('mr'), vehicleId: vid, at: today0 + dOff * DAY + 11 * 36e5, items, cost, shop, km: kmv, type: 'preventiva' });
  mr('v1', -18, ['Troca de óleo', 'Filtros'], 486.9, 'Oficina Mecânica Alvorada', vv('v1').odometer - 2100);
  mr('v4', -11, ['Alinhamento', 'Balanceamento'], 240, 'Centro Automotivo Rodoanel', vv('v4').odometer - 1300);
  mr('v5', -9, ['Pneus'], 3920, 'Pneus Campinas', vv('v5').odometer - 900);
  mr('v9', -6, ['Revisão'], 1180, 'Concessionária Toyota Campinas', vv('v9').odometer - 450);
  mr('v2', -30, ['Freios'], 1340, 'Oficina Mecânica Alvorada', vv('v2').odometer - 3500);
  mr('v8', -14, ['Bateria'], 620, 'Auto Elétrica Castelo', vv('v8').odometer - 700);

  // pedágios sem correspondência (veículo parado no pátio, sem posse)
  D.tolls.push({ id: uid('tol'), plate: 'MNO2P34', at: T(-2, 13, 12), place: 'Praça Valinhos – SP-330 km 82', value: 11.6, invoice: 'Fatura set/2026', manual: null });
  D.tolls.push({ id: uid('tol'), plate: 'TUV3W45', at: T(-3, 9, 48), place: 'Praça Itupeva – SP-300 km 70', value: 9.1, invoice: 'Fatura set/2026', manual: null });

  // multas
  const fineAt = (vid, pred) => { const cs = D.custody.filter(c => c.vehicleId === vid).sort((a, b) => a.start - b.start); return cs[pred]; };
  const f1c = fineAt('v2', 0), f2c = fineAt('v7', 1), f3c = fineAt('v9', 0), f4c = fineAt('v1', 1);
  D.fines.push(
    { id: uid('fin'), plate: 'DEF4G56', at: f1c.start + 6 * DAY + 5.3 * 36e5, place: 'Rod. Anhanguera, km 88 – Valinhos/SP', infraction: 'Transitar em velocidade superior à máxima permitida em até 20%', gravity: 'media', value: 130.16, notice: 'R0123456789', points: 4, attachments: ['notificacao_R0123456789.pdf'], manualDriverId: null },
    { id: uid('fin'), plate: 'GHI8J90', at: f2c.start + 9 * DAY + 3.1 * 36e5, place: 'Av. John Boyd Dunlop, 3900 – Campinas/SP', infraction: 'Estacionar em local proibido pela sinalização', gravity: 'media', value: 130.16, notice: 'R0198877321', points: 4, attachments: [], manualDriverId: null },
    { id: uid('fin'), plate: 'BRA2E19', at: f3c.start + 4 * DAY + 9.6 * 36e5, place: 'Av. Norte-Sul x R. Barão de Jaguara – Campinas/SP', infraction: 'Avançar o sinal vermelho do semáforo', gravity: 'gravissima', value: 293.47, notice: 'R0200011122', points: 7, attachments: ['notificacao_R0200011122.pdf'], manualDriverId: null },
    { id: uid('fin'), plate: 'ABC1D23', at: f4c.start + 7 * DAY + 2.2 * 36e5, place: 'Rod. D. Pedro I, km 128 – Campinas/SP', infraction: 'Transitar em velocidade superior à máxima permitida em até 20%', gravity: 'media', value: 130.16, notice: 'R0211122233', points: 4, attachments: [], manualDriverId: null },
    { id: uid('fin'), plate: 'TUV3W45', at: T(-3, 10, 5), place: 'Rod. dos Bandeirantes, km 72 – Itupeva/SP', infraction: 'Transitar em velocidade superior à máxima permitida em até 20%', gravity: 'media', value: 130.16, notice: 'R0233344455', points: 4, attachments: [], manualDriverId: null }
  );

  // localização registrada pelo celular do condutor em cada checklist
  const jit = () => (R() - .5) * .006;
  const MAT = P('pmat'); const SHOP = { lat: -22.872, lng: -47.098 };
  D.checklists.forEach(k => {
    let base = MAT;
    if (k.type === 'manut_entrada') base = SHOP;
    else if (k.custodyId && !['entrega', 'devolucao'].includes(k.type)) {
      const c = D.custody.find(x => x.id === k.custodyId);
      const sg = c && c.segments.filter(s => s.at <= k.at + 5 * MIN).at(-1);
      if (sg) base = P(sg.projectId);
    }
    k.location = { lat: +(base.lat + jit()).toFixed(5), lng: +(base.lng + jit()).toFixed(5), source: 'celular' };
  });
  D.fuel.forEach(f => { f.location = { lat: +(-22.9 + (R() - .5) * .2).toFixed(5), lng: +(-47.07 + (R() - .5) * .2).toFixed(5), source: 'celular' }; });

  D.audit.sort((a, b) => a.at - b.at);
  return migrate(D);
}
