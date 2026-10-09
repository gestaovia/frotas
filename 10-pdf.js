/* ===================== PDF do checklist (foto + informações) ===================== */
function imgToJpeg(src, maxW = 1000) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => {
      const w0 = im.naturalWidth || 480, h0 = im.naturalHeight || 360; const sc = Math.min(1, maxW / w0);
      const c = document.createElement('canvas'); c.width = Math.round(w0 * sc); c.height = Math.round(h0 * sc);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      try { res({ data: c.toDataURL('image/jpeg', .85), w: c.width, h: c.height }); } catch (e) { res(null); }
    };
    im.onerror = () => res(null); if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'; im.src = src;
  });
}
async function offerFile(filename, blob) {
  // no visualizador do Claude a página pede confirmação para salvar; publicado no seu domínio, baixa direto
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) { try { await dl.save({ filename, data: blob }); toast('PDF salvo.'); } catch (e) { if (e?.code !== 'declined') toast('Não foi possível salvar o PDF aqui.'); } return; }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast('PDF gerado.');
}
async function checklistPDF(id) {
  if (!window.jspdf?.jsPDF) return toast('O gerador de PDF não carregou. Verifique a conexão.');
  const k = byId(S.checklists, id); const v = veh(k.vehicleId); const c = k.custodyId ? byId(S.custody, k.custodyId) : custodyAt(v.id, k.at);
  const seg = c ? segmentAt(c, k.at + 5 * MIN) : null; const iss = k.problem?.issueId ? byId(S.issues, k.problem.issueId) : null;
  const who = k.driverId ? drv(k.driverId).name : userName(k.userId || 'u_gestor');
  const t = S.transfers.find(x => x.deliverChecklistId === k.id || x.receiveChecklistId === k.id);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14; let y = 0;
  const BLUE = [46, 46, 46], INK = [30, 30, 30], MUTED = [94, 90, 82], LINE = [210, 203, 187], SOFT = [244, 239, 228];
  const col = { ok: [22, 163, 74], regular: [202, 138, 4], ruim: [220, 38, 38] };
  const text = (s, x, yy, o = {}) => { doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 9.5); doc.setTextColor(...(o.color || INK)); doc.text(String(s ?? '—'), x, yy, o.align ? { align: o.align, maxWidth: o.maxWidth } : { maxWidth: o.maxWidth }); };
  const need = h => { if (y + h > 282) { doc.addPage(); y = 16; } };
  const title = s => { need(12); text(s.toUpperCase(), M, y, { bold: true, size: 8.5, color: MUTED }); doc.setDrawColor(...LINE); doc.line(M, y + 2, W - M, y + 2); y += 7; };

  // cabeçalho
  doc.setFillColor(...BLUE); doc.rect(0, 0, W, 28, 'F');
  text('gestaovia', M, 11, { bold: true, size: 11, color: [255, 255, 255] });
  text({ diario: 'Checklist diário', avaria: 'Registro de avaria' }[k.type] || `Checklist de ${CK_TYPES[k.type].toLowerCase()}`, M, 20, { bold: true, size: 16, color: [255, 255, 255] });
  doc.setFillColor(255, 255, 255); doc.roundedRect(W - M - 46, 7, 46, 15, 2, 2, 'F');
  doc.setFillColor(46, 46, 46); doc.rect(W - M - 46, 7, 46, 3, 'F');
  text(v.plate, W - M - 23, 19, { bold: true, size: 15, color: INK, align: 'center' });
  y = 36;

  // resultado
  const okC = k.ok ? col.ok : k.problem ? col.ruim : col.regular;
  doc.setFillColor(...okC.map(n => Math.round(n + (255 - n) * .88))); doc.roundedRect(M, y - 5, W - 2 * M, 10, 2, 2, 'F');
  text(k.ok ? 'Sem apontamentos' : k.problem ? 'Veículo com problema informado' : 'Com apontamentos', M + 4, y + 1.5, { bold: true, color: okC });
  text(`${fmtDT(k.at)}${k.late ? ' · fora do prazo' : ''}`, W - M - 4, y + 1.5, { color: MUTED, align: 'right' });
  y += 13;

  // dados
  title('Identificação');
  const rows = [
    ['Veículo', `${v.brand} ${v.model} · ${v.year}`], ['Placa', v.plate],
    ['Condutor', who], ['Quilometragem', `${nf(k.km)} km`],
    ['Combustível', k.fuelLevel || '—'], ['Obra', seg ? `${prj(seg.projectId).code} · ${prj(seg.projectId).name}` : '—'],
    ['Centro de custo', seg ? `${ccOf(seg.ccId).code} – ${ccOf(seg.ccId).name}` : '—'], ['Localização', k.location ? `${k.location.lat.toFixed(5)}, ${k.location.lng.toFixed(5)} (${k.location.source === 'celular' ? 'GPS do celular' : 'rastreador'})` : '—']
  ];
  if (t) rows.push(['Transferência', `${drv(t.fromDriverId)?.name || '—'} para ${drv(t.toDriverId)?.name || 'pátio'}`], ['Situação', T_LABEL[t.status]]);
  const cw = (W - 2 * M) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    need(12);
    [rows[i], rows[i + 1]].forEach((r, j) => { if (!r) return; const x = M + j * cw; doc.setFillColor(...SOFT); doc.roundedRect(x, y - 4, cw - 3, 10.5, 1.5, 1.5, 'F'); text(r[0].toUpperCase(), x + 3, y, { size: 6.5, bold: true, color: MUTED }); text(r[1], x + 3, y + 4.5, { size: 9, maxWidth: cw - 9 }); });
    y += 12.5;
  }

  // itens
  if (k.items) {
    y += 2; title('Itens avaliados');
    CK_ITEMS.forEach(([key, lbl], i) => {
      const val = k.items[key]; const x = M + (i % 2) * cw; if (i % 2 === 0) need(8);
      const lab = { ok: PRESENCE.includes(key) ? 'Presente' : 'OK', regular: 'Regular', ruim: PRESENCE.includes(key) ? 'Ausente' : 'Ruim' }[val] || '—';
      text(lbl, x, y, { size: 9 }); text(lab, x + cw - 6, y, { size: 9, bold: true, color: col[val] || MUTED, align: 'right' });
      doc.setDrawColor(...LINE); doc.line(x, y + 2, x + cw - 6, y + 2);
      if (i % 2 === 1 || i === CK_ITEMS.length - 1) y += 7;
    });
  }
  const para = (label, body, color) => { if (!body) return; const lines = doc.splitTextToSize(body, W - 2 * M - 8); need(10 + lines.length * 4.5); doc.setFillColor(...(color || SOFT)); doc.roundedRect(M, y - 4, W - 2 * M, 8 + lines.length * 4.5, 2, 2, 'F'); text(label, M + 4, y + 0.5, { bold: true, size: 8.5 }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(lines, M + 4, y + 5.2); y += 10 + lines.length * 4.5; };
  y += 3;
  para('Avarias', k.avarias, [254, 243, 199]);
  para('Observações', k.notes);
  if (iss) para(`Problema: ${iss.type} · criticidade ${SEVERITY[iss.severity].l.toLowerCase()}${iss.canRun ? '' : ' · veículo não pode circular'}`, iss.desc, [254, 226, 226]);

  // fotos
  const ph = Object.entries(k.photos || {}).filter(([, s]) => s && !String(s).startsWith('removida'));
  if (iss?.photo) ph.push(['problema', iss.photo]);
  if (ph.length) {
    y += 2; title(`Fotos (${ph.length})`);
    const pw = (W - 2 * M - 8) / 3, phh = pw * .68;
    const imgs = await Promise.all(ph.map(([key, s]) => imgToJpeg(photoSrc(s, key))));
    imgs.forEach((im, i) => {
      if (i % 3 === 0) need(phh + 9);
      const x = M + (i % 3) * (pw + 4);
      if (im) {
        const r = Math.min(pw / im.w, phh / im.h); const dw = im.w * r, dh = im.h * r;
        doc.setFillColor(...SOFT); doc.rect(x, y, pw, phh, 'F'); doc.addImage(im.data, 'JPEG', x + (pw - dw) / 2, y + (phh - dh) / 2, dw, dh);
      } else { doc.setDrawColor(...LINE); doc.rect(x, y, pw, phh); text('Foto indisponível', x + pw / 2, y + phh / 2, { align: 'center', color: MUTED, size: 8 }); }
      const key = ph[i][0]; text((PHOTO_SLOTS.find(p => p[0] === key) || [0, key === 'problema' ? 'Problema' : key === 'painel' ? 'Painel' : key])[1], x, y + phh + 4, { size: 8, color: MUTED });
      if (i % 3 === 2 || i === imgs.length - 1) y += phh + 7;
    });
  }

  // assinaturas
  need(12); y += 6;
  [['Condutor', who], ['Conferido por (gestão)', '']].forEach(([l, n], j) => { const x = M + j * cw; doc.setDrawColor(...MUTED); doc.line(x, y, x + cw - 10, y); text(l, x, y + 4.5, { size: 8, color: MUTED }); if (n) text(n, x, y + 9, { size: 9 }); });

  // rodapé em todas as páginas
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setDrawColor(...LINE); doc.line(M, 288, W - M, 288); text(`Gerado pelo gestaovia em ${fmtDT(nowTs())} por ${CUR.name} · checklist ${k.id}`, M, 292, { size: 7, color: MUTED }); text(`${p}/${n}`, W - M, 292, { size: 7, color: MUTED, align: 'right' }); }

  const d = new Date(k.at); const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  log('documento', `PDF do checklist de ${CK_TYPES[k.type].toLowerCase()} gerado por ${CUR.name}`, { vehicleId: v.id, driverId: k.driverId }); save();
  await offerFile(`checklist_${k.type}_${v.plate}_${stamp}.pdf`, doc.output('blob'));
}
ACTIONS['ck-pdf'] = async a => { a.disabled = true; const old = a.innerHTML; a.textContent = 'Gerando…'; try { await checklistPDF(a.dataset.id); } finally { a.disabled = false; a.innerHTML = old; } };
