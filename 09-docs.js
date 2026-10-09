/* ===================== Documentação do veículo: CRLV e IPVA ===================== */
const docSet = () => S.settings.docs || (S.settings.docs = { warnDays: 30, urgentDays: 7 });
const docsOf = v => v.docs || (v.docs = { crlv: [], ipva: [], ipvaByRental: v.ownership === 'locada' });
const crlvCurrent = v => docsOf(v).crlv.slice().sort((a, b) => b.year - a.year)[0] || null;
function dueLevel(due) {
  const days = Math.floor((startOfDay(due) - startOfDay(nowTs())) / DAY); const st = docSet();
  return { days, lvl: days < 0 ? 'vencido' : days <= st.urgentDays ? 'urgente' : days <= st.warnDays ? 'atencao' : 'normal' };
}
// pendências de documentação de um veículo (licenciamento e parcelas de IPVA em aberto)
function docItems(v) {
  const d = docsOf(v); const out = [];
  const c = crlvCurrent(v);
  if (!c) out.push({ kind: 'crlv', label: 'CRLV não cadastrado', due: null, days: null, lvl: 'atencao' });
  else if (c.licDue) out.push({ kind: 'lic', label: `Licenciamento ${c.year + 1}`, due: c.licDue, ...dueLevel(c.licDue), ref: c });
  if (!d.ipvaByRental) {
    d.ipva.forEach(y => y.installments.filter(i => !i.paidAt).forEach(i => out.push({ kind: 'ipva', label: `IPVA ${y.year}${y.installments.length > 1 ? ` · parcela ${i.n}/${y.installments.length}` : ' · cota única'}`, due: i.due, value: i.value, ...dueLevel(i.due), year: y, inst: i })));
    const nextY = new Date().getFullYear() + 1;
    if (new Date().getMonth() === 11 && !d.ipva.some(y => y.year === nextY)) out.push({ kind: 'ipva_new', label: `Registrar IPVA ${nextY}`, due: new Date(nextY, 0, 10).getTime(), ...dueLevel(new Date(nextY, 0, 10).getTime()) });
  }
  return out.sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
}
function docAttention() {
  const out = [];
  S.vehicles.filter(v => v.active).forEach(v => docItems(v).filter(x => x.lvl !== 'normal').forEach(x => {
    const sub = x.due == null ? 'Anexe o documento do veículo' : x.days < 0 ? `Vencido há ${-x.days} dias${x.value ? ' · ' + money(x.value) : ''}` : x.days === 0 ? 'Vence hoje' : `Vence em ${x.days} dias${x.value ? ' · ' + money(x.value) : ''}`;
    out.push({ c: M_LEVEL[x.lvl].c === 'gray' ? 'warn' : M_LEVEL[x.lvl].c, r: x.lvl === 'vencido' ? 8 : x.lvl === 'urgente' ? 5 : 2, icon: 'fine', title: `${v.plate} · ${x.label}`, sub, text: '', at: null, go: { page: 'veiculo', id: v.id, tab: 'docs' } });
  }));
  return out;
}
function docCalEvents(from, to, vid) {
  const ev = []; const today = startOfDay(nowTs());
  S.vehicles.filter(v => v.active && (!vid || v.id === vid)).forEach(v => {
    docItems(v).filter(x => x.due != null).forEach(x => { const date = Math.max(startOfDay(x.due), today); if (date >= from && date < to) ev.push({ date, kind: 'doc', c: x.lvl === 'normal' ? 'rent' : LVL_CLASS[x.lvl], lvl: x.lvl, label: x.label, plate: v.plate, vid: v.id }); });
    docsOf(v).ipva.forEach(y => y.installments.filter(i => i.paidAt && i.paidAt >= from && i.paidAt < to).forEach(i => ev.push({ date: startOfDay(i.paidAt), kind: 'doc', c: 'ok', lvl: 'ok', label: `IPVA ${y.year} pago`, plate: v.plate, vid: v.id })));
  });
  return ev;
}
function docCosts(from, to) {
  const rows = [];
  S.vehicles.forEach(v => {
    docsOf(v).ipva.forEach(y => y.installments.filter(i => i.paidAt >= from && i.paidAt < to).forEach(i => rows.push({ kind: 'Documentação', value: i.paidValue ?? i.value, vehicleId: v.id, driverId: null, projectId: null })));
    docsOf(v).crlv.filter(c => c.feePaidAt >= from && c.feePaidAt < to && c.fee).forEach(c => rows.push({ kind: 'Documentação', value: c.fee, vehicleId: v.id, driverId: null, projectId: null }));
  });
  return rows;
}
const docBadge = v => { const bad = docItems(v).filter(x => x.lvl !== 'normal'); if (!bad.length) return ''; const w = bad.reduce((a, x) => M_LEVEL[x.lvl]?.r > M_LEVEL[a]?.r ? x.lvl : a, 'atencao'); return `<span class="pill ${M_LEVEL[w].c === 'gray' ? 'warn' : M_LEVEL[w].c}">${ic('fine')} Documentação</span>`; };

/* ---------- aba Documentos do veículo ---------- */
const fileChip = (f, act) => f ? `<button class="chip" data-act="doc-file" data-k="${act}">${ic('fine')}${esc(f.name)}${f.size ? ` · ${nf(f.size / 1024)} KB` : ''}</button>` : '<span class="muted small">Sem arquivo</span>';
function docsTab(v) {
  const d = docsOf(v); const M = isManager(); const c = crlvCurrent(v); const lic = c?.licDue ? dueLevel(c.licDue) : null;
  const lvlPill = (x, paid) => paid ? pill('Pago', 'ok') : `<span class="pill ${M_LEVEL[x.lvl].c === 'gray' ? '' : M_LEVEL[x.lvl].c}">${x.days < 0 ? `Vencida há ${-x.days} d` : x.days === 0 ? 'Vence hoje' : `${x.days} dias`}</span>`;
  const crlvCard = `<div class="panel" style="box-shadow:none"><div class="panel-h"><h3>CRLV</h3>${M ? `<button class="btn sm pri" data-act="crlv-add" data-id="${v.id}">${ic('plus')}${c ? 'Novo exercício' : 'Adicionar CRLV'}</button>` : ''}</div><div class="panel-b stack" style="gap:12px">
    ${c ? `<dl class="pairs"><div><dt>Exercício</dt><dd>${c.year}</dd></div><div><dt>RENAVAM</dt><dd class="num">${esc(c.renavam || '—')}</dd></div><div><dt>Emitido em</dt><dd>${fmtDate(c.issuedAt)}</dd></div><div><dt>Próximo licenciamento</dt><dd>${c.licDue ? `${fmtDate(c.licDue)} ${lvlPill(lic)}` : '—'}</dd></div></dl>
      <div class="row">${fileChip(c.file, `crlv:${v.id}:${c.year}`)}${c.fee ? `<span class="small muted">Taxa de licenciamento ${money(c.fee)}</span>` : ''}</div>
      ${d.crlv.length > 1 ? `<div class="small muted">Anteriores: ${d.crlv.filter(x => x !== c).sort((a, b) => b.year - a.year).map(x => `<button class="link" data-act="doc-file" data-k="crlv:${v.id}:${x.year}">${x.year}</button>`).join(' · ')}</div>` : ''}`
      : empty('Nenhum CRLV cadastrado. Anexe o CRLV-e (PDF) ou uma foto do documento.')}</div></div>`;
  const ipvaRows = d.ipva.slice().sort((a, b) => b.year - a.year).map(y => {
    const paid = y.installments.filter(i => i.paidAt); const tot = sum(y.installments, i => i.value);
    return `<div class="panel" style="box-shadow:none;background:var(--surface2)"><div class="panel-h"><h3>IPVA ${y.year}</h3><span class="small muted">${y.installments.length > 1 ? `${y.installments.length} parcelas` : 'Cota única'} · ${money(tot)}</span>${paid.length === y.installments.length ? pill('Quitado', 'ok') : pill(`${paid.length}/${y.installments.length} pagas`, 'warn')}</div>
      ${tbl(['Parcela', 'Vencimento', '>Valor', 'Situação', 'Comprovante', ''], y.installments.map(i => `<tr><td>${y.installments.length > 1 ? `${i.n}ª` : 'Única'}</td><td class="nowrap">${fmtDate(i.due)}</td><td class="r">${money(i.paidValue ?? i.value)}</td><td>${i.paidAt ? `${pill('Pago', 'ok')} <span class="small muted">${fmtDate(i.paidAt)}</span>` : lvlPill(dueLevel(i.due))}</td><td>${i.receipt ? fileChip(i.receipt, `ipva:${v.id}:${y.year}:${i.n}`) : '<span class="muted small">—</span>'}</td><td class="r">${M && !i.paidAt ? `<button class="btn sm" data-act="ipva-pay" data-id="${v.id}" data-y="${y.year}" data-n="${i.n}">Registrar pagamento</button>` : ''}</td></tr>`))}</div>`;
  }).join('');
  const ipvaCard = `<div class="panel" style="box-shadow:none"><div class="panel-h"><h3>IPVA</h3><div class="row">${v.ownership === 'locada' && M ? `<label class="row small" style="gap:8px"><span class="toggle"><input type="checkbox" data-act-change="ipva-rental" data-id="${v.id}" ${d.ipvaByRental ? 'checked' : ''}><i></i></span>Pago pela locadora</label>` : ''}${M && !d.ipvaByRental ? `<button class="btn sm pri" data-act="ipva-add" data-id="${v.id}">${ic('plus')}Registrar IPVA</button>` : ''}</div></div>
    <div class="panel-b stack" style="gap:12px">${d.ipvaByRental ? `<div class="note">${ic('key')}<div>IPVA de responsabilidade da ${esc(v.rental?.company || 'locadora')}. O sistema não gera lembretes de pagamento para este veículo.</div></div>` : ipvaRows || empty('Nenhum IPVA registrado.')}</div></div>`;
  return `<div class="panel-b stack" style="padding-top:12px">${crlvCard}${ipvaCard}</div>`;
}

/* ---------- arquivos ---------- */
function readDocFile(file) {
  return new Promise(async res => {
    if (!file) return res(null);
    if (file.type.startsWith('image/')) return res({ name: file.name, size: file.size, type: file.type, data: await readPhoto(file, 1400) });
    if (file.size <= (APP_MODE === 'cloud' ? 9.5 * 1024 * 1024 : 900 * 1024)) { const fr = new FileReader(); fr.onload = () => res({ name: file.name, size: file.size, type: file.type, data: fr.result }); fr.onerror = () => res({ name: file.name, size: file.size, type: file.type, data: null }); return fr.readAsDataURL(file); }
    res({ name: file.name, size: file.size, type: file.type, data: null, tooBig: true });
  });
}
ACTIONS['doc-file'] = a => {
  const [kind, vid, year, n] = a.dataset.k.split(':'); const d = docsOf(veh(vid));
  const f = kind === 'crlv' ? d.crlv.find(x => x.year === +year)?.file : d.ipva.find(y => y.year === +year)?.installments.find(i => i.n === +n)?.receipt;
  if (!f) return;
  let body;
  if (f.data?.startsWith('sb:')) {
    const url = CLOUD.fileUrl(f.data);
    body = !url ? `<div class="note">${ic('fine')}<div><b>${esc(f.name)}</b><br>O link do arquivo expirou. Recarregue a página.</div></div>`
      : f.type?.startsWith('image/') ? `<img src="${url}" alt="${esc(f.name)}" style="width:100%;border-radius:8px">`
      : `<div class="note">${ic('fine')}<div><b>${esc(f.name)}</b> · ${nf(f.size / 1024)} KB<br><a class="link" href="${url}" target="_blank" rel="noopener">Abrir o arquivo</a> <span class="small muted">(link válido por 1 hora)</span></div></div>`;
  } else if (f.data && f.type?.startsWith('image/')) body = `<img src="${f.data}" alt="${esc(f.name)}" style="width:100%;border-radius:8px">`;
  else if (f.data) { const blob = URL.createObjectURL(new Blob([Uint8Array.from(atob(f.data.split(',')[1]), c => c.charCodeAt(0))], { type: f.type || 'application/pdf' })); body = `<div class="note">${ic('fine')}<div><b>${esc(f.name)}</b> · ${nf(f.size / 1024)} KB<br><a class="link" href="${blob}" target="_blank" rel="noopener">Abrir o arquivo</a></div></div>`; }
  else body = `<div class="note">${ic('fine')}<div><b>${esc(f.name)}</b>${f.size ? ` · ${nf(f.size / 1024)} KB` : ''}<br>${f.demo ? 'Arquivo de exemplo da demonstração.' : f.tooBig ? 'Arquivo grande demais para guardar no navegador; na versão com banco ele vai para o armazenamento de arquivos.' : ''}</div></div>`;
  openModal({ title: kind === 'crlv' ? `CRLV ${year} · ${veh(vid).plate}` : `Comprovante IPVA ${year} · ${n}ª parcela`, body, wide: true });
};

/* ---------- CRLV ---------- */
ACTIONS['crlv-add'] = a => {
  const v = veh(a.dataset.id); const c = crlvCurrent(v); const y = c ? c.year + 1 : new Date().getFullYear();
  openModal({
    title: `CRLV · ${v.plate}`, body: `<form id="crlv-form" class="form-grid">
      <label class="field"><span>Exercício</span><input class="inp num" name="year" value="${y}"></label>
      <label class="field"><span>RENAVAM</span><input class="inp num" name="renavam" inputmode="numeric" maxlength="11" value="${esc(c?.renavam || '')}"></label>
      <label class="field"><span>Data de emissão</span><input class="inp" type="date" name="issuedAt" value="${dateInput(nowTs())}"></label>
      <label class="field"><span>Vencimento do próximo licenciamento</span><input class="inp" type="date" name="licDue" value="${c?.licDue ? dateInput(new Date(c.licDue).setFullYear(new Date(c.licDue).getFullYear() + 1)) : ''}"><small>Data limite para pagar o licenciamento e emitir o CRLV seguinte</small></label>
      <label class="field"><span>Taxa de licenciamento paga (R$)</span><input class="inp num" name="fee" inputmode="decimal" placeholder="opcional"></label>
      <label class="field"><span>Arquivo do CRLV-e (PDF ou foto)</span><input class="inp" type="file" name="file" accept="application/pdf,image/*"></label>
      <p class="err full" id="crlv-err"></p></form>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="crlv-save" data-id="${v.id}">Salvar</button>`
  });
};
ACTIONS['crlv-save'] = async a => {
  const v = veh(a.dataset.id); const form = $('#crlv-form'); const d = formData(form); const err = t => $('#crlv-err').textContent = t;
  const year = +d.year; if (!year || year < 2000 || year > 2100) return err('Informe o exercício (ano).');
  if (d.renavam && !/^\d{9,11}$/.test(d.renavam)) return err('RENAVAM deve ter 9 a 11 dígitos.');
  if (!d.licDue) return err('Informe o vencimento do próximo licenciamento para o sistema lembrar.');
  const file = await readDocFile(form.querySelector('[name=file]').files[0]);
  const docs = docsOf(v); docs.crlv = docs.crlv.filter(x => x.year !== year);
  const fee = parseFloat(String(d.fee || '').replace(/\./g, '').replace(',', '.')) || null;
  docs.crlv.push({ year, renavam: d.renavam, issuedAt: parseDate(d.issuedAt) || nowTs(), licDue: parseDate(d.licDue), fee, feePaidAt: fee ? (parseDate(d.issuedAt) || nowTs()) : null, file, by: CUR.id });
  log('documento', `CRLV ${year} cadastrado${file ? ` (${file.name})` : ''} · próximo licenciamento até ${fmtDate(parseDate(d.licDue))}`, { vehicleId: v.id });
  save(); closeModal(); toast('CRLV salvo.'); render();
};

/* ---------- IPVA ---------- */
ACTIONS['ipva-add'] = a => {
  const v = veh(a.dataset.id); const y = new Date().getFullYear() + (docsOf(v).ipva.some(x => x.year === new Date().getFullYear()) ? 1 : 0);
  openModal({
    title: `Registrar IPVA · ${v.plate}`, body: `<form id="ipva-form" class="form-grid">
      <label class="field"><span>Exercício</span><input class="inp num" name="year" value="${y}"></label>
      <label class="field"><span>Valor total (R$)</span><input class="inp num" name="total" inputmode="decimal"></label>
      <div class="field full"><span>Forma de pagamento</span><div class="seg"><label><input type="radio" name="parts" value="1"><span>Cota única</span></label><label><input type="radio" name="parts" value="3" checked><span>3 parcelas</span></label><label><input type="radio" name="parts" value="5"><span>5 parcelas</span></label></div></div>
      <label class="field"><span>Vencimento da 1ª parcela (ou da cota única)</span><input class="inp" type="date" name="first" value="${y}-01-15"></label>
      <p class="small muted">As demais parcelas vencem no mesmo dia dos meses seguintes. Confira as datas do calendário da Secretaria da Fazenda do seu estado, que variam pelo final da placa.</p>
      <p class="err full" id="ipva-err"></p></form>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="ipva-save" data-id="${v.id}">Salvar</button>`
  });
};
ACTIONS['ipva-save'] = a => {
  const v = veh(a.dataset.id); const d = formData($('#ipva-form')); const err = t => $('#ipva-err').textContent = t;
  const year = +d.year; const total = parseFloat(String(d.total).replace(/\./g, '').replace(',', '.')); const parts = +d.parts || 1;
  if (!year) return err('Informe o exercício.'); if (!total || total <= 0) return err('Informe o valor total.'); if (!d.first) return err('Informe o primeiro vencimento.');
  if (docsOf(v).ipva.some(x => x.year === year)) return err(`O IPVA ${year} já está registrado para este veículo.`);
  const f = new Date(d.first + 'T12:00'); const each = Math.round(total / parts * 100) / 100;
  const installments = Array.from({ length: parts }, (_, i) => { const dt = new Date(f); dt.setMonth(f.getMonth() + i); return { n: i + 1, due: startOfDay(dt.getTime()), value: i === parts - 1 ? Math.round((total - each * (parts - 1)) * 100) / 100 : each, paidAt: null, receipt: null }; });
  docsOf(v).ipva.push({ year, total, installments });
  log('documento', `IPVA ${year} registrado: ${money(total)} em ${parts === 1 ? 'cota única' : parts + ' parcelas'}`, { vehicleId: v.id });
  save(); closeModal(); toast('IPVA registrado. Os vencimentos entram no calendário.'); render();
};
ACTIONS['ipva-pay'] = a => {
  const v = veh(a.dataset.id); const y = docsOf(v).ipva.find(x => x.year === +a.dataset.y); const i = y.installments.find(x => x.n === +a.dataset.n);
  openModal({
    title: `Pagamento IPVA ${y.year} · ${v.plate}`, body: `<form id="pay-form" class="form-grid">
      <label class="field"><span>Data do pagamento</span><input class="inp" type="date" name="paidAt" value="${dateInput(nowTs())}"></label>
      <label class="field"><span>Valor pago (R$)</span><input class="inp num" name="value" value="${nf(i.value, 2)}"><small>Inclua multa e juros se pagou em atraso</small></label>
      <label class="field full"><span>Comprovante (PDF ou foto)</span><input class="inp" type="file" name="file" accept="application/pdf,image/*"></label>
      <p class="err full" id="pay-err"></p></form>`,
    foot: `<button class="btn" data-act="modal-close">Cancelar</button><button class="btn ok" data-act="ipva-pay-ok" data-id="${v.id}" data-y="${y.year}" data-n="${i.n}">Confirmar pagamento</button>`
  });
};
ACTIONS['ipva-pay-ok'] = async a => {
  const v = veh(a.dataset.id); const y = docsOf(v).ipva.find(x => x.year === +a.dataset.y); const i = y.installments.find(x => x.n === +a.dataset.n);
  const form = $('#pay-form'); const d = formData(form); const val = parseFloat(String(d.value).replace(/\./g, '').replace(',', '.'));
  if (!d.paidAt) return $('#pay-err').textContent = 'Informe a data do pagamento.'; if (!val) return $('#pay-err').textContent = 'Informe o valor pago.';
  i.paidAt = parseDate(d.paidAt); i.paidValue = val; i.receipt = await readDocFile(form.querySelector('[name=file]').files[0]); i.by = CUR.id;
  log('documento', `IPVA ${y.year} ${y.installments.length > 1 ? `${i.n}ª parcela` : 'cota única'} paga: ${money(val)}`, { vehicleId: v.id });
  save(); closeModal(); toast('Pagamento registrado.'); render();
};
document.addEventListener('change', e => {
  if (e.target.dataset?.actChange !== 'ipva-rental') return;
  const v = veh(e.target.dataset.id); docsOf(v).ipvaByRental = e.target.checked;
  log('documento', `IPVA ${e.target.checked ? 'marcado como responsabilidade da locadora' : 'passa a ser controlado pela empresa'}`, { vehicleId: v.id }); save(); render();
});

/* ---------- dados de exemplo ---------- */
function seedDocs(D) {
  const Y = new Date().getFullYear(); const t0 = startOfDay(nowTs());
  const demoFile = (n, v) => ({ name: n, size: 180000 + (v.plate.charCodeAt(0) * 911) % 90000, type: 'application/pdf', data: null, demo: true });
  const lic = { v1: 18, v3: -5, v6: 5 }; // dias até o próximo licenciamento (demonstração)
  D.vehicles.forEach((v, idx) => {
    const locada = v.ownership === 'locada';
    const docs = v.docs = { crlv: [], ipva: [], ipvaByRental: locada };
    const renavam = String(10000000000 + ((idx + 7) * 7349201) % 89999999999).slice(0, 11);
    const due = lic[v.id] != null ? t0 + lic[v.id] * DAY : new Date(Y + 1, 2 + idx % 8, 10 + idx).getTime();
    const cy = lic[v.id] != null ? Y - 1 : Y;
    docs.crlv.push({ year: cy, renavam, issuedAt: new Date(cy, 1 + idx % 6, 5 + idx).getTime(), licDue: due, fee: null, feePaidAt: null, file: demoFile(`CRLV-e_${cy}_${v.plate}.pdf`, v) });
    if (locada) return;
    const val = Math.round((v.year >= 2023 ? 3600 : 2200) + idx * 173);
    const parts = idx % 3 === 0 ? 1 : 3;
    docs.ipva.push({ year: Y, total: val, installments: Array.from({ length: parts }, (_, k) => {
      const dueK = new Date(Y, k, 12 + idx % 6).getTime(); const unpaid = v.id === 'v7' && k === parts - 1;
      return { n: k + 1, due: dueK, value: Math.round(val / parts * 100) / 100, paidAt: unpaid ? null : dueK - 2 * DAY, paidValue: null, receipt: unpaid ? null : { name: `comprovante_IPVA_${Y}_${v.plate}_${k + 1}.pdf`, size: 64000, type: 'application/pdf', data: null, demo: true } };
    }) });
  });
}
