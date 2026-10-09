/* ===================== Integração Traccar (rastreamento) =====================
   Servidor real: REST /api/* com "Authorization: Bearer <token>" e WebSocket /api/socket?token=<token>.
   Requer web.origin no traccar.xml apontando para o domínio do gestaovia (CORS).
   Simulador: gera devices/positions/events no mesmo formato JSON do Traccar 6.x. */
const KNOT = 1.852;
const ALARM_LABEL = { overspeed: 'Excesso de velocidade', hardBraking: 'Frenagem brusca', hardAcceleration: 'Aceleração brusca', hardCornering: 'Curva brusca', sos: 'Botão de pânico', powerCut: 'Rastreador desligado da bateria', tampering: 'Violação do rastreador' };
const TELEMETRY_ALARMS = ['overspeed', 'hardBraking', 'hardAcceleration', 'hardCornering'];

const TC = {
  state: 'off',        // off | connecting | live | polling | error
  msg: '', devices: [], lastMsg: 0, ws: null, timer: null, sim: null, routes: {},
  cfg() { return S.settings.traccar; },
  vehicleOfDevice(deviceId) { return S.vehicles.find(v => v.traccarId === deviceId) || null; },

  /* ---------- servidor real ---------- */
  async req(path, params) {
    if (APP_MODE === 'cloud') return CLOUD.fn('traccar-proxy', { action: path === '/devices' ? 'devices' : 'positions', ...(params || {}) });
    const c = this.cfg(); const base = c.url.replace(/\/+$/, '');
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${base}/api${path}${q}`, { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json' } });
    if (r.status === 401) throw new Error('Token recusado pelo Traccar (401). Gere um novo token em Configurações › Preferências › Token.');
    if (!r.ok) throw new Error(`Traccar respondeu ${r.status}.`);
    return r.json();
  },
  async start() {
    this.stop();
    const c = this.cfg(); if (!c || c.mode === 'off') { this.state = 'off'; return; }
    if (c.mode === 'simulador' && APP_MODE !== 'cloud') return this.startSim();
    if (APP_MODE === 'cloud') {
      if (!CLOUD.on || CUR?.role === 'condutor' || c.mode !== 'servidor') { this.state = 'off'; return; }
      try { this.server = await CLOUD.rpc('traccar_status'); } catch (e) { this.server = null; }
      if (!this.server?.hasToken || !this.server?.url) { this.state = 'error'; this.msg = 'O administrador ainda não informou o servidor e o token.'; return; }
    } else if (!c.url || !c.token) { this.state = 'error'; this.msg = 'Informe o endereço do servidor e o token.'; return; }
    this.state = 'connecting'; this.msg = 'Conectando…'; this.paint();
    try {
      this.devices = await this.req('/devices');
      this.applyDevices(this.devices);
      this.applyPositions(await this.req('/positions'));
      if (c.live && APP_MODE !== 'cloud') this.openSocket(); else this.startPolling(APP_MODE === 'cloud' ? `Pelo servidor do gestaovia, a cada ${c.pollSec} s` : undefined);
    } catch (e) {
      this.state = 'error';
      this.msg = e instanceof TypeError ? 'Não foi possível alcançar o servidor. Confira o endereço (https), o web.origin no traccar.xml e se a rede permite a conexão.' : e.message;
      this.paint();
    }
  },
  openSocket() {
    const c = this.cfg(); const url = c.url.replace(/\/+$/, '').replace(/^http/, 'ws') + '/api/socket?token=' + encodeURIComponent(c.token);
    try {
      const ws = new WebSocket(url); this.ws = ws;
      ws.onopen = () => { this.state = 'live'; this.msg = 'Tempo real (WebSocket)'; this.paint(); };
      ws.onmessage = ev => { try { this.onData(JSON.parse(ev.data)); } catch (e) { } };
      ws.onerror = () => { if (this.ws === ws) { this.ws = null; this.startPolling('WebSocket indisponível; usando consulta periódica.'); } };
      ws.onclose = () => { if (this.ws === ws && this.state === 'live') { this.ws = null; this.startPolling('Conexão em tempo real caiu; usando consulta periódica.'); } };
    } catch (e) { this.startPolling('WebSocket indisponível; usando consulta periódica.'); }
  },
  startPolling(note) {
    clearInterval(this.timer); const c = this.cfg();
    this.state = 'polling'; this.msg = note || `Consulta a cada ${c.pollSec} s`; this.paint();
    this.timer = setInterval(async () => { try { this.applyPositions(await this.req('/positions')); } catch (e) { this.state = 'error'; this.msg = e.message; this.paint(); } }, Math.max(10, c.pollSec) * 1000);
  },
  stop() { clearInterval(this.timer); this.timer = null; if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) { } } clearInterval(this.sim); this.sim = null; },
  async testConnection(url, token) {
    if (APP_MODE === 'cloud') return CLOUD.fn('traccar-proxy', { action: 'test', url, token });
    const base = url.replace(/\/+$/, '');
    const r = await fetch(`${base}/api/session?token=${encodeURIComponent(token)}`, { credentials: 'omit' });
    if (!r.ok) throw new Error(r.status === 404 || r.status === 401 ? 'Token inválido para este servidor.' : `Traccar respondeu ${r.status}.`);
    const user = await r.json();
    const d = await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json());
    return { user: user.name || user.email, devices: d };
  },
  async route(vid, from, to) {
    const v = veh(vid); if (!v?.traccarId) return [];
    const key = `${vid}:${startOfDay(from)}`;
    if (this.cfg().mode === 'simulador') return this.simRoute(v, from, to);
    if (this.routes[key] && nowTs() - this.routes[key].at < 60000) return this.routes[key].pts;
    try { const pts = await this.req('/positions', { deviceId: v.traccarId, from: new Date(from).toISOString(), to: new Date(to).toISOString() }); this.routes[key] = { at: nowTs(), pts }; return pts; }
    catch (e) { return []; }
  },

  /* ---------- aplicação dos dados (mesmo formato do Traccar) ---------- */
  onData(d) {
    this.lastMsg = nowTs();
    if (d.devices) this.applyDevices(d.devices);
    if (d.positions) this.applyPositions(d.positions);
    if (d.events) this.applyEvents(d.events);
  },
  applyDevices(list) {
    list.forEach(dv => { const i = this.devices.findIndex(x => x.id === dv.id); if (i >= 0) this.devices[i] = dv; else this.devices.push(dv); });
    // vínculo automático: nome do dispositivo igual à placa
    this.devices.forEach(dv => { const v = S.vehicles.find(x => !x.traccarId && x.plate === String(dv.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '')); if (v) { v.traccarId = dv.id; v.traccarUniqueId = dv.uniqueId; v.tracker = true; } });
  },
  applyPositions(list) {
    const c = this.cfg(); let changed = false;
    list.forEach(p => {
      const v = this.vehicleOfDevice(p.deviceId); if (!v || p.valid === false) return;
      const at = Date.parse(p.fixTime || p.deviceTime || p.serverTime);
      const prev = S.locations[v.id]; if (prev && prev.at > at && prev.source === 'traccar') return;
      const a = p.attributes || {};
      const km = a.odometer ? a.odometer / 1000 : a.totalDistance ? a.totalDistance / 1000 : null;
      S.locations[v.id] = { lat: p.latitude, lng: p.longitude, speed: Math.round((p.speed || 0) * KNOT), course: p.course, ignition: a.ignition ?? (p.speed > 1), motion: a.motion, km: km ? Math.round(km) : v.odometer, at, address: p.address || '', source: 'traccar', positionId: p.id };
      if (c.odometer && km && km > v.odometer && km - v.odometer < 5000) v.odometer = Math.round(km);
      if (this.routes[`${v.id}:${startOfDay(at)}`]) this.routes[`${v.id}:${startOfDay(at)}`].pts.push(p);
      changed = true;
    });
    if (changed) { this.lastMsg = nowTs(); this.live(); }
  },
  applyEvents(list) {
    list.forEach(e => {
      const v = this.vehicleOfDevice(e.deviceId); if (!v) return;
      const at = Date.parse(e.eventTime);
      const kind = e.type === 'alarm' ? (e.attributes?.alarm || 'alarm') : e.type === 'deviceOverspeed' ? 'overspeed' : e.type;
      if (!ALARM_LABEL[kind]) return; // ignora ignição, entrada em cerca etc. neste protótipo
      if (S.trackerEvents.some(x => x.extId === e.id && e.id)) return;
      const c = custodyAt(v.id, at);
      const sp = e.attributes?.speed ? Math.round(e.attributes.speed * KNOT) : S.locations[v.id]?.speed;
      const ev = { id: uid('tev'), extId: e.id || null, vehicleId: v.id, driverId: c?.driverId || null, type: kind, at, speed: sp || null, lat: S.locations[v.id]?.lat, lng: S.locations[v.id]?.lng };
      S.trackerEvents.push(ev);
      log('telemetria', `${ALARM_LABEL[kind]}${sp ? ` (${sp} km/h)` : ''} registrado pelo rastreador`, { vehicleId: v.id, driverId: ev.driverId, at, userId: 'sistema' });
      if (['overspeed', 'sos', 'powerCut', 'tampering'].includes(kind)) notify('gestao', `${v.plate}: ${ALARM_LABEL[kind]}${sp ? ` a ${sp} km/h` : ''}${ev.driverId ? ` · ${drv(ev.driverId).name}` : ''}.`, { level: kind === 'overspeed' ? 'warn' : 'bad', link: { page: 'veiculo', id: v.id } });
    });
    this.live();
  },
  /* atualização visual sem recarregar a página */
  live() {
    if (!CUR || CUR.role === 'condutor') return;
    liveUpdateMaps();
    const b = $('#tc-badge'); if (b) b.outerHTML = tcBadge();
    clearTimeout(this._sv); this._sv = setTimeout(save, 4000);
  },
  paint() { const b = $('#tc-badge'); if (b) b.outerHTML = tcBadge(); const s = $('#tc-status'); if (s) s.outerHTML = tcStatusBox(); },

  /* ---------- simulador (mesmos JSONs do Traccar) ---------- */
  startSim() {
    this.state = 'live'; this.msg = 'Simulador (dados de demonstração)';
    this.devices = S.vehicles.filter(v => v.traccarId).map(v => ({ id: v.traccarId, name: v.plate, uniqueId: v.traccarUniqueId, status: 'online', lastUpdate: new Date().toISOString(), category: 'car', attributes: {} }));
    this.sim = setInterval(() => this.simTick(), 5000);
    this.paint();
  },
  simTick() {
    const positions = [], events = [];
    S.vehicles.filter(v => v.traccarId && v.active).forEach(v => {
      const l = S.locations[v.id]; if (!l) return;
      const c = activeCustody(v.id); const blocked = v.maintenance || openIssues(v.id).some(i => !i.canRun);
      let { lat, lng } = l; let speed = 0; let ign = l.ignition;
      if (c && !blocked) {
        if (!ign && Math.random() < .12) ign = true;
        const seg = currentSegment(c); const tgt = seg ? prj(seg.projectId) : prj('pmat');
        const dLat = tgt.lat - lat, dLng = tgt.lng - lng, dist = Math.hypot(dLat, dLng);
        if (ign && dist > .004) {
          const step = Math.min(dist, .0025 + Math.random() * .003);
          lat += dLat / dist * step + (Math.random() - .5) * .001; lng += dLng / dist * step + (Math.random() - .5) * .001;
          speed = Math.round(40 + Math.random() * 55); if (Math.random() < .04) speed = 104 + Math.round(Math.random() * 18);
        } else if (ign && Math.random() < .35) ign = false;
      } else ign = false;
      const kmNow = (l.km || v.odometer) + Math.hypot(lat - l.lat, (lng - l.lng) * .92) * 111 * 1.25;
      const pid = Math.floor(Math.random() * 1e9);
      positions.push({ id: pid, deviceId: v.traccarId, protocol: 'osmand', fixTime: new Date().toISOString(), valid: true, latitude: +lat.toFixed(6), longitude: +lng.toFixed(6), speed: speed / KNOT, course: 0, address: '', attributes: { ignition: ign, motion: speed > 3, odometer: Math.round(kmNow * 1000), totalDistance: Math.round(kmNow * 1000) } });
      if (speed > S.settings.traccar.speedLimit) events.push({ id: pid + 1, type: 'deviceOverspeed', eventTime: new Date().toISOString(), deviceId: v.traccarId, positionId: pid, attributes: { speed: speed / KNOT } });
      else if (speed > 30 && Math.random() < .015) events.push({ id: pid + 2, type: 'alarm', eventTime: new Date().toISOString(), deviceId: v.traccarId, positionId: pid, attributes: { alarm: Math.random() < .5 ? 'hardBraking' : 'hardAcceleration' } });
    });
    this.onData({ positions }); if (events.length) this.onData({ events });
  },
  simRoute(v, from, to) {
    // trajeto do dia: da matriz até as obras da posse, com a posição atual no final
    const c = custodyAt(v.id, Math.min(to, nowTs())) || activeCustody(v.id); const l = S.locations[v.id]; if (!c || !l) return [];
    const start = Math.max(from, c.start, startOfDay(to) + 7 * 36e5); if (start >= Math.min(to, nowTs())) return [];
    const stops = [prj('pmat'), ...c.segments.filter(s => s.at < to).map(s => prj(s.projectId)).filter(Boolean)].slice(-3);
    const pts = []; const path = [...stops.map(p => [p.lat, p.lng]), [l.lat, l.lng]];
    const tot = path.length - 1; const t0 = start, t1 = Math.min(to, l.at || nowTs());
    for (let i = 0; i <= 40; i++) {
      const f = i / 40 * tot; const k = Math.min(tot - 1, Math.floor(f)); const u = f - k;
      const [a1, b1] = path[k], [a2, b2] = path[k + 1];
      const wob = i && i < 40 ? (Math.sin(i * 1.7 + v.plate.charCodeAt(0)) * .0022) : 0;
      pts.push({ deviceId: v.traccarId, fixTime: new Date(t0 + (t1 - t0) * i / 40).toISOString(), latitude: a1 + (a2 - a1) * u + wob, longitude: b1 + (b2 - b1) * u - wob, speed: (i % 9 === 0 ? 0 : 38 + (i * 7) % 45) / KNOT, attributes: {} });
    }
    return pts;
  }
};

/* ---------- mapa ao vivo ---------- */
function liveUpdateMaps() {
  MAPS.forEach(map => {
    Object.entries(map._vm || {}).forEach(([vid, m]) => {
      const v = veh(vid); const loc = lastLocation(vid); if (!loc) return;
      m.setLatLng([loc.lat, loc.lng]);
      const st = vStatus(v); if (m._st !== st) { m._st = st; m.setIcon(vehicleIcon(v, st)); }
      if (m.isPopupOpen()) m.setPopupContent(vehiclePopup(v, loc));
    });
    if (map._route && map._routeVid) { const l = S.locations[map._routeVid]; if (l && l.source === 'traccar') map._route.addLatLng([l.lat, l.lng]); }
  });
}
function tcBadge() {
  const c = S.settings.traccar; const map = { off: ['gray', 'Rastreador desligado'], connecting: ['warn', 'Conectando ao Traccar…'], live: ['ok', c.mode === 'simulador' ? 'Traccar · simulador ao vivo' : 'Traccar · ao vivo'], polling: ['neu', 'Traccar · consulta periódica'], error: ['bad', 'Traccar · sem conexão'] }[TC.state] || ['gray', ''];
  return `<button id="tc-badge" class="pill ${map[0] === 'gray' ? '' : map[0] === 'neu' ? 'blue' : map[0]}" ${isStaff() && CUR.role === 'admin' ? 'data-go="configuracoes" data-tab="integ"' : ''} style="border:none;cursor:${CUR.role === 'admin' ? 'pointer' : 'default'}" title="${esc(TC.msg)}"><span class="dot ${map[0]}" style="width:7px;height:7px;box-shadow:none"></span>${map[1]}${TC.lastMsg ? ` · ${fmtTime(TC.lastMsg)}` : ''}</button>`;
}

/* ---------- tela de configuração ---------- */
function tcStatusBox() {
  const c = S.settings.traccar;
  const cls = { live: 'ok', polling: 'neu', connecting: 'warn', error: 'bad', off: '' }[TC.state] || '';
  return `<div id="tc-status" class="note ${cls}">${ic('road')}<div><b>${{ live: 'Conectado', polling: 'Conectado (consulta periódica)', connecting: 'Conectando…', error: 'Sem conexão', off: 'Integração desligada' }[TC.state]}</b>${TC.msg ? ` · ${esc(TC.msg)}` : ''}${TC.lastMsg ? `<div class="small">Última posição recebida às ${fmtTime(TC.lastMsg)} · ${S.vehicles.filter(v => v.traccarId).length} veículo(s) vinculados</div>` : ''}${c.mode === 'servidor' && APP_MODE !== 'cloud' ? '<div class="small">No visualizador do Claude a conexão externa é bloqueada. Teste publicado no seu domínio (Hostinger).</div>' : ''}</div></div>`;
}
function traccarSettings() {
  const c = S.settings.traccar;
  const devs = TC.devices.length ? TC.devices : [];
  const rows = S.vehicles.filter(v => v.active).map(v => {
    const l = S.locations[v.id]; const opts = devs.map(d => `<option value="${d.id}" ${v.traccarId === d.id ? 'selected' : ''}>${esc(d.name)} · ${esc(d.uniqueId)}</option>`).join('');
    return `<tr><td>${plate(v.plate)}</td><td>${devs.length ? `<select class="inp tc-map" data-vid="${v.id}" style="min-height:34px;padding:4px 8px"><option value="">Sem rastreador</option>${opts}</select>` : (v.traccarId ? `<span class="small">ID ${v.traccarId} · ${esc(v.traccarUniqueId || '')}</span>` : '<span class="muted small">—</span>')}</td>
      <td class="small">${l && l.source === 'traccar' ? `${fmtShort(l.at)} · ${l.speed} km/h · ignição ${l.ignition ? 'ligada' : 'desligada'}` : '<span class="muted">sem posição</span>'}</td></tr>`;
  });
  const recent = S.trackerEvents.slice().sort((a, b) => b.at - a.at).slice(0, 8);
  return `<div class="panel-b stack" style="padding-top:14px">
    ${tcStatusBox()}
    <form id="tc-form" class="stack" style="gap:14px">
      <div class="field"><span>Origem das posições</span><div class="seg">
        ${APP_MODE === 'cloud' ? '' : `<label><input type="radio" name="mode" value="simulador" ${c.mode === 'simulador' ? 'checked' : ''}><span>Simulador (demonstração)</span></label>`}
        <label><input type="radio" name="mode" value="servidor" ${c.mode === 'servidor' ? 'checked' : ''}><span>Servidor Traccar</span></label>
        <label><input type="radio" name="mode" value="off" ${c.mode === 'off' ? 'checked' : ''}><span>Desligado</span></label></div></div>
      <div class="form-grid" id="tc-server" ${c.mode === 'servidor' ? '' : 'hidden'}>
        <label class="field"><span>Endereço do servidor</span><input class="inp" name="url" value="${esc(c.url)}" placeholder="https://rastreio.suaempresa.com.br"></label>
        <label class="field"><span>Token de acesso</span><input class="inp" name="token" type="password" value="${APP_MODE === 'cloud' ? '' : esc(c.token)}" placeholder="${APP_MODE === 'cloud' && TC.server?.hasToken ? 'Token guardado no servidor (deixe em branco para manter)' : 'Gerado no Traccar em Preferências › Token'}" autocomplete="off">${APP_MODE === 'cloud' ? '<small>Fica guardado só no servidor. O navegador nunca recebe o token de volta.</small>' : ''}</label>
        ${APP_MODE === 'cloud' ? `<div class="field full" id="tc-hook"><span>Encaminhamento de posições (traccar.xml)</span>${tcWebhookBox()}</div>` : ''}
      </div>
      <div class="form-grid three">
        <label class="field"><span>Velocidade máxima (km/h)</span><input class="inp num" name="speedLimit" value="${c.speedLimit}"><small>Acima disso conta como excesso</small></label>
        <label class="field"><span>Consulta periódica (s)</span><input class="inp num" name="pollSec" value="${c.pollSec}"><small>Usada se o tempo real cair</small></label>
        <div class="field"><span>Opções</span>${APP_MODE === 'cloud' ? '' : `<label class="row small" style="gap:8px"><span class="toggle"><input type="checkbox" name="live" ${c.live ? 'checked' : ''}><i></i></span>Tempo real (WebSocket)</label>`}<label class="row small" style="gap:8px"><span class="toggle"><input type="checkbox" name="odometer" ${c.odometer ? 'checked' : ''}><i></i></span>Atualizar hodômetro pelo rastreador</label></div>
      </div>
      <p class="err" id="tc-err"></p>
      <div class="row"><button class="btn ok">Salvar e conectar</button><button type="button" class="btn" data-act="tc-test">Testar conexão</button></div>
    </form>
    <div><h3 style="margin-bottom:8px">Veículos e dispositivos</h3>${tbl(['Veículo', 'Dispositivo no Traccar', 'Última posição'], rows)}<p class="small muted" style="margin-top:8px">Dispositivos com o nome igual à placa são vinculados automaticamente. O identificador (IMEI) é o mesmo cadastrado no Traccar.</p></div>
    <div><h3 style="margin-bottom:8px">Últimos alertas de condução</h3>${recent.length ? `<ul class="att" style="padding:0">${recent.map(e => `<li data-go="veiculo" data-id="${e.vehicleId}"><span class="ic ${e.type === 'overspeed' ? 'urg' : 'warn'}">${ic('gauge')}</span><div><b>${veh(e.vehicleId).plate} · ${ALARM_LABEL[e.type]}${e.speed ? ` · ${e.speed} km/h` : ''}</b><small>${e.driverId ? esc(drv(e.driverId).name) : 'Sem condutor na posse'}</small></div><span class="when">${fmtShort(e.at)}</span></li>`).join('')}</ul>` : empty('Nenhum alerta ainda.')}</div>
  </div>`;
}
function mountTraccarSettings() {
  const f = $('#tc-form'); if (!f) return;
  f.addEventListener('change', e => { if (e.target.name === 'mode') $('#tc-server').hidden = e.target.value !== 'servidor'; });
  if (APP_MODE === 'cloud' && CUR.role === 'admin') CLOUD.rpc('traccar_status').then(st => { TC.server = st; const h = $('#tc-hook'); if (h) h.innerHTML = '<span>Encaminhamento de posições (traccar.xml)</span>' + tcWebhookBox(); const t = f.querySelector('[name=token]'); if (t && st?.hasToken) t.placeholder = 'Token guardado no servidor (deixe em branco para manter)'; }).catch(() => { });
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = formData(f); const c = S.settings.traccar;
    if (d.mode === 'servidor') { if (!/^https?:\/\//.test(d.url)) return $('#tc-err').textContent = 'Informe o endereço completo, começando com https://'; if (!d.token && !(APP_MODE === 'cloud' && TC.server?.hasToken)) return $('#tc-err').textContent = 'Informe o token de acesso do Traccar.'; }
    if (APP_MODE === 'cloud' && d.mode === 'servidor') {
      try { TC.server = await CLOUD.rpc('set_traccar_config', { p_url: d.url, p_token: d.token || null }); }
      catch (x) { return $('#tc-err').textContent = friendlyError(x); }
      d.token = '';
    }
    Object.assign(c, { mode: d.mode, url: d.url || c.url, speedLimit: +d.speedLimit || 100, pollSec: +d.pollSec || 30, live: !!f.querySelector('[name=live]')?.checked, odometer: !!f.querySelector('[name=odometer]').checked });
    if (APP_MODE !== 'cloud') c.token = d.token || c.token; else delete c.token;
    log('config', `Integração Traccar configurada por ${CUR.name} (${d.mode})`, {}); save(); TC.start().then(() => render()); toast('Configuração salva.'); render();
  });
  $$('.tc-map').forEach(s => s.addEventListener('change', () => {
    const v = veh(s.dataset.vid); const dv = TC.devices.find(x => String(x.id) === s.value);
    S.vehicles.forEach(o => { if (dv && o.traccarId === dv.id && o !== v) o.traccarId = null; });
    v.traccarId = dv ? dv.id : null; v.traccarUniqueId = dv ? dv.uniqueId : null; v.tracker = !!dv;
    log('config', `Rastreador ${dv ? dv.name + ' vinculado ao' : 'desvinculado do'} ${v.plate}`, { vehicleId: v.id }); save(); toast('Vínculo salvo.');
  }));
}
ACTIONS['tc-test'] = async () => {
  const f = $('#tc-form'); const d = formData(f); const err = $('#tc-err');
  if (d.mode !== 'servidor') { err.textContent = ''; return toast(d.mode === 'simulador' ? 'Simulador ativo: posições de demonstração a cada 5 segundos.' : 'Integração desligada.'); }
  err.textContent = 'Testando…';
  try { const r = await TC.testConnection(d.url, d.token); err.textContent = ''; toast(`Conectado como ${r.user}. ${r.devices.length} dispositivo(s) encontrados.`); TC.devices = r.devices; }
  catch (e) { err.textContent = e instanceof TypeError ? 'Sem resposta do servidor. Confira o endereço, o HTTPS e o web.origin no traccar.xml.' : e.message; }
};

function tcWebhookBox() {
  const st = TC.server; if (!st) return '<span class="small muted">Carregando…</span>';
  const url = CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/traccar-webhook';
  if (!st.webhookSecret) return '<span class="small muted">Visível somente para o administrador.</span>';
  const xml = `<entry key='forward.enable'>true</entry>\n<entry key='forward.type'>json</entry>\n<entry key='forward.url'>${url}</entry>\n<entry key='forward.header'>Authorization: Bearer ${st.webhookSecret}</entry>\n<entry key='event.forward.enable'>true</entry>\n<entry key='event.forward.url'>${url}</entry>\n<entry key='event.forward.header'>Authorization: Bearer ${st.webhookSecret}</entry>`;
  return `<textarea class="inp mono small" readonly rows="7" onfocus="this.select()" style="min-height:130px">${esc(xml)}</textarea><small>Cole no traccar.xml do servidor e reinicie o Traccar. As posições e alertas passam a ser gravados no banco mesmo com o gestaovia fechado. Este segredo só aparece para o administrador.</small>`;
}

/* ---------- trajeto do dia no detalhe do veículo ---------- */
async function drawTodayRoute(map, vid) {
  if (!map || !window.L) return;
  const pts = await TC.route(vid, startOfDay(nowTs()), nowTs());
  if (!MAPS.includes(map) || pts.length < 2) return;
  const line = L.polyline(pts.map(p => [p.latitude, p.longitude]), { color: cssVar('--blue'), weight: 4, opacity: .75 }).addTo(map);
  L.circleMarker([pts[0].latitude, pts[0].longitude], { radius: 5, color: '#fff', weight: 2, fillColor: cssVar('--green'), fillOpacity: 1 }).bindTooltip(`Início ${fmtTime(Date.parse(pts[0].fixTime))}`).addTo(map);
  map._route = line; map._routeVid = vid;
  map.fitBounds(line.getBounds(), { padding: [20, 20], animate: false, maxZoom: 14 });
  const km = pts.reduce((s, p, i) => i ? s + Math.hypot(p.latitude - pts[i - 1].latitude, (p.longitude - pts[i - 1].longitude) * .92) * 111 : 0, 0);
  const el = $('#route-info'); if (el) el.textContent = `Trajeto de hoje · ${nf(km * 1.2, 0)} km · ${pts.length} posições`;
}
