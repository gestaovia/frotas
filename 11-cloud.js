/* ===================== Nuvem: Supabase (login, dados por perfil, arquivos) =====================
   No navegador ficam SOMENTE o endereço do projeto e a chave publicável (pública por definição).
   Quem pode ver e alterar cada registro é decidido no banco (RLS). Chaves de serviço e o token do
   Traccar ficam no servidor (funções admin-users, traccar-proxy e traccar-webhook). */
const CFG = window.VIALINK_CONFIG || {};
const BUCKET = 'vialink-arquivos';
let APP_MODE = 'demo';
const cloudConfigured = () => !!(CFG.supabaseUrl && CFG.supabaseKey);
const isUUID = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

/* ----- mapa coleção do aplicativo <-> tabela do banco ----- */
const SPEC = [
  { key: 'costCenters', table: 'cost_centers', cols: ['id', 'code', 'name', 'active'] },
  { key: 'projects', table: 'projects', cols: ['id', 'code', 'name', 'ccId', 'lat', 'lng', 'active'] },
  { key: 'drivers', table: 'drivers', cols: ['id', 'name', 'cnh', 'cnhCat', 'cnhExp', 'phone', 'active', 'inactiveAt', 'inactiveReason', 'telemetry', 'createdAt'], ts: ['cnhExp', 'inactiveAt', 'createdAt'] },
  { key: 'vehicles', table: 'vehicles', cols: ['id', 'plate', 'brand', 'model', 'year', 'fuelType', 'avgKmL', 'odometer', 'tracker', 'seats', 'ownership', 'rental', 'docs', 'maintenance', 'maintenanceSince', 'maintenanceNote', 'active', 'traccarId', 'traccarUniqueId'], ts: ['maintenanceSince'] },
  { key: 'qrcodes', table: 'qr_codes', cols: ['id', 'vehicleId', 'token', 'active', 'createdAt', 'revokedAt'], ts: ['createdAt', 'revokedAt'] },
  { key: 'custody', table: 'custody', cols: ['id', 'vehicleId', 'driverId', 'start', 'end', 'startKm', 'endKm', 'receiveChecklistId', 'deliverChecklistId', 'segments', 'closedReason', 'transferId', 'imported'], ts: ['start', 'end'], ren: { start: 'started_at', end: 'ended_at' }, sort: 'start' },
  { key: 'transfers', table: 'transfers', cols: ['id', 'vehicleId', 'fromDriverId', 'toDriverId', 'status', 'requestedAt', 'forced', 'justification', 'requestedBy', 'fromCustodyId', 'toCustodyId', 'deliverChecklistId', 'receiveChecklistId', 'events'], ts: ['requestedAt'], sort: 'requestedAt' },
  { key: 'checklists', table: 'checklists', cols: ['id', 'type', 'vehicleId', 'driverId', 'userId', 'custodyId', 'at', 'km', 'fuelLevel', 'items', 'ok', 'problem', 'avarias', 'notes', 'photos', 'projectId', 'location', 'late'], ts: ['at'], sort: 'at' },
  { key: 'issues', table: 'issues', cols: ['id', 'vehicleId', 'driverId', 'at', 'type', 'desc', 'severity', 'canRun', 'photo', 'status', 'source', 'location', 'resolvedAt', 'resolvedBy', 'resolution'], ts: ['at', 'resolvedAt'], ren: { desc: 'description' }, sort: 'at' },
  { key: 'fuel', table: 'fuel_records', cols: ['id', 'vehicleId', 'driverId', 'custodyId', 'projectId', 'at', 'km', 'liters', 'total', 'fuelType', 'station', 'receipt', 'location'], ts: ['at'], sort: 'at' },
  { key: 'plans', table: 'maintenance_plans', cols: ['id', 'vehicleId', 'item', 'everyKm', 'everyDays', 'lastKm', 'lastDate'], ts: ['lastDate'] },
  { key: 'maintRecords', table: 'maintenance_records', cols: ['id', 'vehicleId', 'at', 'items', 'cost', 'shop', 'km', 'type'], ts: ['at'], sort: 'at' },
  { key: 'tolls', table: 'tolls', cols: ['id', 'plate', 'at', 'place', 'value', 'invoice', 'manual'], ts: ['at'], sort: 'at' },
  { key: 'fines', table: 'fines', cols: ['id', 'plate', 'at', 'place', 'infraction', 'gravity', 'value', 'points', 'notice', 'attachments', 'manualDriverId'], ts: ['at'], sort: 'at' },
  { key: 'locations', table: 'vehicle_last_location', cols: ['id', 'lat', 'lng', 'speed', 'ignition', 'km', 'at', 'source'], ts: ['at'], asMap: true, upsert: true },
  { key: 'trackerEvents', table: 'tracker_events', cols: ['id', 'extId', 'vehicleId', 'driverId', 'type', 'at', 'speed', 'lat', 'lng'], ts: ['at'], sort: 'at' },
  { key: 'notifications', table: 'notifications', cols: ['id', 'to', 'text', 'at', 'read', 'level', 'link'], ts: ['at'], ren: { to: 'to_target' }, sort: 'at' },
  { key: 'audit', table: 'audit_logs', cols: ['id', 'at', 'type', 'text', 'vehicleId', 'driverId', 'userId', 'data'], ts: ['at'], sort: 'at', limit: 6000 },
  { key: 'settings', table: 'app_settings', single: true }
];
SPEC.forEach(sp => {
  if (sp.single) return;
  sp.colOf = Object.fromEntries(sp.cols.map(k => [k, sp.ren?.[k] || snake(k)]));
  sp.keyOf = Object.fromEntries(Object.entries(sp.colOf).map(([k, c]) => [c, k]));
  sp.tsSet = new Set(sp.ts || []);
});
function toRow(sp, o) {
  if (sp.single) { const data = JSON.parse(JSON.stringify(o)); if (data.traccar) delete data.traccar.token; return { id: 1, data }; }
  const row = {}; const extra = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_') || v === undefined) continue;
    const c = sp.colOf[k];
    if (c) row[c] = sp.tsSet.has(k) ? (v == null || v === '' || isNaN(v) ? null : new Date(v).toISOString()) : (typeof v === 'number' && !isFinite(v) ? null : v);
    else extra[k] = v;
  }
  row.extra = extra;
  return row;
}
function fromRow(sp, r) {
  if (sp.single) return r.data || {};
  const o = { ...(r.extra || {}) };
  for (const [c, v] of Object.entries(r)) {
    const k = sp.keyOf[c]; if (!k) continue;
    o[k] = sp.tsSet.has(k) ? (v == null ? null : Date.parse(v)) : v;
  }
  return o;
}
const listOf = sp => sp.single ? [S.settings] : sp.asMap ? Object.entries(S.locations || {}).map(([id, l]) => ({ ...l, id })) : (S[sp.key] || []);

/* quem grava o quê (o banco confere de novo; aqui só evita mandar o que seria recusado) */
const WRITES = {
  admin: null, gestor: null,
  supervisor: new Set(['audit', 'notifications', 'locations']),
  condutor: new Set(['custody', 'transfers', 'checklists', 'issues', 'fuel', 'notifications', 'audit', 'locations', 'vehicles'])
};

const DEFAULT_SETTINGS = () => ({
  dailyDeadline: '10:00', transferAlertHours: 4, oneVehiclePerDriver: true, requirePhotos: true,
  maint: { attentionKm: 1500, urgentKm: 500, attentionDays: 30, urgentDays: 7 }, fuelDeviationPct: 15,
  score: { criteria: { checklist: { on: true, weight: 30 }, conservacao: { on: true, weight: 20 }, abastecimento: { on: true, weight: 15 }, infracoes: { on: true, weight: 20 }, procedimentos: { on: true, weight: 15 } }, penalties: { atraso: 50, avaria: 5, limpeza: 2, leve: 3, media: 5, grave: 8, gravissima: 12, forcada: 5, semObra: 5, telemetria: 2 }, mode: 'faixas', minScore: 70, maxBonus: 300, tiers: [{ min: 90, value: 300 }, { min: 80, value: 200 }, { min: 70, value: 100 }] },
  rental: { warnDays: 30, urgentDays: 7 }, tracker: { enabled: true, provider: 'Traccar', endpoint: '', interval: 60 },
  traccar: { mode: 'off', url: '', live: false, pollSec: 30, odometer: true, speedLimit: 100 }, docs: { warnDays: 30, urgentDays: 7 }
});
function fillDefaults(dst, def) { for (const [k, v] of Object.entries(def)) { if (dst[k] === undefined || dst[k] === null) dst[k] = v; else if (v && typeof v === 'object' && !Array.isArray(v) && typeof dst[k] === 'object') fillDefaults(dst[k], v); } return dst; }

const CLOUD = {
  on: false, sb: null, profile: null, base: {}, busy: null, again: false, timer: null, poll: null,
  signed: {}, status: 'ok', lastError: '', retryT: null,

  client() {
    if (!this.sb) this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'vialink-auth' } });
    return this.sb;
  },
  async reachable() {
    try { const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/auth/v1/health', { headers: { apikey: CFG.supabaseKey }, cache: 'no-store' }); return r.ok; }
    catch (e) { return false; }
  },

  /* ---------- sessão ---------- */
  async boot() {
    APP_MODE = 'cloud';
    if (!window.supabase?.createClient) { ROUTE = { page: 'login', p: {} }; render(); LOGIN_MSG = 'Não foi possível carregar a biblioteca do Supabase. Verifique a conexão.'; return render(); }
    const sb = this.client();
    sb.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') { RECOVERY = true; if (this.on) go('senha'); }
      if (ev === 'SIGNED_OUT' && this.on) this.leave('Sua sessão terminou. Entre novamente.');
    });
    ROUTE = { page: 'login', p: {} }; LOGIN_BUSY = true; render();
    const { data: { session } } = await sb.auth.getSession();
    LOGIN_BUSY = false;
    if (session?.user) await this.enter(session.user);
    else render();
  },
  async enter(user) {
    const sb = this.client();
    LOGIN_BUSY = true; render();
    try {
      const { data: prof, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (!prof || !prof.active) { await sb.auth.signOut(); LOGIN_BUSY = false; LOGIN_MSG = 'Seu acesso ainda não foi liberado ou está inativo. Procure o administrador da frota.'; return render(); }
      this.profile = prof;
      await this.loadAll();
      CUR = S.users.find(u => u.id === prof.id);
      this.on = true; LOGIN_BUSY = false; LOGIN_MSG = '';
      this.startPolling();
      if (prof.must_change_password || RECOVERY) go('senha'); else go(homePage());
      if (CUR.role !== 'condutor') TC.start().then(() => TC.paint());
    } catch (e) {
      LOGIN_BUSY = false; LOGIN_MSG = 'Não foi possível carregar os dados: ' + friendlyError(e); render();
    }
  },
  async leave(msg) {
    this.on = false; clearInterval(this.poll); clearTimeout(this.timer); clearTimeout(this.retryT); TC.stop();
    this.base = {}; this.signed = {}; CUR = null; S = null; LOGIN_MSG = msg || '';
    try { await this.client().auth.signOut(); } catch (e) { }
    ROUTE = { page: 'login', p: {} }; render();
  },

  /* ---------- leitura (o banco devolve só o que o perfil pode ver) ---------- */
  async fetchAll(sp) {
    const sb = this.client(); const out = []; const step = 1000; const cap = sp.limit || 50000;
    for (let from = 0; from < cap; from += step) {
      let q = sb.from(sp.table).select('*');
      q = sp.limit ? q.order('at', { ascending: false }) : q.order('id');
      const { data, error } = await q.range(from, from + step - 1);
      if (error) throw error;
      out.push(...data); if (data.length < step) break;
    }
    return out;
  },
  async loadAll() {
    const sb = this.client();
    const [lists, prof, dir] = await Promise.all([
      Promise.all(SPEC.map(sp => this.fetchAll(sp))),
      sb.from('profiles').select('id,name,email,role,driver_id,active,must_change_password').order('name'),
      sb.rpc('driver_directory')
    ]);
    if (prof.error) throw prof.error;
    const D = { version: 6, cloud: true, locations: {}, users: [] };
    SPEC.forEach((sp, i) => {
      const rows = lists[i];
      if (sp.single) { D.settings = fillDefaults(rows[0] ? fromRow(sp, rows[0]) : {}, DEFAULT_SETTINGS()); return; }
      const objs = rows.map(r => fromRow(sp, r));
      if (sp.sort) objs.sort((a, b) => (a[sp.sort] || 0) - (b[sp.sort] || 0));
      if (sp.asMap) objs.forEach(o => { const { id, ...l } = o; D.locations[id] = l; }); else D[sp.key] = objs;
    });
    D.users = (prof.data || []).map(p => ({ id: p.id, name: p.name, email: p.email, role: p.role, driverId: p.driver_id, active: p.active, mustChange: p.must_change_password }));
    // condutor: nomes dos colegas sem dados pessoais (CNH, telefone)
    (dir.data || []).forEach(d => { if (!D.drivers.some(x => x.id === d.id)) D.drivers.push({ id: d.id, name: d.name, active: d.active, _ro: true }); });
    if (D.settings.traccar?.mode === 'simulador') D.settings.traccar.mode = 'off';
    S = D;
    // inicializações preguiçosas do aplicativo feitas antes da foto de referência
    S.vehicles.forEach(v => docsOf(v)); docSet();
    this.snapshot();
    await this.signAll();
  },
  snapshot() {
    this.base = {};
    SPEC.forEach(sp => { const m = new Map(); listOf(sp).forEach(o => { if (o && !o._ro) m.set(String(o.id ?? 1), toRow(sp, o)); }); this.base[sp.key] = m; });
  },

  /* ---------- gravação: só as colunas que mudaram, numa transação ---------- */
  diff() {
    const ops = [];
    for (const sp of SPEC) {
      const base = this.base[sp.key] || new Map(); const seen = new Set();
      for (const o of listOf(sp)) {
        if (!o || o._ro) continue;
        const id = String(o.id ?? 1); seen.add(id);
        const row = toRow(sp, o); const old = base.get(id);
        if (!old) { ops.push({ sp, op: sp.upsert ? 'upsert' : 'insert', id, row }); continue; }
        const ch = { id: row.id }; let n = 0;
        for (const c of new Set([...Object.keys(row), ...Object.keys(old)])) {
          if (c === 'id') continue;
          if (stable(row[c] ?? null) !== stable(old[c] ?? null)) { ch[c] = row[c] ?? null; n++; }
        }
        if (n) ops.push({ sp, op: sp.upsert ? 'upsert' : 'update', id, row: sp.upsert ? row : ch, full: row });
      }
      if (!sp.single) for (const id of base.keys()) if (!seen.has(id)) ops.push({ sp, op: 'delete', id });
    }
    return ops;
  },
  allowed(op) {
    const w = WRITES[CUR?.role]; if (w === null) return true; if (!w || !w.has(op.sp.key)) return false;
    if (CUR.role === 'condutor') {
      if (op.op === 'delete') return false;
      if (op.sp.key === 'vehicles') { if (op.op !== 'update' || op.row.odometer === undefined) return false; op.row = { id: op.row.id, odometer: op.row.odometer }; }
      if (op.sp.key === 'issues' && op.op !== 'insert') return false;
      if (op.sp.key === 'notifications' && op.op === 'update') { if (Object.keys(op.row).some(k => k !== 'id' && k !== 'read')) return false; }
    }
    if (CUR.role === 'supervisor' && op.sp.key === 'notifications' && op.op === 'update' && Object.keys(op.row).some(k => k !== 'id' && k !== 'read')) return false;
    return true;
  },
  rebase(ops) {
    ops.forEach(o => {
      const m = this.base[o.sp.key];
      if (o.op === 'delete') m.delete(o.id);
      else if (o.op === 'update') m.set(o.id, { ...(m.get(o.id) || {}), ...(o.full || o.row) });
      else m.set(o.id, o.full || o.row);
    });
  },
  queue() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 350); },
  async flush() {
    if (!this.on) return;
    if (this.busy) { this.again = true; return this.busy; }
    this.busy = (async () => {
      let ops = [];
      try {
        await this.externalize();
        ops = this.diff();
        // inclusões primeiro (ordem das tabelas), depois alterações, por último exclusões:
        // assim a posse nova já existe quando o hodômetro do veículo é atualizado pelo condutor
        const rank = o => o.op === 'delete' ? 2 : o.op === 'update' ? 1 : 0;
        const send = ops.filter(o => this.allowed(o)).map((o, i) => [o, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || (rank(a[0]) === 2 ? b[1] - a[1] : a[1] - b[1])).map(x => x[0]);
        if (send.length) {
          this.setStatus('saving');
          for (let i = 0; i < send.length; i += 300) {
            const chunk = send.slice(i, i + 300).map(o => o.op === 'delete' ? { t: o.sp.table, op: 'delete', id: o.id } : { t: o.sp.table, op: o.op, row: o.row });
            const { error } = await this.client().rpc('sync_apply', { ops: chunk });
            if (error) throw error;
          }
        }
        this.rebase(ops);
        this.setStatus('ok');
      } catch (e) {
        await this.onSyncError(e);
      } finally {
        this.busy = null;
        if (this.again) { this.again = false; this.flush(); }
      }
    })();
    return this.busy;
  },
  async onSyncError(e) {
    const offline = e instanceof TypeError || /fetch|network|Failed/i.test(e?.message || '') && !e?.code;
    if (offline) {
      this.setStatus('offline'); toast('Sem conexão com o servidor. Suas alterações serão enviadas quando a conexão voltar.');
      clearTimeout(this.retryT); this.retryT = setTimeout(() => this.flush(), 15000); return;
    }
    this.setStatus('error'); this.lastError = friendlyError(e);
    toast('Não foi possível salvar: ' + this.lastError + ' Os dados foram recarregados.');
    try { await this.reload(true, true); } catch (x) { }
  },
  setStatus(s) { this.status = s; const b = $('#sync-badge'); if (b) b.outerHTML = syncBadge(); },

  /* ---------- atualização periódica (o que outros usuários registraram) ---------- */
  startPolling() {
    clearInterval(this.poll);
    this.poll = setInterval(() => this.reload(false), 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.reload(false); });
  },
  async reload(force, skipFlush) {
    if (!this.on) return;
    if (force && !skipFlush) { clearTimeout(this.timer); await this.flush(); }
    if (this.busy) { if (!force) return; await this.busy; }
    if (!force && (DRAFT || $('#modal') || this.diff().some(o => this.allowed(o)))) return;
    const before = stable([...Object.values(this.base)].map(m => [...m.entries()]));
    const keepCur = CUR?.id;
    await this.loadAll();
    CUR = S.users.find(u => u.id === keepCur) || CUR;
    if (!CUR?.active) return this.leave('Seu acesso foi desativado.');
    const after = stable([...Object.values(this.base)].map(m => [...m.entries()]));
    if (force || before !== after) render();
  },

  /* ---------- arquivos: fotos e documentos vão para o Storage privado ---------- */
  async externalize() {
    const jobs = [];
    const walk = (obj, table, id) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.startsWith('data:') && v.length > 200) jobs.push({ obj, k, v, table, id });
        else if (v && typeof v === 'object') walk(v, table, id);
      }
    };
    SPEC.forEach(sp => { if (!sp.single && !sp.asMap) listOf(sp).forEach(o => { if (!o._ro) walk(o, sp.table, o.id); }); });
    for (const j of jobs) {
      const m = /^data:([^;,]+)[;,]/.exec(j.v); const type = m ? m[1] : 'application/octet-stream';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[type] || 'bin';
      const bin = atob(j.v.slice(j.v.indexOf(',') + 1)); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const path = `${j.table}/${j.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await this.client().storage.from(BUCKET).upload(path, new Blob([bytes], { type }), { contentType: type, upsert: false });
      if (error) throw error;
      this.signed[path] = { url: j.v, at: Date.now() + 864e5 * 365 }; // mostra a cópia local até a próxima leitura
      j.obj[j.k] = 'sb:' + path;
    }
  },
  pathsIn() {
    const out = new Set();
    const walk = o => { if (!o || typeof o !== 'object') return; for (const v of Object.values(o)) { if (typeof v === 'string' && v.startsWith('sb:')) out.add(v.slice(3)); else if (v && typeof v === 'object') walk(v); } };
    ['checklists', 'issues', 'fuel', 'vehicles', 'fines'].forEach(k => (S[k] || []).forEach(walk));
    return [...out];
  },
  async signAll() {
    const need = this.pathsIn().filter(p => !this.signed[p] || this.signed[p].at < Date.now() + 5 * 60000);
    for (let i = 0; i < need.length; i += 100) {
      const { data } = await this.client().storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600);
      (data || []).forEach(d => { if (d.signedUrl) this.signed[d.path] = { url: d.signedUrl, at: Date.now() + 3500e3 }; });
    }
  },
  fileUrl(ref) { const p = String(ref).slice(3); return this.signed[p]?.url || null; },

  /* ---------- funções do servidor ---------- */
  async fn(name, body) {
    const { data, error } = await this.client().functions.invoke(name, { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (e) { }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async rpc(name, args) { const { data, error } = await this.client().rpc(name, args || {}); if (error) throw error; return data; }
};

function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/custody_no_overlap/.test(m)) return 'o veículo já está com outro condutor.';
  if (/row-level security|Sem permissão|42501/.test(m) || e?.code === '42501') return 'seu perfil não tem permissão para esta ação.';
  if (/inativo/.test(m)) return 'seu acesso está inativo.';
  if (/JWT|expired|sess/i.test(m)) return 'sua sessão expirou. Entre novamente.';
  if (/duplicate key|unique/.test(m)) return 'já existe um registro igual (placa, código ou número repetido).';
  if (/violates check constraint/.test(m)) return 'algum valor está fora do permitido.';
  return m.replace(/^Error:\s*/, '');
}
function syncBadge() {
  if (APP_MODE !== 'cloud') return '';
  const s = CLOUD.status; const m = { ok: ['ok', 'Salvo'], saving: ['neu', 'Salvando…'], offline: ['warn', 'Sem conexão'], error: ['bad', 'Erro ao salvar'] }[s] || ['ok', 'Salvo'];
  return `<span id="sync-badge" class="st small" title="${esc(CLOUD.lastError || 'Dados no servidor')}" style="white-space:nowrap"><span class="dot ${m[0]}"></span>${m[1]}</span>`;
}

/* ===================== Telas: entrar, primeiro acesso e troca de senha ===================== */
let LOGIN_MSG = '', LOGIN_BUSY = false, LOGIN_VIEW = 'entrar', RECOVERY = false, SERVER_OK = null;
function cloudLoginPage() {
  const v = LOGIN_VIEW;
  const form = v === 'entrar' ? `<form id="cl-form" class="stack" style="max-width:380px;gap:12px">
      <label class="field"><span>E-mail</span><input class="inp" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Senha</span><input class="inp" name="pass" type="password" autocomplete="current-password" required></label>
      <p class="err" id="login-err">${esc(LOGIN_MSG)}</p>
      <button class="btn pri lg" ${LOGIN_BUSY ? 'disabled' : ''}>${LOGIN_BUSY ? 'Entrando…' : 'Entrar'}</button>
      <div class="row" style="justify-content:space-between"><button type="button" class="link small" data-act="cl-view" data-v="esqueci">Esqueci minha senha</button><button type="button" class="link small" data-act="cl-view" data-v="primeiro">Primeiro acesso do administrador</button></div>
    </form>`
    : v === 'esqueci' ? `<form id="cl-form" class="stack" style="max-width:380px;gap:12px"><p class="muted">Enviaremos um link para criar uma nova senha.</p>
      <label class="field"><span>E-mail</span><input class="inp" name="email" type="email" required></label><p class="err" id="login-err">${esc(LOGIN_MSG)}</p>
      <button class="btn pri lg">Enviar link</button><button type="button" class="link small" data-act="cl-view" data-v="entrar">Voltar</button></form>`
      : `<form id="cl-form" class="stack" style="max-width:380px;gap:12px"><p class="muted">Use somente se você é o administrador indicado na implantação. Os demais usuários recebem o acesso pela tela de Usuários.</p>
      <label class="field"><span>Nome</span><input class="inp" name="name" required></label>
      <label class="field"><span>E-mail</span><input class="inp" name="email" type="email" required></label>
      <label class="field"><span>Senha (mín. 8 caracteres)</span><input class="inp" name="pass" type="password" minlength="8" autocomplete="new-password" required></label>
      <p class="err" id="login-err">${esc(LOGIN_MSG)}</p><button class="btn ok lg">Criar acesso</button><button type="button" class="link small" data-act="cl-view" data-v="entrar">Voltar</button></form>`;
  return `<div class="login">
    <div class="login-l"><div class="brand" style="border:0;padding:0">${brandMark()}<div><b>gestaovia</b><span>Gestão de frota e posse de veículos</span></div></div>
      <div><h1 style="font-size:26px">${v === 'entrar' ? 'Entrar' : v === 'esqueci' ? 'Recuperar senha' : 'Primeiro acesso'}</h1><p class="muted" style="margin-top:4px">Use seu e-mail corporativo.</p></div>
      ${form}
      <p class="small muted" id="srv-note">${SERVER_OK === false ? 'O servidor não respondeu deste ambiente. Publicado no seu domínio o login funciona normalmente.' : ''}</p></div>
    <div class="login-r"><div><p class="label">Acesso por perfil</p><h2 style="margin-top:4px">Cada pessoa vê só o que precisa</h2></div>
      <ul class="att" style="padding:0">
        <li><span class="ic neu">${ic('gear')}</span><div><b>Administrador</b><small>Regras, usuários e integrações</small></div></li>
        <li><span class="ic neu">${ic('dash')}</span><div><b>Gestor de frota</b><small>Toda a frota, transferência forçada, custos e premiação</small></div></li>
        <li><span class="ic neu">${ic('report')}</span><div><b>Supervisor</b><small>Acompanha tudo, sem ações administrativas</small></div></li>
        <li><span class="ic neu">${ic('qr')}</span><div><b>Condutor</b><small>O próprio veículo, checklists e abastecimentos</small></div></li>
      </ul>
      <button class="btn" data-act="cl-demo">${ic('grid')}Ver a demonstração com dados de exemplo</button>
      <p class="small muted">A demonstração roda só neste navegador e não grava nada no servidor.</p></div></div>`;
}
function mountCloudLogin() {
  if (SERVER_OK === null) CLOUD.reachable().then(ok => { SERVER_OK = ok; const n = $('#srv-note'); if (n && !ok) n.textContent = 'O servidor não respondeu deste ambiente. Publicado no seu domínio o login funciona normalmente.'; });
  const f = $('#cl-form'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = formData(f); const err = t => { LOGIN_MSG = t; const el = $('#login-err'); if (el) el.textContent = t; };
    const sb = CLOUD.client(); const btn = f.querySelector('.btn.pri, .btn.ok'); btn.disabled = true;
    try {
      if (LOGIN_VIEW === 'entrar') {
        LOGIN_MSG = '';
        const { data, error } = await sb.auth.signInWithPassword({ email: d.email, password: d.pass });
        if (error) { btn.disabled = false; return err(/Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : /banned/i.test(error.message) ? 'Seu acesso está inativo. Procure a gestão da frota.' : /confirm/i.test(error.message) ? 'Confirme o e-mail pelo link recebido antes de entrar.' : friendlyError(error)); }
        await CLOUD.enter(data.user);
      } else if (LOGIN_VIEW === 'esqueci') {
        const { error } = await sb.auth.resetPasswordForEmail(d.email, { redirectTo: location.origin + location.pathname });
        btn.disabled = false; err(error ? friendlyError(error) : 'Se o e-mail estiver cadastrado, o link chegará em alguns minutos.');
      } else {
        if ((d.pass || '').length < 8) { btn.disabled = false; return err('A senha precisa ter ao menos 8 caracteres.'); }
        const { data, error } = await sb.auth.signUp({ email: d.email, password: d.pass, options: { data: { name: d.name }, emailRedirectTo: location.origin + location.pathname } });
        btn.disabled = false;
        if (error) return err(friendlyError(error));
        if (data.session) return CLOUD.enter(data.user);
        LOGIN_VIEW = 'entrar'; LOGIN_MSG = 'Confira seu e-mail e clique no link de confirmação. Depois entre com a senha criada.'; render();
      }
    } catch (x) { btn.disabled = false; err(x instanceof TypeError ? 'Sem conexão com o servidor.' : friendlyError(x)); }
  });
}
ACTIONS['cl-view'] = a => { LOGIN_VIEW = a.dataset.v; LOGIN_MSG = ''; render(); };
ACTIONS['cl-demo'] = () => { try { sessionStorage.setItem('vialink-mode', 'demo'); } catch (e) { } APP_MODE = 'demo'; load(); CUR = null; ROUTE = { page: 'login', p: {} }; render(); TC.start(); };
ACTIONS['cl-back'] = () => { try { sessionStorage.removeItem('vialink-mode'); sessionStorage.removeItem('vialink-user'); } catch (e) { } TC.stop(); S = null; CUR = null; CLOUD.boot(); };

PAGES.senha = {
  title: 'Definir senha', driver: true,
  render() {
    const first = CLOUD.profile?.must_change_password && !RECOVERY;
    return `<div class="${CUR?.role === 'condutor' ? 'drv' : ''}" style="max-width:460px"><div class="panel"><div class="panel-b stack">
      <h2>${first ? 'Crie sua senha' : 'Nova senha'}</h2><p class="muted">${first ? 'Você entrou com uma senha provisória. Escolha uma senha pessoal para continuar.' : 'Digite a nova senha duas vezes.'}</p>
      <form id="pw-form" class="stack" style="gap:12px">
        <label class="field"><span>Nova senha (mín. 8 caracteres)</span><input class="inp" type="password" name="p1" minlength="8" autocomplete="new-password" required></label>
        <label class="field"><span>Repita a senha</span><input class="inp" type="password" name="p2" minlength="8" autocomplete="new-password" required></label>
        <p class="err" id="pw-err"></p><button class="btn ok lg">Salvar senha</button></form></div></div></div>`;
  },
  mount() {
    $('#pw-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const d = formData(e.target); const err = t => $('#pw-err').textContent = t;
      if (d.p1.length < 8) return err('A senha precisa ter ao menos 8 caracteres.');
      if (d.p1 !== d.p2) return err('As duas senhas não conferem.');
      const { error } = await CLOUD.client().auth.updateUser({ password: d.p1 });
      if (error) return err(/different|same/i.test(error.message) ? 'Escolha uma senha diferente da atual.' : friendlyError(error));
      try { await CLOUD.rpc('password_changed'); } catch (x) { }
      CLOUD.profile.must_change_password = false; RECOVERY = false;
      toast('Senha salva.'); go(homePage());
    });
  }
};

/* ===================== Usuários e acessos (administrador) ===================== */
const tempPassword = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint32Array(10)); return 'Vl-' + [...r].map(x => a[x % a.length]).join(''); };
function cloudUsersTab() {
  const rows = S.users.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)).map(u => `<tr style="${u.active ? '' : 'opacity:.6'}"><td><b>${esc(u.name)}</b>${u.id === CUR.id ? ' <span class="pill blue">você</span>' : ''}${u.mustChange ? ' <span class="pill">senha provisória</span>' : ''}</td><td class="small">${esc(u.email)}</td>
    <td>${u.id === CUR.id ? ROLES[u.role] : `<select class="inp" style="min-height:32px;padding:4px 8px" data-act-change="u-role" data-id="${u.id}">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
    <td class="small">${u.driverId ? esc(drv(u.driverId)?.name || '—') : '—'}</td>
    <td>${u.active ? pill('Ativo', 'ok') : pill('Inativo')}</td>
    <td class="r nowrap">${u.id === CUR.id ? '' : `<button class="btn sm" data-act="u-pass" data-id="${u.id}">Nova senha</button> <button class="btn sm ${u.active ? 'danger' : 'pri'}" data-act="u-toggle" data-id="${u.id}">${u.active ? 'Inativar' : 'Reativar'}</button>`}</td></tr>`);
  return `<div class="panel-b row" style="justify-content:space-between"><p class="muted small" style="max-width:640px">O acesso é criado aqui com uma senha provisória; no primeiro login a pessoa escolhe a própria senha. Inativar bloqueia o login na hora e todo o conteúdo deixa de ser lido pelo banco.</p><button class="btn pri" data-act="u-new">${ic('plus')}Novo usuário</button></div>
    ${tbl(['Nome', 'E-mail', 'Perfil', 'Condutor vinculado', 'Situação', ''], rows)}
    <div class="panel-b"><h3 style="margin-bottom:8px">O que cada perfil pode fazer</h3>${tbl(['Ação', 'Condutor', 'Supervisor', 'Gestor de Frota', 'Administrador'], [['Escanear, receber, entregar, checklists e abastecer (somente o próprio)', 1, 0, 1, 1], ['Ver painel, veículos, condutores, custos e relatórios', 0, 1, 1, 1], ['Transferência forçada, pedágios, multas, manutenção e premiação', 0, 0, 1, 1], ['Cadastrar condutores e liberar o acesso deles', 0, 0, 1, 1], ['Criar usuários de qualquer perfil, regras e integrações', 0, 0, 0, 1]].map(([l, ...r]) => `<tr><td>${l}</td>${r.map(x => `<td>${x ? '<span class="st"><span class="dot ok"></span>Sim</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`))}
      <p class="small muted" style="margin-top:8px">As regras valem no banco de dados (RLS): mesmo fora do aplicativo, um condutor não lê dados de outro condutor.</p></div>`;
}
function userForm() {
  return `<form id="u-form" class="form-grid">
    <label class="field full"><span>Nome completo</span><input class="inp" name="name"></label>
    <label class="field full"><span>E-mail de acesso</span><input class="inp" name="email" type="email" placeholder="nome.sobrenome@empresa.com.br"></label>
    <label class="field"><span>Perfil</span><select class="inp" name="role">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === 'gestor' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Condutor vinculado</span><select class="inp" name="driverId"><option value="">—</option>${S.drivers.filter(d => d.active !== false && !S.users.some(u => u.driverId === d.id)).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select><small>Obrigatório para o perfil Condutor</small></label>
    <p class="err full" id="u-err"></p></form>`;
}
ACTIONS['u-new'] = () => openModal({ title: 'Novo usuário', body: userForm(), foot: '<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="u-create">Criar acesso</button>' });
ACTIONS['u-create'] = async a => {
  const d = formData($('#u-form')); const err = t => $('#u-err').textContent = t;
  if (d.name.split(' ').filter(Boolean).length < 2) return err('Informe nome e sobrenome.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return err('Informe um e-mail válido.');
  if (d.role === 'condutor' && !d.driverId) return err('Vincule o cadastro do condutor (cadastre-o antes em Condutores).');
  a.disabled = true; err('');
  const password = tempPassword();
  try {
    const r = await CLOUD.fn('admin-users', { action: 'create', name: d.name, email: d.email, role: d.role, driverId: d.driverId || null, password });
    log('config', `Acesso criado para ${d.name} (${ROLES[d.role]}) por ${CUR.name}`, { driverId: d.driverId || null }); save();
    await CLOUD.reload(true);
    showTempPassword(r.profile.name, r.profile.email, password);
  } catch (e) { a.disabled = false; err(friendlyError(e)); }
};
function showTempPassword(name, email, password) {
  openModal({
    title: 'Acesso criado', body: `<p>Entregue estes dados a <b>${esc(name)}</b>. No primeiro login o sistema pede uma senha pessoal.</p>
      <div class="note" style="margin-top:10px"><div><div class="small muted">E-mail</div><b class="mono">${esc(email)}</b><div class="small muted" style="margin-top:6px">Senha provisória</div><b class="mono" style="font-size:18px">${esc(password)}</b></div></div>
      <p class="small muted" style="margin-top:8px">Esta senha não fica guardada e não aparece de novo. Se perder, gere outra em “Nova senha”.</p>`,
    foot: `<button class="btn" data-act="u-copy" data-t="${esc(`gestaovia\nE-mail: ${email}\nSenha provisória: ${password}`)}">Copiar</button><button class="btn pri" data-act="modal-close">Pronto</button>`
  });
}
ACTIONS['u-copy'] = async a => { try { await navigator.clipboard.writeText(a.dataset.t); toast('Copiado.'); } catch (e) { toast('Selecione e copie manualmente.'); } };
ACTIONS['u-pass'] = a => {
  const u = byId(S.users, a.dataset.id);
  openModal({ title: `Nova senha para ${u.name}`, body: '<p>Uma senha provisória será gerada agora. A senha atual deixa de valer e, no próximo login, a pessoa escolhe uma senha pessoal.</p>', foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="u-pass-ok" data-id="${u.id}">Gerar senha</button>` });
};
ACTIONS['u-pass-ok'] = async a => {
  const u = byId(S.users, a.dataset.id); const password = tempPassword(); a.disabled = true;
  try { await CLOUD.fn('admin-users', { action: 'reset_password', id: u.id, password }); closeModal(); log('config', `Senha provisória gerada para ${u.name} por ${CUR.name}`, { driverId: u.driverId }); save(); await CLOUD.reload(true); showTempPassword(u.name, u.email, password); }
  catch (e) { a.disabled = false; toast(friendlyError(e)); }
};
ACTIONS['u-toggle'] = async a => {
  const u = byId(S.users, a.dataset.id); a.disabled = true;
  try { await CLOUD.fn('admin-users', { action: 'update', id: u.id, active: !u.active }); log('config', `Acesso de ${u.name} ${u.active ? 'inativado' : 'reativado'} por ${CUR.name}`, { driverId: u.driverId }); save(); await CLOUD.reload(true); toast(u.active ? `${u.name} inativado.` : `${u.name} reativado.`); }
  catch (e) { a.disabled = false; toast(friendlyError(e)); }
};
document.addEventListener('change', async e => {
  if (e.target.dataset?.actChange !== 'u-role') return;
  const u = byId(S.users, e.target.dataset.id); const role = e.target.value;
  if (role === 'condutor' && !u.driverId) { e.target.value = u.role; return toast('Para o perfil Condutor, crie o acesso a partir do cadastro do condutor.'); }
  try { await CLOUD.fn('admin-users', { action: 'update', id: u.id, role }); log('config', `Perfil de ${u.name} alterado para ${ROLES[role]} por ${CUR.name}`, {}); save(); await CLOUD.reload(true); toast('Perfil atualizado.'); }
  catch (x) { e.target.value = u.role; toast(friendlyError(x)); }
});

/* ===================== Condutor: cadastro + acesso ao aplicativo ===================== */
// chamado depois que o cadastro do condutor já foi gravado
async function cloudDriverAccess(d, email, isNew) {
  const u = S.users.find(x => x.driverId === d.id);
  try {
    if (!u && email) {
      await CLOUD.flush();
      const password = tempPassword();
      await CLOUD.fn('admin-users', { action: 'create', name: d.name, email, role: 'condutor', driverId: d.id, password });
      await CLOUD.reload(true);
      showTempPassword(d.name, email, password);
    } else if (u && (u.email !== email.toLowerCase() || u.name !== d.name)) {
      await CLOUD.flush();
      await CLOUD.fn('admin-users', { action: 'update', id: u.id, name: d.name, email });
      await CLOUD.reload(true);
    }
  } catch (e) { toast((isNew ? 'Condutor cadastrado, mas o acesso não foi criado: ' : 'Cadastro salvo, mas o acesso não foi atualizado: ') + friendlyError(e)); }
}
async function cloudDriverActive(d, active) {
  const u = S.users.find(x => x.driverId === d.id); if (!u) return;
  try { await CLOUD.flush(); await CLOUD.fn('admin-users', { action: 'update', id: u.id, active }); await CLOUD.reload(true); }
  catch (e) { toast('O acesso ao aplicativo não foi alterado: ' + friendlyError(e)); }
}

/* ===================== Dados de exemplo no banco (para conhecer o sistema) ===================== */
function remapDemo(D) {
  const map = new Map();
  ['costCenters', 'projects', 'drivers', 'vehicles', 'qrcodes', 'custody', 'transfers', 'checklists', 'issues', 'fuel', 'plans', 'maintRecords', 'tolls', 'fines', 'notifications', 'audit', 'trackerEvents']
    .forEach(k => (D[k] || []).forEach(o => { if (!isUUID(o.id)) map.set(o.id, crypto.randomUUID()); }));
  (D.users || []).forEach(u => map.set(u.id, CUR.id));
  const walk = v => {
    if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[map.has(k) ? map.get(k) : k] = walk(x); return o; }
    return v;
  };
  return walk(D);
}
ACTIONS['cl-seed'] = async a => {
  if (S.vehicles.length) return toast('O banco já tem veículos. A carga de exemplo só roda com o banco vazio.');
  a.disabled = true; a.textContent = 'Carregando…';
  const D = remapDemo(seed());
  ['costCenters', 'projects', 'drivers', 'vehicles', 'qrcodes', 'custody', 'transfers', 'checklists', 'issues', 'fuel', 'plans', 'maintRecords', 'tolls', 'fines', 'notifications', 'audit', 'trackerEvents'].forEach(k => S[k] = D[k] || []);
  S.locations = D.locations || {};
  await CLOUD.flush();
  await CLOUD.reload(true);
  toast(CLOUD.status === 'ok' ? 'Dados de exemplo gravados no banco.' : 'A carga não terminou. Veja a mensagem de erro.');
};
ACTIONS['cl-logout'] = () => CLOUD.leave();
