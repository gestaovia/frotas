/* ===================== Fluxos do condutor: QR, posse, checklists, abastecimento ===================== */
const PRESENCE = ['estepe', 'ferramentas', 'documentacao'];
const lastRecordedKm = vid => {
  const ks = [...S.checklists.filter(k => k.vehicleId === vid && k.km).map(k => k.km), ...S.fuel.filter(f => f.vehicleId === vid).map(f => f.km), ...S.custody.filter(c => c.vehicleId === vid).map(c => c.endKm || c.startKm)];
  return ks.length ? Math.max(...ks) : 0;
};
const suggestedKm = v => (v.tracker && S.locations[v.id]) ? S.locations[v.id].km : v.odometer;

function captureLocation(v) {
  const tl = currentLocation(v.id);
  if (tl) DRAFT.geo = { lat: tl.lat, lng: tl.lng, source: 'rastreador' };
  try {
    navigator.geolocation?.getCurrentPosition(p => { if (DRAFT) { DRAFT.geo = { lat: p.coords.latitude, lng: p.coords.longitude, source: 'celular' }; const el = $('#geo-txt'); if (el) el.textContent = geoText(DRAFT.geo); } }, () => { }, { timeout: 5000, maximumAge: 60000 });
  } catch (e) { }
}
const geoText = g => g ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)} (${g.source === 'celular' ? 'GPS do celular' : 'rastreador'})` : 'Indisponível neste aparelho';

/* ---------- regras de posse ---------- */
function receiveCheck(v, did) {
  const c = activeCustody(v.id); const t = activeTransfer(v.id);
  if (drv(did)?.active === false) return { ok: false, msg: 'Seu cadastro de condutor está inativo. Procure a gestão da frota.' };
  if (c && c.driverId === did) return { ok: false, mine: true, msg: 'Este veículo já está sob sua responsabilidade.' };
  if (v.maintenance) return { ok: false, msg: 'Veículo em manutenção. O recebimento só é liberado após o checklist de saída da manutenção.' };
  if (openIssues(v.id).some(i => !i.canRun)) return { ok: false, msg: 'Veículo bloqueado por problema crítico. Aguarde a liberação da gestão.' };
  if (c) return { ok: false, other: c, t, msg: `Veículo atualmente sob responsabilidade de ${drv(c.driverId).name}. Para receber este veículo, o atual responsável deve realizar a entrega.` };
  if (t && t.toDriverId !== did) return { ok: false, t, msg: `Existe uma transferência em andamento para ${drv(t.toDriverId).name}.` };
  if (S.settings.oneVehiclePerDriver) { const mine = driverCustodies(did); if (mine.length) return { ok: false, msg: `Você já está com o veículo ${veh(mine[0].vehicleId).plate}. Entregue-o antes de receber outro.` }; }
  return { ok: true, t };
}
function setTransfer(t, status, note = '') {
  t.status = status; t.events.push({ at: nowTs(), status, by: CUR.id, note });
}
function requestTransfer(v, did) {
  const c = activeCustody(v.id);
  const t = { id: uid('trf'), vehicleId: v.id, fromDriverId: c.driverId, toDriverId: did, status: 'solicitada', requestedAt: nowTs(), forced: false, justification: '', requestedBy: CUR.id, fromCustodyId: c.id, toCustodyId: null, deliverChecklistId: null, receiveChecklistId: null, events: [{ at: nowTs(), status: 'solicitada', by: CUR.id, note: `Solicitado por ${drv(did).name}` }] };
  S.transfers.push(t);
  log('transferencia', `${drv(did).name} solicitou a transferência do veículo`, { vehicleId: v.id, driverId: did });
  notify(c.driverId, `${drv(did).name} solicitou a transferência do ${v.plate}. Faça a entrega com o checklist.`, { level: 'warn', link: { page: 'transferencia', id: t.id } });
  save();
  return t;
}

/* ---------- Início do condutor ---------- */
PAGES.inicio = {
  driver: true, title: 'Início',
  render() {
    const d = myDriver(); if (!d) return '<div class="drv"><p>Usuário sem cadastro de condutor.</p></div>';
    const cs = driverCustodies(d.id); const c = cs[0]; const v = c ? veh(c.vehicleId) : null;
    const trs = S.transfers.filter(t => !['concluida', 'cancelada'].includes(t.status) && (t.fromDriverId === d.id || t.toDriverId === d.id));
    const banners = trs.map(t => {
      const tv = veh(t.vehicleId);
      if (t.fromDriverId === d.id && t.status === 'solicitada') return `<div class="note warn stack" style="gap:8px"><div><b>${esc(drv(t.toDriverId).name)}</b> solicitou a transferência do ${plate(tv.plate)}.</div><div class="row"><button class="btn ok" data-act="t-accept" data-id="${t.id}">Aceitar e fazer a entrega</button><button class="btn" data-go="transferencia" data-id="${t.id}">Ver detalhes</button></div></div>`;
      if (t.fromDriverId === d.id && ['aguardando_entrega', 'entrega_andamento'].includes(t.status)) return `<div class="note warn stack" style="gap:8px"><div>Entrega pendente do ${plate(tv.plate)} para <b>${esc(drv(t.toDriverId).name)}</b>.</div><button class="btn pri" data-go="entregar" data-vid="${tv.id}" data-tid="${t.id}">Fazer checklist de entrega</button></div>`;
      if (t.toDriverId === d.id && ['aguardando_recebimento', 'recebimento_andamento'].includes(t.status)) return `<div class="note ok stack" style="gap:8px"><div>O ${plate(tv.plate)} foi entregue e está liberado para você.</div><button class="btn pri" data-go="receber" data-vid="${tv.id}">Fazer checklist de recebimento</button></div>`;
      if (t.toDriverId === d.id) return `<div class="note">Você solicitou o ${plate(tv.plate)}. Aguardando ${esc(drv(t.fromDriverId).name)} realizar a entrega (${T_LABEL[t.status].toLowerCase()}).</div>`;
      return '';
    }).join('');
    const daily = v ? dailyDoneToday(v.id) : null;
    const seg = currentSegment(c);
    const sc = driverScore(d.id);
    const card = v ? `<div class="veh-card" data-go="meu_veiculo" style="cursor:pointer">
        <div class="top-line">${plate(v.plate, true)}${stTag(vStatus(v))}</div>
        <dl class="pairs"><div><dt>Obra</dt><dd>${seg ? esc(prj(seg.projectId).code) : '<span style="color:var(--orange)">Sem obra</span>'}</dd></div><div><dt>Com você há</dt><dd>${dur(nowTs() - c.start)}</dd></div>
        <div><dt>Checklist hoje</dt><dd>${daily ? `<span class="st"><span class="dot ok"></span>${fmtTime(daily.at)}</span>` : '<span class="st"><span class="dot warn"></span>Pendente</span>'}</dd></div><div><dt>Quilometragem</dt><dd class="num">${nf(v.odometer)}</dd></div></dl>
      </div>` : `<div class="veh-card" style="align-items:center;text-align:center;padding:22px"><span class="avatar lg" style="background:var(--border2);color:var(--text3)">${ic('car')}</span><b>Nenhum veículo com você</b><span class="muted small">Escaneie o QR Code do carro para receber.</span></div>`;
    const dis = v ? '' : 'disabled';
    const T = (go, icon, t, s, cls = '', flag = '') => `<button class="tile ${cls}" data-go="${go}" ${v ? `data-vid="${v.id}"` : ''} ${go === 'scanner' ? '' : dis}><span class="ti">${ic(icon)}</span><span><b>${t}</b><small>${s}</small></span>${flag}</button>`;
    return `<div class="drv">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><p class="muted small">${cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</p><h1>Olá, ${esc(d.name.split(' ')[0])}</h1></div>
        <button class="row" data-act="my-score" style="border:none;background:none;gap:8px;flex-wrap:nowrap" aria-label="Minha pontuação"><span class="small muted" style="text-align:right">Minha<br>pontuação</span>${ring(sc.total, true)}</button></div>
      ${banners}${card}
      <div class="tiles">
        ${T('scanner', 'qr', 'Escanear veículo', 'Ler o QR Code do carro', 'primary scan')}
        ${T('diario', 'check', 'Checklist diário', daily ? `Feito às ${fmtTime(daily.at)}` : 'Poucos segundos', daily ? 't-green' : '', v && !daily ? '<span class="flag pill warn">pendente</span>' : v ? '<span class="flag pill ok">ok</span>' : '')}
        ${T('abastecer', 'fuel', 'Abastecer', 'Com foto do cupom')}
        ${T('problema', 'alert', 'Informar problema', 'Avaria ou defeito', 't-red')}
        ${T('entregar', 'handoff', 'Entregar veículo', 'Devolver ou trocar', 't-violet')}
        ${T('meu_veiculo', 'car', 'Meu veículo', v ? v.plate : 'Nenhum', '')}
        ${T('obra', 'pin', 'Trocar obra', seg ? `Agora: ${prj(seg.projectId).code}` : 'Sem obra', 't-amber')}
      </div></div>`;
  }
};
ACTIONS['my-score'] = () => { const sc = driverScore(CUR.driverId); openModal({ title: `Minha pontuação · ${monthLabel()}`, body: scoreBreakdown(sc) }); };
ACTIONS['t-accept'] = a => {
  const t = byId(S.transfers, a.dataset.id);
  setTransfer(t, 'aguardando_entrega', 'Condutor atual aceitou a solicitação');
  log('transferencia', `${drv(t.fromDriverId).name} aceitou a solicitação de transferência`, { vehicleId: t.vehicleId, driverId: t.fromDriverId });
  notify(t.toDriverId, `${drv(t.fromDriverId).name} aceitou a transferência do ${veh(t.vehicleId).plate} e fará a entrega.`, { link: { page: 'transferencia', id: t.id } });
  save(); go('entregar', { vid: t.vehicleId, tid: t.id });
};

/* ---------- Scanner ---------- */
let CAM = null;
function stopCamera() { if (CAM) { CAM.stream?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(CAM.raf); CAM = null; } }
function resolveCode(txt) {
  const s = String(txt || '').trim().toUpperCase();
  const m = s.match(/VLK1-[A-Z0-9]{16}/);
  if (m) {
    const q = S.qrcodes.find(q => q.token === m[0]);
    if (!q) return { err: 'QR Code não reconhecido.' };
    if (!q.active) return { err: 'Este QR Code foi substituído e não é mais válido. Procure a gestão da frota.' };
    return { vid: q.vehicleId };
  }
  const v = vehicleByPlate(s); if (v) return { vid: v.id };
  return { err: 'Código não reconhecido. Confira a placa ou o QR Code.' };
}
function onScanned(txt) {
  const r = resolveCode(txt);
  if (r.err) { const el = $('#scan-err'); if (el) el.textContent = r.err; else toast(r.err); return; }
  stopCamera();
  log('qr', `QR Code lido por ${CUR.name}`, { vehicleId: r.vid, driverId: CUR.driverId });
  save(); go('scan_result', { vid: r.vid });
}
PAGES.scanner = {
  driver: true, title: 'Scanner QR Code',
  render() {
    const wrap = CUR.role === 'condutor' ? 'drv' : 'drv" style="margin:0;max-width:560px';
    return `<div class="${wrap}">
      <div><h1>Escanear veículo</h1><p class="muted">Aponte a câmera para o QR Code fixado no veículo.</p></div>
      <div class="scan-box" id="scan-box"><div class="stack" style="align-items:center;gap:10px;padding:20px;text-align:center;z-index:1" id="scan-idle">${ic('camera')}<button class="btn ok lg" data-act="cam-start">Abrir câmera</button><span class="small" id="cam-msg"></span></div></div>
      <p class="err" id="scan-err" role="alert"></p>
      <div class="panel"><div class="panel-b stack" style="gap:12px">
        <label class="btn block" style="position:relative;overflow:hidden">${ic('camera')} Ler QR Code por foto<input type="file" accept="image/*" capture="environment" id="qr-file" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
        <form id="code-form" class="row" style="flex-wrap:nowrap"><input class="inp" id="code-inp" name="code" placeholder="Placa ou código do QR" autocomplete="off" aria-label="Placa ou código"><button class="btn">Buscar</button></form>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Simular leitura</h3><span class="muted small">Para testar o protótipo sem câmera</span></div>
        <div class="panel-b qr-list">${S.vehicles.map(v => `<button class="chip" data-act="sim-scan" data-token="${S.qrcodes.find(q => q.vehicleId === v.id && q.active).token}">${plate(v.plate)} <span class="muted">${esc(v.model.split(' ')[0])}</span></button>`).join('')}</div></div>
    </div>`;
  },
  mount() {
    $('#code-form').addEventListener('submit', e => { e.preventDefault(); onScanned($('#code-inp').value); });
    $('#qr-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const data = await readPhoto(f, 1000);
      const img = new Image(); img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height);
        const code = window.jsQR ? jsQR(d.data, d.width, d.height) : null;
        if (code) onScanned(code.data); else $('#scan-err').textContent = 'Não foi possível ler o QR Code nesta foto. Tente aproximar e evitar reflexos.';
      }; img.src = data;
    });
  }
};
ACTIONS['sim-scan'] = a => onScanned(a.dataset.token);
ACTIONS['cam-start'] = async () => {
  const msg = $('#cam-msg');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const box = $('#scan-box'); $('#scan-idle').hidden = true;
    const video = document.createElement('video'); video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
    box.appendChild(video); const fr = document.createElement('div'); fr.className = 'frame'; box.appendChild(fr);
    await video.play();
    const c = document.createElement('canvas'); const x = c.getContext('2d', { willReadFrequently: true });
    CAM = { stream, raf: 0 };
    const loop = () => {
      if (!CAM) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        c.width = video.videoWidth; c.height = video.videoHeight; x.drawImage(video, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height); const code = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) { onScanned(code.data); return; }
      }
      CAM.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    msg.textContent = 'A câmera não está disponível neste navegador ou a permissão foi negada. Use a leitura por foto, digite a placa ou simule a leitura abaixo.';
  }
};

/* ---------- Tela de estado do veículo após a leitura ---------- */
PAGES.scan_result = {
  driver: true, title: 'Veículo identificado',
  render({ vid }) {
    const v = veh(vid); const c = activeCustody(vid); const t = activeTransfer(vid); const st = vStatus(v);
    const seg = currentSegment(c); const lc = lastChecklist(vid); const mt = vehicleMaint(vid);
    const me = CUR.driverId;
    let action = '';
    if (me) {
      const rc = receiveCheck(v, me);
      if (rc.mine) {
        action = `<div class="note ok">Este veículo está sob sua responsabilidade.</div>
          <div class="actions">
            <button class="act" data-go="diario" data-vid="${vid}">${ic('check')}<span>Checklist diário</span></button>
            <button class="act" data-go="abastecer" data-vid="${vid}">${ic('fuel')}<span>Abastecer</span></button>
            <button class="act" data-go="obra" data-vid="${vid}">${ic('pin')}<span>Alterar obra</span></button>
            <button class="act" data-go="problema" data-vid="${vid}">${ic('alert')}<span>Informar problema</span></button>
            <button class="act" data-go="entregar" data-vid="${vid}" ${t ? `data-tid="${t.id}"` : ''}>${ic('handoff')}<span>Entregar veículo</span></button>
          </div>`;
      } else if (rc.ok) {
        action = `<button class="btn pri lg block" data-go="receber" data-vid="${vid}">Receber este veículo</button><p class="muted small">Você fará o checklist de recebimento e escolherá a obra. A posse começa quando o checklist for concluído.</p>`;
      } else if (rc.other) {
        const mineT = t && t.toDriverId === me;
        action = `<div class="note warn"><b>Veículo atualmente sob responsabilidade de ${esc(drv(rc.other.driverId).name)}.</b><br>Para receber este veículo, o atual responsável deve realizar a entrega.</div>
          ${mineT ? `<div class="note">Sua solicitação foi enviada em ${fmtDT(t.requestedAt)}. Situação: <b>${T_LABEL[t.status]}</b>.</div><button class="btn block" data-go="transferencia" data-id="${t.id}">Acompanhar transferência</button>`
            : t ? `<div class="note">Já existe uma transferência em andamento para ${esc(drv(t.toDriverId).name)}.</div>`
              : `<button class="btn ok lg block" data-act="t-request" data-vid="${vid}">Enviar solicitação de transferência</button>`}`;
      } else {
        action = `<div class="note bad">${esc(rc.msg)}</div>`;
      }
    } else {
      action = `<div class="row"><button class="btn pri" data-go="veiculo" data-id="${vid}">Abrir histórico completo</button>${isManager() && c ? `<button class="btn" data-go="forcar" data-vid="${vid}">Transferência forçada</button>` : ''}</div>`;
    }
    const wrap = CUR.role === 'condutor' ? 'drv' : 'drv" style="margin:0;max-width:560px';
    return `<div class="${wrap}">
      <div class="veh-card">
        <div class="top-line">${plate(v.plate, true)}${stTag(st)}</div>
        <dl class="kv">
          <dt>Veículo</dt><dd>${esc(v.brand)} ${esc(v.model)} · ${v.year}</dd>
          <dt>Quilometragem</dt><dd class="num">${km(v.odometer)}</dd>
          <dt>Responsável atual</dt><dd>${c ? esc(drv(c.driverId).name) : '<span class="muted">Nenhum</span>'}</dd>
          <dt>Obra</dt><dd>${c ? (seg ? projFull(seg.projectId) : projLabel(null)) : '—'}</dd>
          <dt>Posse iniciada</dt><dd>${c ? fmtDT(c.start) : '—'}</dd>
          <dt>Status da posse</dt><dd>${t ? T_LABEL[t.status] : c ? 'Posse ativa' : 'Sem posse'}</dd>
          <dt>Último checklist</dt><dd>${lc ? `${CK_TYPES[lc.type]} · ${fmtShort(lc.at)}${lc.ok === false ? ' <span class="pill bad">com problema</span>' : ''}` : '—'}</dd>
          <dt>Manutenção</dt><dd>${v.maintenance ? 'Em manutenção' : mLvl(mt.worst)}${mt.next ? ` <span class="muted small">· ${esc(mt.next.p.item)} em ${nf(mt.next.s.remKm)} km</span>` : ''}</dd>
        </dl>
      </div>
      ${action}
    </div>`;
  }
};
ACTIONS['t-request'] = a => { const v = veh(a.dataset.vid); const t = requestTransfer(v, CUR.driverId); toast(`Solicitação enviada para ${drv(t.fromDriverId).name}.`); go('scan_result', { vid: v.id }); };

/* ---------- Checklist completo (componente) ---------- */
function newDraft(kind, vid, extra = {}) {
  const v = veh(vid);
  DRAFT = { kind, vid, km: suggestedKm(v), fuel: '', items: {}, avarias: '', notes: '', photos: {}, geo: null, ...extra };
}
function ckHeader(v, extra = '') {
  const c = activeCustody(v.id); const d = myDriver();
  return `<div class="veh-card"><div class="top-line">${plate(v.plate, true)}<span class="muted small">${esc(v.brand)} ${esc(v.model)}</span></div>
    <dl class="kv"><dt>Condutor</dt><dd>${d ? esc(d.name) : esc(CUR.name) + ' <span class="muted">(gestão)</span>'}</dd>
    <dt>Data e hora</dt><dd>${fmtDT(nowTs())}</dd>${extra}
    <dt>Localização</dt><dd class="small" id="geo-txt">${geoText(DRAFT.geo)}</dd></dl></div>`;
}
function fullChecklistBody(v) {
  const D = DRAFT;
  const items = CK_ITEMS.map(([k, l]) => {
    const opts = PRESENCE.includes(k) ? [['ok', 'Presente'], ['ruim', 'Ausente']] : [['ok', 'OK'], ['regular', 'Regular'], ['ruim', 'Ruim']];
    return `<div class="ck"><span>${l}</span><div class="seg" role="radiogroup" aria-label="${l}">${opts.map(([val, lab]) => `<label><input type="radio" name="it_${k}" value="${val}" ${D.items[k] === val ? 'checked' : ''}><span>${lab}</span></label>`).join('')}</div></div>`;
  }).join('');
  return `
    <div class="panel"><div class="panel-h"><h3>Quilometragem e combustível</h3></div><div class="panel-b form-grid">
      <label class="field"><span>Quilometragem atual</span><input class="inp big num" name="km" inputmode="numeric" value="${D.km ?? ''}" aria-describedby="km-h"><small id="km-h">${v.tracker ? 'Sugerida pelo rastreador. Confira no painel.' : `Último registro: ${km(lastRecordedKm(v.id))}`}</small></label>
      <div class="field"><span>Nível de combustível</span><div class="seg">${FUEL_LEVELS.map(f => `<label><input type="radio" name="fuel" value="${f}" ${D.fuel === f ? 'checked' : ''}><span>${f}</span></label>`).join('')}</div></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Itens do veículo</h3><button type="button" class="btn sm" data-act="ck-allok">Marcar todos como OK</button></div><div class="panel-b" style="padding-block:4px">${items}</div></div>
    <div class="panel"><div class="panel-h"><h3>Avarias e observações</h3></div><div class="panel-b form-grid">
      <label class="field full"><span>Avarias encontradas</span><textarea class="inp" name="avarias" placeholder="Deixe em branco se não houver avarias">${esc(D.avarias)}</textarea></label>
      <label class="field full"><span>Observações</span><textarea class="inp" name="notes">${esc(D.notes)}</textarea></label>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Fotos obrigatórias</h3><button type="button" class="btn sm" data-act="ck-demo-photos">Usar fotos de exemplo</button></div>
      <div class="panel-b"><div class="photos">${PHOTO_SLOTS.map(([k, l]) => photoTile(k, l)).join('')}</div></div></div>`;
}
function photoTile(k, l) {
  const p = DRAFT.photos[k];
  return `<label class="ph ${p ? 'done' : ''}" data-slot="${k}">${p ? `<img src="${photoSrc(p)}" alt=""><span class="cap">${l} ✓</span>` : `${ic('camera')}<span>${l}</span>`}<input type="file" accept="image/*" capture="environment" data-photo="${k}" aria-label="Foto ${l}"></label>`;
}
function bindDraft(form) {
  const upd = e => {
    const el = e.target; if (!el.name) return;
    if (el.name.startsWith('it_')) DRAFT.items[el.name.slice(3)] = el.value;
    else if (el.type === 'file') return;
    else DRAFT[el.name] = el.value;
    DRAFT._onChange?.();
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd);
  form.addEventListener('change', async e => {
    const slot = e.target.dataset.photo; if (!slot || !e.target.files[0]) return;
    DRAFT.photos[slot] = await readPhoto(e.target.files[0]);
    const tile = form.querySelector(`[data-slot="${slot}"]`);
    const lab = { cupom: 'Foto do cupom ou nota fiscal', problema: 'Foto do problema', painel_d: 'Foto do painel (opcional)' }[slot] || (PHOTO_SLOTS.find(s => s[0] === slot) || [0, 'Foto'])[1];
    if (tile) tile.outerHTML = slot === 'cupom' || slot === 'problema' || slot === 'painel_d' ? singlePhoto(slot, lab) : photoTile(slot, lab);
    DRAFT._onChange?.();
  });
}
ACTIONS['ck-allok'] = () => { CK_ITEMS.forEach(([k]) => { DRAFT.items[k] = 'ok'; const r = $(`input[name="it_${k}"][value="ok"]`); if (r) r.checked = true; }); };
ACTIONS['ck-demo-photos'] = () => { PHOTO_SLOTS.forEach(([k, l]) => { if (!DRAFT.photos[k]) DRAFT.photos[k] = 'demo:' + k; const t = $(`[data-slot="${k}"]`); if (t) t.outerHTML = photoTile(k, l); }); };
function singlePhoto(slot, label) {
  const p = DRAFT.photos[slot];
  return `<label class="ph ${p ? 'done' : ''}" data-slot="${slot}" style="aspect-ratio:auto;min-height:92px;flex-direction:row;gap:10px">${p ? `<img src="${photoSrc(p)}" alt=""><span class="cap">${label} ✓ (toque para trocar)</span>` : `${ic('camera')}<span>${label}</span>`}<input type="file" accept="image/*" capture="environment" data-photo="${slot}" aria-label="${label}"></label>`;
}
function validateFull(v) {
  const e = [];
  const k = parseInt(String(DRAFT.km).replace(/\D/g, ''), 10);
  if (!k) e.push('Informe a quilometragem.');
  else if (k < lastRecordedKm(v.id)) e.push(`A quilometragem não pode ser menor que o último registro (${km(lastRecordedKm(v.id))}).`);
  if (!DRAFT.fuel) e.push('Informe o nível de combustível.');
  const miss = CK_ITEMS.filter(([x]) => !DRAFT.items[x]).map(([, l]) => l);
  if (miss.length) e.push(`Avalie todos os itens (faltam ${miss.length}).`);
  if (S.settings.requirePhotos) { const mp = PHOTO_SLOTS.filter(([x]) => !DRAFT.photos[x]).map(([, l]) => l.toLowerCase()); if (mp.length) e.push(`Fotos obrigatórias pendentes: ${mp.join(', ')}.`); }
  return { e, km: k };
}
function saveFullChecklist(type, v, driverId, custodyId, kmv) {
  const ck = { id: uid('ck'), type, vehicleId: v.id, driverId, userId: CUR.id, custodyId, at: nowTs(), km: kmv, fuelLevel: DRAFT.fuel, items: { ...DRAFT.items }, ok: !DRAFT.avarias && !Object.values(DRAFT.items).includes('ruim'), problem: null, avarias: DRAFT.avarias, notes: DRAFT.notes, photos: { ...DRAFT.photos }, location: DRAFT.geo, late: false };
  S.checklists.push(ck);
  v.odometer = Math.max(v.odometer, kmv); if (S.locations[v.id]) S.locations[v.id].km = v.odometer;
  const bad = CK_ITEMS.filter(([x]) => DRAFT.items[x] === 'ruim').map(([, l]) => l);
  log('checklist', `Checklist de ${CK_TYPES[type].toLowerCase()} concluído (${nf(kmv)} km)${bad.length || DRAFT.avarias ? ` com apontamentos: ${[...bad, DRAFT.avarias].filter(Boolean).join('; ')}` : ''}`, { vehicleId: v.id, driverId, data: { checklistId: ck.id } });
  return ck;
}
const showErrors = e => { const el = $('#ck-err'); el.innerHTML = e.map(x => `<div>${esc(x)}</div>`).join(''); el.hidden = !e.length; if (e.length) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

/* ---------- Recebimento ---------- */
PAGES.receber = {
  driver: true, title: 'Recebimento do veículo',
  render({ vid }) {
    const v = veh(vid); const rc = receiveCheck(v, CUR.driverId);
    if (!rc.ok) return `<div class="drv"><h1>Recebimento</h1><div class="note bad">${esc(rc.msg)}</div><button class="btn" data-go="scan_result" data-vid="${vid}">Voltar</button></div>`;
    if (!DRAFT || DRAFT.kind !== 'receber') {
      newDraft('receber', vid, { projectId: '', ccId: '', purpose: PURPOSES[0] });
      const t = rc.t;
      if (t && t.status === 'aguardando_recebimento') { setTransfer(t, 'recebimento_andamento', 'Novo condutor iniciou o checklist de recebimento'); log('transferencia', `${drv(t.toDriverId).name} iniciou o checklist de recebimento`, { vehicleId: vid, driverId: t.toDriverId }); save(); }
      captureLocation(v);
    }
    const tInfo = rc.t ? `<div class="note">Transferência de ${esc(drv(rc.t.fromDriverId).name)} para você. Estado: <b>${T_LABEL[rc.t.status]}</b>.</div>` : '';
    const first = !S.custody.some(c => c.vehicleId === vid);
    return `<form class="drv" id="ckform" novalidate>
      <div><p class="label">Checklist completo · ${first ? 'Primeiro recebimento' : rc.t ? 'Troca de condutor' : 'Recebimento'}</p><h1>Recebimento do veículo</h1></div>
      ${tInfo}${ckHeader(v)}
      <div class="panel"><div class="panel-h"><h3>Obra e finalidade</h3><span class="muted small">Obrigatório para iniciar a posse</span></div><div class="panel-b form-grid">
        <label class="field full"><span>Obra</span><select class="inp" name="projectId" id="f-proj"><option value="">Selecione a obra</option>${projectOptions(DRAFT.projectId)}</select></label>
        <label class="field"><span>Centro de custo</span><select class="inp" name="ccId" id="f-cc"><option value="">Automático pela obra</option>${ccOptions(DRAFT.ccId)}</select></label>
        <label class="field"><span>Atividade ou finalidade</span><select class="inp" name="purpose">${purposeOptions(DRAFT.purpose)}</select></label>
      </div></div>
      ${fullChecklistBody(v)}
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      <div class="sticky-foot"><button type="button" class="btn lg" data-go="scan_result" data-vid="${vid}">Cancelar</button><button class="btn ok lg" style="flex:1">Concluir e assumir a posse</button></div>
    </form>`;
  },
  mount({ vid }) {
    const f = $('#ckform'); if (!f) return; bindDraft(f);
    $('#f-proj').addEventListener('change', e => { const p = prj(e.target.value); if (p) { DRAFT.ccId = p.ccId; $('#f-cc').value = p.ccId; } });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = veh(vid); const { e: errs, km: k } = validateFull(v);
      if (!DRAFT.projectId) errs.unshift('Selecione a obra ou centro de custo.');
      if (errs.length) return showErrors(errs);
      const rc = receiveCheck(v, CUR.driverId); if (!rc.ok) return showErrors([rc.msg]);
      const did = CUR.driverId; const p = prj(DRAFT.projectId);
      const c = { id: uid('cus'), vehicleId: vid, driverId: did, start: nowTs() + 1, end: null, startKm: k, endKm: null, receiveChecklistId: null, deliverChecklistId: null, segments: [{ at: nowTs(), projectId: p.id, ccId: DRAFT.ccId || p.ccId, purpose: DRAFT.purpose, by: did }], closedReason: null, transferId: rc.t?.id || null };
      const ck = saveFullChecklist('recebimento', v, did, c.id, k);
      c.receiveChecklistId = ck.id; S.custody.push(c);
      log('posse_inicio', `${drv(did).name} recebeu o veículo. Posse iniciada`, { vehicleId: vid, driverId: did, at: nowTs() + 1 });
      log('obra', `Vinculado à ${p.code} · ${ccOf(DRAFT.ccId || p.ccId).code} · ${DRAFT.purpose}`, { vehicleId: vid, driverId: did, at: nowTs() + 2 });
      if (rc.t) {
        rc.t.receiveChecklistId = ck.id; rc.t.toCustodyId = c.id; setTransfer(rc.t, 'concluida', 'Checklist de recebimento aprovado; posse transferida');
        log('transferencia', `Transferência concluída: ${drv(rc.t.fromDriverId).name} → ${drv(did).name}`, { vehicleId: vid, driverId: did, at: nowTs() + 3 });
        notify(rc.t.fromDriverId, `${drv(did).name} recebeu o ${v.plate}. Transferência concluída.`);
      }
      save(); toast(`Posse iniciada: ${v.plate} está com você.`); go('meu_veiculo', { vid });
    });
  }
};

/* ---------- Entrega ---------- */
PAGES.entregar = {
  driver: true, title: 'Entrega do veículo',
  render({ vid, tid }) {
    const d = myDriver(); const cs = d ? driverCustodies(d.id) : [];
    vid = vid || cs[0]?.vehicleId;
    if (!vid) return `<div class="drv"><h1>Entregar veículo</h1><div class="note">Você não está com nenhum veículo.</div></div>`;
    const v = veh(vid); const c = activeCustody(vid);
    if (!c || c.driverId !== CUR.driverId) return `<div class="drv"><h1>Entregar veículo</h1><div class="note bad">Somente o condutor responsável pode entregar este veículo.</div></div>`;
    const t = tid ? byId(S.transfers, tid) : activeTransfer(vid);
    if (!DRAFT || DRAFT.kind !== 'entregar') {
      newDraft('entregar', vid, { mode: t ? 'transfer' : 'devolucao' });
      if (t && t.status === 'solicitada') { setTransfer(t, 'aguardando_entrega', 'Condutor atual aceitou a solicitação'); }
      if (t && t.status === 'aguardando_entrega') { setTransfer(t, 'entrega_andamento', 'Checklist de entrega iniciado'); log('transferencia', `${drv(c.driverId).name} iniciou o checklist de entrega`, { vehicleId: vid, driverId: c.driverId }); save(); }
      captureLocation(v);
    }
    const seg = currentSegment(c);
    return `<form class="drv" id="ckform" novalidate>
      <div><p class="label">Checklist completo · ${t ? 'Troca de condutor' : 'Devolução'}</p><h1>Entrega do veículo</h1></div>
      ${t ? `<div class="note">Entrega para <b>${esc(drv(t.toDriverId).name)}</b>. Após este checklist sua posse é encerrada e ${esc(drv(t.toDriverId).name.split(' ')[0])} poderá fazer o recebimento.</div>` : `<div class="note">Devolução do veículo. Após este checklist sua posse é encerrada e o veículo fica disponível.</div>`}
      ${ckHeader(v, `<dt>Obra atual</dt><dd>${seg ? projLabel(seg.projectId) : projLabel(null)}</dd><dt>Posse desde</dt><dd>${fmtDT(c.start)}</dd><dt>Km inicial</dt><dd class="num">${km(c.startKm)}</dd>`)}
      ${fullChecklistBody(v)}
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      <div class="sticky-foot"><button type="button" class="btn lg" data-go="inicio">Depois</button><button class="btn ok lg" style="flex:1">Concluir entrega</button></div>
    </form>`;
  },
  mount({ vid, tid }) {
    const f = $('#ckform'); if (!f) return; bindDraft(f);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = veh(DRAFT.vid); const c = activeCustody(v.id); const t = tid ? byId(S.transfers, tid) : activeTransfer(v.id);
      const { e: errs, km: k } = validateFull(v); if (errs.length) return showErrors(errs);
      const ck = saveFullChecklist(t ? 'entrega' : 'devolucao', v, c.driverId, c.id, k);
      c.end = nowTs() + 1; c.endKm = k; c.deliverChecklistId = ck.id; c.closedReason = t ? 'transferencia' : 'entrega'; c.transferId = t?.id || null;
      log('posse_fim', `${drv(c.driverId).name} entregou o veículo. Posse encerrada (${nf(k - c.startKm)} km rodados)`, { vehicleId: v.id, driverId: c.driverId, at: nowTs() + 1 });
      if (t) {
        t.deliverChecklistId = ck.id; setTransfer(t, 'aguardando_recebimento', 'Checklist de entrega aprovado; posse anterior encerrada');
        notify(t.toDriverId, `${drv(c.driverId).name} entregou o ${v.plate}. Faça o checklist de recebimento para assumir a posse.`, { level: 'ok', link: { page: 'inicio' } });
      }
      save(); toast(t ? `Entrega concluída. Aguardando recebimento de ${drv(t.toDriverId).name}.` : 'Veículo devolvido. Posse encerrada.'); go('inicio');
    });
  }
};

/* ---------- Checklist diário ---------- */
PAGES.diario = {
  driver: true, title: 'Checklist diário',
  render({ vid }) {
    const d = myDriver(); vid = vid || (d && driverCustodies(d.id)[0]?.vehicleId);
    const v = vid && veh(vid); const c = v && activeCustody(vid);
    if (!v || !c || (d && c.driverId !== d.id)) return `<div class="drv"><h1>Checklist diário</h1><div class="note">O checklist diário é feito pelo condutor responsável pelo veículo. Escaneie o veículo para começar.</div><button class="btn ok lg block" data-go="scanner">Escanear veículo</button></div>`;
    if (!DRAFT || DRAFT.kind !== 'diario') { newDraft('diario', vid, { answer: null, projOk: '1', projectId: currentSegment(c)?.projectId || '', ccId: currentSegment(c)?.ccId || '', type: '', desc: '', severity: '', canRun: '' }); captureLocation(v); }
    const done = dailyDoneToday(vid); const seg = currentSegment(c); const D = DRAFT;
    const sim = D.answer === 'sim', nao = D.answer === 'nao';
    return `<form class="drv" id="dform" novalidate>
      <div class="veh-card"><div class="top-line">${plate(v.plate, true)}<span class="pill ok">Veículo identificado</span></div>
        <dl class="kv"><dt>Condutor</dt><dd>${esc(drv(c.driverId).name)}</dd><dt>Obra atual</dt><dd>${seg ? projFull(seg.projectId) : projLabel(null)}</dd><dt>Data</dt><dd>${fmtDT(nowTs())}</dd></dl></div>
      ${done ? `<div class="note ok">Checklist de hoje já registrado às ${fmtTime(done.at)}. Você pode registrar outro se a situação mudou.</div>` : ''}
      <p class="big-q">O veículo está em condições normais de utilização?</p>
      <div class="yn"><button type="button" class="${sim ? 'on-ok' : ''}" data-act="d-ans" data-v="sim">Sim</button><button type="button" class="${nao ? 'on-bad' : ''}" data-act="d-ans" data-v="nao">Não</button></div>
      ${D.answer ? `
      <div class="panel"><div class="panel-b stack" style="gap:12px">
        <label class="field"><span>Quilometragem atual</span><input class="inp big num" name="km" inputmode="numeric" value="${D.km ?? ''}"><small>${v.tracker ? 'Sugerida pelo rastreador. Confira no painel.' : 'Ou envie a foto do painel abaixo.'}</small></label>
        ${singlePhoto('painel_d', 'Foto do painel (opcional)')}
      </div></div>` : ''}
      ${sim ? `<div class="panel"><div class="panel-b stack" style="gap:10px">
        <span class="field"><span>Confirmar obra</span></span>
        <div class="seg"><label><input type="radio" name="projOk" value="1" ${D.projOk === '1' ? 'checked' : ''}><span>Continuo em ${seg ? esc(prj(seg.projectId).code) : '—'}</span></label><label><input type="radio" name="projOk" value="0" ${D.projOk === '0' ? 'checked' : ''}><span>Mudar obra</span></label></div>
        <div id="proj-change" ${D.projOk === '0' || !seg ? '' : 'hidden'}><select class="inp" name="projectId"><option value="">Selecione a obra</option>${projectOptions(D.projectId)}</select></div>
      </div></div>` : ''}
      ${nao ? `<div class="panel"><div class="panel-h"><h3>Descreva o problema</h3></div><div class="panel-b stack" style="gap:14px">${problemFields()}</div></div>` : ''}
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      ${D.answer ? `<div class="sticky-foot"><button class="btn ok lg block">Finalizar checklist</button></div>` : ''}
    </form>`;
  },
  mount({ vid }) {
    const f = $('#dform'); if (!f) return; bindDraft(f);
    f.addEventListener('change', e => { if (e.target.name === 'projOk') { const pc = $('#proj-change'); if (pc) pc.hidden = e.target.value !== '0'; } });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = veh(DRAFT.vid); const c = activeCustody(v.id); const D = DRAFT; const errs = [];
      const k = parseInt(String(D.km).replace(/\D/g, ''), 10);
      if (!k && !D.photos.painel_d) errs.push('Informe a quilometragem ou envie a foto do painel.');
      if (k && k < lastRecordedKm(v.id)) errs.push(`A quilometragem não pode ser menor que o último registro (${km(lastRecordedKm(v.id))}).`);
      if (D.answer === 'sim' && (D.projOk === '0' || !currentSegment(c)) && !D.projectId) errs.push('Selecione a obra.');
      if (D.answer === 'nao') errs.push(...problemErrors());
      if (errs.length) return showErrors(errs);
      const kmv = k || suggestedKm(v);
      const [h, m] = S.settings.dailyDeadline.split(':').map(Number); const n = new Date();
      const ck = { id: uid('ck'), type: 'diario', vehicleId: v.id, driverId: c.driverId, userId: CUR.id, custodyId: c.id, at: nowTs(), km: kmv, ok: D.answer === 'sim', problem: null, photos: { painel: D.photos.painel_d || null }, location: D.geo, late: n.getHours() * 60 + n.getMinutes() > h * 60 + m };
      S.checklists.push(ck); v.odometer = Math.max(v.odometer, kmv);
      if (D.answer === 'sim') {
        log('checklist', `Checklist diário: condições normais (${nf(kmv)} km)${ck.late ? ' · fora do prazo' : ''}`, { vehicleId: v.id, driverId: c.driverId });
        const seg = currentSegment(c);
        if ((D.projOk === '0' || !seg) && D.projectId && D.projectId !== seg?.projectId) changeProject(c, D.projectId, prj(D.projectId).ccId, seg?.purpose || PURPOSES[0]);
        save(); toast('Checklist diário concluído.'); go('inicio');
      } else {
        const iss = createIssue(v, c.driverId, 'diario');
        ck.problem = { issueId: iss.id };
        log('checklist', `Checklist diário: veículo com problema (${nf(kmv)} km)`, { vehicleId: v.id, driverId: c.driverId });
        save(); toast(iss.severity === 'critica' ? 'Problema crítico registrado. A gestão foi alertada.' : 'Checklist registrado com o problema informado.'); go('inicio');
      }
    });
  }
};
ACTIONS['d-ans'] = a => { DRAFT.answer = a.dataset.v; go('diario', { vid: DRAFT.vid }, { keepDraft: true, noPush: true }); };

function problemFields() {
  const D = DRAFT;
  return `<div class="field"><span>Tipo de problema</span><div class="seg">${PROBLEM_TYPES.map(t => `<label><input type="radio" name="type" value="${t}" ${D.type === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
    <label class="field"><span>Descrição</span><textarea class="inp" name="desc" placeholder="O que aconteceu? Onde está o problema?">${esc(D.desc)}</textarea></label>
    <div class="field"><span>Criticidade</span><div class="seg">${Object.entries(SEVERITY).map(([k, s]) => `<label><input type="radio" name="severity" value="${k}" ${D.severity === k ? 'checked' : ''}><span>${s.l}</span></label>`).join('')}</div><small>Crítica gera alerta imediato para o gestor.</small></div>
    ${singlePhoto('problema', 'Foto do problema')}
    <div class="field"><span>O veículo pode continuar circulando?</span><div class="seg bad"><label><input type="radio" name="canRun" value="1" ${D.canRun === '1' ? 'checked' : ''}><span>Sim</span></label><label><input type="radio" name="canRun" value="0" ${D.canRun === '0' ? 'checked' : ''}><span>Não, veículo parado</span></label></div></div>`;
}
function problemErrors() {
  const e = []; const D = DRAFT;
  if (!D.type) e.push('Selecione o tipo de problema.');
  if (!D.desc || D.desc.length < 5) e.push('Descreva o problema.');
  if (!D.severity) e.push('Informe a criticidade.');
  if (!D.canRun) e.push('Informe se o veículo pode continuar circulando.');
  return e;
}
function createIssue(v, driverId, source) {
  const D = DRAFT;
  const iss = { id: uid('iss'), vehicleId: v.id, driverId, at: nowTs(), type: D.type, desc: D.desc, severity: D.severity, canRun: D.canRun === '1', photo: D.photos.problema || null, status: 'aberta', source, location: D.geo };
  S.issues.push(iss);
  log('problema', `Problema ${SEVERITY[iss.severity].l.toLowerCase()} informado: ${iss.type} – ${iss.desc}${iss.canRun ? '' : '. Veículo não pode circular'}`, { vehicleId: v.id, driverId });
  if (iss.severity === 'critica' || !iss.canRun) notify('gestao', `Problema ${iss.severity === 'critica' ? 'CRÍTICO' : SEVERITY[iss.severity].l.toLowerCase()} no ${v.plate} (${iss.type})${iss.canRun ? '' : ': veículo não pode circular'}. Informado por ${drv(driverId)?.name || CUR.name}.`, { level: 'bad', link: { page: 'veiculo', id: v.id } });
  return iss;
}

/* ---------- Informar problema ---------- */
PAGES.problema = {
  driver: true, title: 'Informar problema',
  render({ vid }) {
    const d = myDriver(); vid = vid || (d && driverCustodies(d.id)[0]?.vehicleId);
    const v = vid && veh(vid); if (!v) return `<div class="drv"><h1>Informar problema</h1><div class="note">Escaneie o veículo para informar um problema.</div><button class="btn ok lg block" data-go="scanner">Escanear veículo</button></div>`;
    if (!DRAFT || DRAFT.kind !== 'problema') { newDraft('problema', vid, { type: '', desc: '', severity: '', canRun: '' }); captureLocation(v); }
    return `<form class="drv" id="pform" novalidate>
      <div><h1>Informar problema</h1><p class="muted">Registre defeitos, avarias ou riscos. A gestão acompanha em tempo real.</p></div>
      ${ckHeader(v)}
      <div class="panel"><div class="panel-b stack" style="gap:14px">${problemFields()}</div></div>
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      <p class="small muted">Houve colisão ou dano na lataria? <button type="button" class="link" data-go="checklist_full" data-vid="${vid}" data-type="avaria">Faça o registro de avaria com checklist completo</button>.</p>
      <div class="sticky-foot"><button class="btn ok lg block">Enviar</button></div>
    </form>`;
  },
  mount() {
    const f = $('#pform'); if (!f) return; bindDraft(f);
    f.addEventListener('submit', e => {
      e.preventDefault(); const errs = problemErrors(); if (errs.length) return showErrors(errs);
      const v = veh(DRAFT.vid); const c = activeCustody(v.id);
      const iss = createIssue(v, CUR.driverId || c?.driverId, 'informado'); save();
      toast(iss.severity === 'critica' || !iss.canRun ? 'Problema registrado. A gestão foi alertada.' : 'Problema registrado.'); go(CUR.role === 'condutor' ? 'inicio' : 'veiculo', { id: v.id });
    });
  }
};

/* ---------- Checklist completo avulso: avaria, entrada e saída de manutenção ---------- */
PAGES.checklist_full = {
  driver: true, title: p => CK_TYPES[p.type] || 'Checklist completo',
  render({ vid, type }) {
    const v = veh(vid);
    if (['manut_entrada', 'manut_saida'].includes(type) && !isManager()) return '<div class="drv"><div class="note bad">Somente gestores registram entrada e saída de manutenção.</div></div>';
    if (type === 'manut_entrada' && activeCustody(vid)) return `<div class="drv" style="margin:0"><h1>Entrada em manutenção</h1><div class="note warn">O veículo está com ${esc(drv(activeCustody(vid).driverId).name)}. O condutor precisa fazer a entrega (ou use a transferência forçada) antes da entrada em manutenção.</div><button class="btn" data-go="veiculo" data-id="${vid}">Voltar ao veículo</button></div>`;
    if (!DRAFT || DRAFT.kind !== 'full_' + type) { newDraft('full_' + type, vid, { shop: v.maintenanceNote || '', doneItems: [], cost: '' }); captureLocation(v); }
    const extra = type === 'manut_entrada' ? `<div class="panel"><div class="panel-h"><h3>Manutenção</h3></div><div class="panel-b"><label class="field"><span>Oficina e motivo</span><input class="inp" name="shop" value="${esc(DRAFT.shop)}" placeholder="Ex.: Oficina Alvorada – revisão dos 120 mil km"></label></div></div>`
      : type === 'manut_saida' ? `<div class="panel"><div class="panel-h"><h3>Serviços realizados</h3></div><div class="panel-b stack" style="gap:12px">
          <div class="seg">${MAINT_ITEMS.map(i => `<label><input type="checkbox" name="done_${i}" ${DRAFT.doneItems.includes(i) ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div>
          <div class="form-grid"><label class="field"><span>Custo total (R$)</span><input class="inp num" name="cost" inputmode="decimal" value="${esc(DRAFT.cost)}"></label><label class="field"><span>Oficina</span><input class="inp" name="shop" value="${esc(DRAFT.shop)}"></label></div></div></div>` : '';
    const wrap = CUR.role === 'condutor' ? 'drv' : 'drv" style="margin:0;max-width:760px';
    return `<form class="${wrap}" id="ckform" novalidate>
      <div><p class="label">Checklist completo</p><h1>${CK_TYPES[type]}</h1></div>
      ${ckHeader(v)}${extra}${fullChecklistBody(v)}
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      <div class="sticky-foot"><button type="button" class="btn lg" data-go="${CUR.role === 'condutor' ? 'inicio' : 'veiculo'}" data-id="${vid}">Cancelar</button><button class="btn ok lg" style="flex:1">Concluir</button></div>
    </form>`;
  },
  mount({ vid, type }) {
    const f = $('#ckform'); if (!f) return; bindDraft(f);
    f.addEventListener('change', e => { if (e.target.name?.startsWith('done_')) { const i = e.target.name.slice(5); DRAFT.doneItems = e.target.checked ? [...DRAFT.doneItems, i] : DRAFT.doneItems.filter(x => x !== i); } });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = veh(vid); const { e: errs, km: k } = validateFull(v);
      if (type === 'manut_saida' && !DRAFT.doneItems.length) errs.push('Marque ao menos um serviço realizado.');
      if (errs.length) return showErrors(errs);
      const c = activeCustody(vid);
      saveFullChecklist(type, v, c?.driverId || null, c?.id || null, k);
      if (type === 'manut_entrada') { v.maintenance = true; v.maintenanceSince = nowTs(); v.maintenanceNote = DRAFT.shop; log('manutencao', `Entrada em manutenção${DRAFT.shop ? ': ' + DRAFT.shop : ''}`, { vehicleId: vid }); }
      if (type === 'manut_saida') {
        const cost = parseFloat(String(DRAFT.cost).replace(/\./g, '').replace(',', '.')) || 0;
        S.maintRecords.push({ id: uid('mr'), vehicleId: vid, at: nowTs(), items: DRAFT.doneItems, cost, shop: DRAFT.shop, km: k, type: 'preventiva' });
        DRAFT.doneItems.forEach(i => S.plans.filter(p => p.vehicleId === vid && (p.item === i || (i === 'Alinhamento' && p.item === 'Balanceamento' && false))).forEach(p => { p.lastKm = k; p.lastDate = startOfDay(nowTs()); }));
        v.maintenance = false; v.maintenanceSince = null; v.maintenanceNote = '';
        log('manutencao', `Saída de manutenção: ${DRAFT.doneItems.join(', ')}${cost ? ' · ' + money(cost) : ''}`, { vehicleId: vid });
      }
      save(); toast('Checklist concluído.'); go(CUR.role === 'condutor' ? 'inicio' : 'veiculo', { id: vid });
    });
  }
};

/* ---------- Troca de obra durante a posse ---------- */
function changeProject(c, projectId, ccId, purpose) {
  const p = prj(projectId);
  c.segments.push({ at: nowTs(), projectId, ccId: ccId || p.ccId, purpose, by: CUR.driverId || CUR.id });
  log('obra', `Alteração para ${p.code}${purpose ? ' · ' + purpose : ''}`, { vehicleId: c.vehicleId, driverId: c.driverId });
}
PAGES.obra = {
  driver: true, title: 'Alterar obra',
  render({ vid }) {
    const c = activeCustody(vid); if (!c) return '<div class="drv"><div class="note">Veículo sem posse ativa.</div></div>';
    const seg = currentSegment(c);
    const todays = c.segments.filter(s => isToday(s.at) || s === c.segments.at(-1));
    return `<form class="drv" id="oform">
      <div><h1>Alterar obra</h1><p class="muted">A posse continua com você. A troca fica registrada no histórico.</p></div>
      <div class="veh-card"><div class="top-line">${plate(veh(vid).plate, true)}<span>Agora: <b>${seg ? esc(prj(seg.projectId).code) : 'sem obra'}</b></span></div>
        <div><p class="label" style="margin-bottom:4px">Histórico da posse</p>${c.segments.slice(-6).map(s => `<div class="row small"><span class="mono num">${fmtShort(s.at)}</span><span>${esc(prj(s.projectId).code)}</span><span class="muted">${esc(s.purpose || '')}</span></div>`).join('') || '<span class="muted small">Sem obra registrada</span>'}</div></div>
      <div class="panel"><div class="panel-b stack" style="gap:12px">
        <label class="field"><span>Nova obra</span><select class="inp" name="projectId" id="o-proj" required><option value="">Selecione</option>${projectOptions('')}</select></label>
        <label class="field"><span>Centro de custo</span><select class="inp" name="ccId" id="o-cc">${ccOptions(seg?.ccId)}</select></label>
        <label class="field"><span>Finalidade</span><select class="inp" name="purpose">${purposeOptions(seg?.purpose)}</select></label>
      </div></div>
      <div class="note bad" id="ck-err" hidden></div>
      <div class="sticky-foot"><button class="btn ok lg block">Confirmar alteração</button></div></form>`;
  },
  mount({ vid }) {
    const f = $('#oform'); if (!f) return;
    $('#o-proj').addEventListener('change', e => { const p = prj(e.target.value); if (p) $('#o-cc').value = p.ccId; });
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f); const c = activeCustody(vid);
      if (!d.projectId) return showErrors(['Selecione a obra.']);
      if (d.projectId === currentSegment(c)?.projectId) return showErrors(['O veículo já está nesta obra.']);
      changeProject(c, d.projectId, d.ccId, d.purpose); save(); toast(`Obra alterada para ${prj(d.projectId).code}.`); go(CUR.role === 'condutor' ? 'meu_veiculo' : 'veiculo', { vid, id: vid });
    });
  }
};

/* ---------- Abastecimento (registro) ---------- */
PAGES.abastecer = {
  driver: true, title: 'Abastecimento',
  render({ vid }) {
    const d = myDriver(); vid = vid || (d && driverCustodies(d.id)[0]?.vehicleId);
    const v = vid && veh(vid); const c = v && activeCustody(vid);
    if (!v || !c) return `<div class="drv"><h1>Abastecer</h1><div class="note">O abastecimento é vinculado à posse atual. Escaneie o veículo que está com você.</div><button class="btn ok lg block" data-go="scanner">Escanear veículo</button></div>`;
    if (!DRAFT || DRAFT.kind !== 'abastecer') { newDraft('abastecer', vid, { km: '', liters: '', total: '', fuelType: v.fuelType, station: '' }); captureLocation(v); }
    const seg = currentSegment(c); const stations = [...new Set(S.fuel.map(f => f.station))];
    const types = v.fuelType.startsWith('Diesel') ? ['Diesel S10', 'Diesel S500'] : ['Gasolina', 'Etanol'];
    const wrap = CUR.role === 'condutor' ? 'drv' : 'drv" style="margin:0;max-width:560px';
    return `<form class="${wrap}" id="fform" novalidate>
      <div><h1>Abastecimento</h1></div>
      <div class="veh-card"><div class="top-line">${plate(v.plate, true)}<span class="muted small">${esc(v.model)}</span></div>
        <dl class="kv"><dt>Condutor</dt><dd>${esc(drv(c.driverId).name)}</dd><dt>Obra</dt><dd>${seg ? projLabel(seg.projectId) : projLabel(null)}</dd><dt>Data e hora</dt><dd>${fmtDT(nowTs())}</dd></dl></div>
      <div class="panel"><div class="panel-b form-grid">
        <label class="field full"><span>Quilometragem no abastecimento</span><input class="inp big num" name="km" inputmode="numeric" value="${esc(DRAFT.km)}" placeholder="${nf(suggestedKm(v))}"><small>Último registro: ${km(lastRecordedKm(v.id))}</small></label>
        <label class="field"><span>Litros</span><input class="inp num" name="liters" inputmode="decimal" value="${esc(DRAFT.liters)}" placeholder="0,00"></label>
        <label class="field"><span>Valor total (R$)</span><input class="inp num" name="total" inputmode="decimal" value="${esc(DRAFT.total)}" placeholder="0,00"></label>
        <div class="field full"><span>Combustível</span><div class="seg">${types.map(t => `<label><input type="radio" name="fuelType" value="${t}" ${DRAFT.fuelType === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
        <label class="field full"><span>Posto</span><input class="inp" name="station" list="stations" value="${esc(DRAFT.station)}" placeholder="Nome do posto"><datalist id="stations">${stations.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <div class="full">${singlePhoto('cupom', 'Foto do cupom ou nota fiscal')}</div>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Cálculo automático</h3></div><div class="panel-b" id="fuel-calc"></div></div>
      <div class="note bad" id="ck-err" hidden role="alert"></div>
      <div class="sticky-foot"><button class="btn ok lg block">Registrar abastecimento</button></div>
    </form>`;
  },
  mount() {
    const f = $('#fform'); if (!f) return; bindDraft(f);
    const num = s => parseFloat(String(s || '').replace(/\./g, '').replace(',', '.'));
    const calc = () => {
      const v = veh(DRAFT.vid); const k = parseInt(String(DRAFT.km).replace(/\D/g, ''), 10); const l = num(DRAFT.liters); const t = num(DRAFT.total);
      const prev = S.fuel.filter(x => x.vehicleId === v.id).sort((a, b) => b.at - a.at)[0];
      const avg = vehicleAvgKmL(v.id);
      let html = `<dl class="dl"><dt>Média do veículo</dt><dd class="num">${nf(avg, 1)} km/l</dd>`;
      if (prev) html += `<dt>Último abastecimento</dt><dd class="num">${km(prev.km)} · ${fmtShort(prev.at)}</dd>`;
      if (k && l && prev && k > prev.km) {
        const dist = k - prev.km, kml = dist / l, dev = (kml - avg) / avg * 100;
        const out = Math.abs(dev) > S.settings.fuelDeviationPct;
        html += `<dt>Distância</dt><dd class="num">${km(dist)}</dd><dt>Consumo</dt><dd class="num"><b>${nf(kml, 1)} km/l</b> ${out ? pill(`${dev > 0 ? '+' : ''}${nf(dev, 0)}% da média`, 'warn') : `<span class="muted">${dev > 0 ? '+' : ''}${nf(dev, 0)}% da média</span>`}</dd>`;
        if (t) html += `<dt>Custo por km</dt><dd class="num">${money(t / dist)}</dd>`;
      }
      if (l && t) html += `<dt>Preço por litro</dt><dd class="num">${money(t / l)}</dd>`;
      $('#fuel-calc').innerHTML = html + '</dl>';
    };
    DRAFT._onChange = calc; calc();
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = veh(DRAFT.vid); const c = activeCustody(v.id); const errs = [];
      const k = parseInt(String(DRAFT.km).replace(/\D/g, ''), 10); const l = num(DRAFT.liters); const t = num(DRAFT.total);
      if (!k) errs.push('Informe a quilometragem.'); else if (k < lastRecordedKm(v.id)) errs.push(`A quilometragem não pode ser menor que o último registro (${km(lastRecordedKm(v.id))}).`);
      if (!l || l <= 0) errs.push('Informe os litros.'); if (!t || t <= 0) errs.push('Informe o valor total.');
      if (!DRAFT.station) errs.push('Informe o posto.'); if (!DRAFT.photos.cupom) errs.push('Envie a foto do cupom ou nota fiscal.');
      if (errs.length) return showErrors(errs);
      const seg = currentSegment(c);
      const rec = { id: uid('fuel'), vehicleId: v.id, driverId: c.driverId, custodyId: c.id, projectId: seg?.projectId || null, at: nowTs(), km: k, liters: l, total: t, fuelType: DRAFT.fuelType, station: DRAFT.station, receipt: DRAFT.photos.cupom, location: DRAFT.geo };
      S.fuel.push(rec); v.odometer = Math.max(v.odometer, k);
      log('abastecimento', `Abastecimento: ${nf(l, 1)} L, ${money(t)} em ${rec.station}`, { vehicleId: v.id, driverId: c.driverId });
      const m = fuelOutlier(rec);
      if (m) notify('gestao', `Consumo fora do padrão no ${v.plate}: ${nf(m.kmL, 1)} km/l (${m.delta > 0 ? '+' : ''}${nf(m.delta, 0)}% da média).`, { level: 'warn', link: { page: 'abastecimento' } });
      save(); toast('Abastecimento registrado.'); go(CUR.role === 'condutor' ? 'inicio' : 'abastecimento');
    });
  }
};

/* ---------- Meu veículo atual ---------- */
PAGES.meu_veiculo = {
  driver: true, title: 'Meu veículo',
  render() {
    const d = myDriver(); const c = d && driverCustodies(d.id)[0];
    if (!c) return `<div class="drv"><h1>Meu veículo</h1><div class="note">Você não está com nenhum veículo.</div><button class="btn ok lg block" data-go="scanner">Escanear veículo</button></div>`;
    const v = veh(c.vehicleId); const seg = currentSegment(c); const daily = dailyDoneToday(v.id); const mt = vehicleMaint(v.id);
    const fuels = S.fuel.filter(f => f.custodyId === c.id).sort((a, b) => b.at - a.at).slice(0, 3);
    const t = activeTransfer(v.id);
    return `<div class="drv">
      <div class="veh-card"><div class="top-line">${plate(v.plate, true)}${stTag(vStatus(v))}</div>
        <dl class="kv"><dt>Veículo</dt><dd>${esc(v.brand)} ${esc(v.model)} · ${v.year}</dd>
        <dt>Posse iniciada</dt><dd>${fmtDT(c.start)}</dd><dt>Km inicial</dt><dd class="num">${km(c.startKm)}</dd><dt>Km atual</dt><dd class="num">${km(v.odometer)}</dd>
        <dt>Obra</dt><dd>${seg ? projFull(seg.projectId) : projLabel(null)}</dd><dt>Centro de custo</dt><dd>${seg ? ccLabel(seg.ccId) : '—'}</dd>
        <dt>Checklist hoje</dt><dd>${daily ? `Feito às ${fmtTime(daily.at)}` : '<span class="st"><span class="dot warn"></span>Pendente</span>'}</dd>
        <dt>Próxima manutenção</dt><dd>${mt.next ? `${esc(mt.next.p.item)} em ${nf(mt.next.s.remKm)} km ${mLvl(mt.next.s.lvl)}` : '—'}</dd></dl></div>
      ${t ? `<div class="note warn">Transferência em andamento para ${esc(drv(t.toDriverId).name)}: ${T_LABEL[t.status]}.</div>` : ''}
      <div class="actions">
        ${!daily ? `<button class="act primary" data-go="diario" data-vid="${v.id}">${ic('check')}<span>Fazer checklist diário</span></button>` : ''}
        <button class="act" data-go="obra" data-vid="${v.id}">${ic('pin')}<span>Alterar obra<small>Sem encerrar a posse</small></span></button>
        <button class="act" data-go="abastecer" data-vid="${v.id}">${ic('fuel')}<span>Abastecer</span></button>
        <button class="act" data-go="problema" data-vid="${v.id}">${ic('alert')}<span>Informar problema</span></button>
        <button class="act" data-go="entregar" data-vid="${v.id}" ${t ? `data-tid="${t.id}"` : ''}>${ic('handoff')}<span>Entregar veículo</span></button>
      </div>
      <div class="panel"><div class="panel-h"><h3>Obras nesta posse</h3></div><div class="panel-b">${c.segments.map(s => `<div class="row small" style="padding:3px 0"><span class="mono num" style="min-width:92px">${fmtShort(s.at)}</span><b>${esc(prj(s.projectId).code)}</b><span class="muted">${esc(s.purpose || '')}</span></div>`).join('') || '<span class="muted">Sem obra</span>'}</div></div>
      ${fuels.length ? `<div class="panel"><div class="panel-h"><h3>Abastecimentos nesta posse</h3></div><div class="panel-b">${fuels.map(f => `<div class="row small" style="justify-content:space-between;padding:3px 0"><span>${fmtShort(f.at)}</span><span class="num">${nf(f.liters, 1)} L · ${money(f.total)}</span></div>`).join('')}</div></div>` : ''}
    </div>`;
  }
};

/* ---------- Transferência de posse (detalhe) ---------- */
function transferStepper(t) {
  const order = T_STATUS.map(s => s[0]);
  const cur = t ? (t.status === 'cancelada' ? -1 : order.indexOf(t.status)) : 0;
  return `<div class="steps">${T_STATUS.map(([k, l], i) => `<div class="step ${i < cur || (t?.status === 'concluida') ? 'done' : ''} ${i === cur && t?.status !== 'concluida' ? 'cur' : ''}">${l}</div>`).join('')}</div>`;
}
PAGES.transferencia = {
  driver: true, title: 'Transferência de posse',
  render({ id }) {
    const t = byId(S.transfers, id); if (!t) return '<p>Transferência não encontrada.</p>';
    const v = veh(t.vehicleId); const me = CUR.driverId;
    let act = '';
    if (t.status === 'solicitada' && me === t.fromDriverId) act = `<button class="btn ok lg" data-act="t-accept" data-id="${t.id}">Aceitar e fazer a entrega</button>`;
    else if (['aguardando_entrega', 'entrega_andamento'].includes(t.status) && me === t.fromDriverId) act = `<button class="btn pri lg" data-go="entregar" data-vid="${v.id}" data-tid="${t.id}">Fazer checklist de entrega</button>`;
    else if (['aguardando_recebimento', 'recebimento_andamento'].includes(t.status) && me === t.toDriverId) act = `<button class="btn pri lg" data-go="receber" data-vid="${v.id}">Fazer checklist de recebimento</button>`;
    const canCancel = !['concluida', 'cancelada', 'aguardando_recebimento', 'recebimento_andamento'].includes(t.status) && (me === t.toDriverId || isManager());
    const wrap = CUR.role === 'condutor' ? 'drv' : 'stack';
    return `<div class="${wrap}">
      <div class="page-head" style="margin:0"><div><p class="label">Transferência de posse${t.forced ? ' · forçada' : ''}</p><h1 class="row">${plate(v.plate, true)} ${esc(drv(t.fromDriverId)?.name || '—')} → ${esc(drv(t.toDriverId)?.name || 'Pátio')}</h1></div></div>
      <div class="panel"><div class="panel-b stack">${transferStepper(t)}
        <dl class="dl"><dt>Situação</dt><dd><b>${T_LABEL[t.status]}</b></dd><dt>Solicitada em</dt><dd>${fmtDT(t.requestedAt)} por ${esc(userName(t.requestedBy))}</dd>
        <dt>Condutor anterior</dt><dd>${drvLink(t.fromDriverId)}</dd><dt>Novo condutor</dt><dd>${drvLink(t.toDriverId)}</dd>
        ${t.forced ? `<dt>Justificativa</dt><dd>${esc(t.justification)}</dd>` : ''}
        <dt>Checklist de entrega</dt><dd>${t.deliverChecklistId ? ckLink(t.deliverChecklistId) : '—'}</dd><dt>Checklist de recebimento</dt><dd>${t.receiveChecklistId ? ckLink(t.receiveChecklistId) : '—'}</dd></dl>
        <div class="row">${act}${canCancel ? `<button class="btn danger" data-act="t-cancel" data-id="${t.id}">Cancelar solicitação</button>` : ''}${isStaff() ? `<button class="btn" data-go="veiculo" data-id="${v.id}">Histórico do veículo</button>` : ''}</div>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Registro</h3></div><div class="panel-b"><ul class="tl">${t.events.slice().reverse().map(e => `<li class="${e.status === 'concluida' ? 'ok' : e.status === 'cancelada' ? 'gray' : ''}"><span class="t">${fmtDate(e.at)} ${fmtTime(e.at)}</span><div class="x">${T_LABEL[e.status]}<small>${esc(e.note || '')} · ${esc(userName(e.by))}</small></div></li>`).join('')}</ul></div></div>
    </div>`;
  }
};
const ckLink = id => { const k = byId(S.checklists, id); return k ? `<button class="link" data-act="ck-view" data-id="${k.id}">${CK_TYPES[k.type]} · ${fmtShort(k.at)} · ${nf(k.km)} km</button>` : '—'; };
ACTIONS['t-cancel'] = a => {
  const t = byId(S.transfers, a.dataset.id); setTransfer(t, 'cancelada', `Cancelada por ${CUR.name}`);
  log('transferencia', `Solicitação de transferência cancelada por ${CUR.name}`, { vehicleId: t.vehicleId, driverId: t.toDriverId });
  notify(t.fromDriverId, `A solicitação de transferência do ${veh(t.vehicleId).plate} foi cancelada.`); save(); toast('Solicitação cancelada.'); render();
};
ACTIONS['ck-view'] = a => showChecklist(a.dataset.id);
function showChecklist(id) {
  const k = byId(S.checklists, id); const v = veh(k.vehicleId); const iss = k.problem?.issueId ? byId(S.issues, k.problem.issueId) : null;
  openModal({
    title: `Checklist ${CK_TYPES[k.type].toLowerCase()} · ${v.plate}`, wide: true,
    body: `<dl class="dl"><dt>Data e hora</dt><dd>${fmtDT(k.at)}${k.late ? ' ' + pill('fora do prazo', 'warn') : ''}</dd><dt>Condutor</dt><dd>${k.driverId ? esc(drv(k.driverId).name) : esc(userName(k.userId || 'u_gestor'))}</dd>
      <dt>Quilometragem</dt><dd class="num">${km(k.km)}</dd>${k.fuelLevel ? `<dt>Combustível</dt><dd>${k.fuelLevel}</dd>` : ''}
      <dt>Resultado</dt><dd>${k.ok ? pill('Sem apontamentos', 'ok') : pill('Com apontamentos', 'warn')}</dd>
      ${k.location ? `<dt>Localização</dt><dd class="small">${geoText(k.location)}</dd>` : ''}</dl>
      ${k.items ? `<div class="tbl-wrap"><table class="tbl"><tbody>${CK_ITEMS.map(([x, l]) => `<tr><td>${l}</td><td class="r">${{ ok: PRESENCE.includes(x) ? pill('Presente', 'ok') : pill('OK', 'ok'), regular: pill('Regular', 'warn'), ruim: PRESENCE.includes(x) ? pill('Ausente', 'bad') : pill('Ruim', 'bad') }[k.items[x]] || '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${k.avarias ? `<div class="note warn"><b>Avarias:</b> ${esc(k.avarias)}</div>` : ''}${k.notes ? `<p><b>Observações:</b> ${esc(k.notes)}</p>` : ''}
      ${iss ? `<div class="note ${SEVERITY[iss.severity].c === 'gray' ? '' : SEVERITY[iss.severity].c}"><b>${esc(iss.type)} · ${SEVERITY[iss.severity].l}</b> — ${esc(iss.desc)} ${iss.canRun ? '' : '(veículo não pode circular)'}</div>` : ''}
      <div><p class="label" style="margin-bottom:6px">Fotos</p>${thumbs(k.photos)}</div>`,
    foot: `<button class="btn" data-act="modal-close">Fechar</button><button class="btn pri" data-act="ck-pdf" data-id="${k.id}">${ic('fine')}Gerar PDF</button>`
  });
}
