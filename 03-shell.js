/* ===================== Estrutura da interface ===================== */
let CUR = null;            // usuário logado
let ROUTE = { page: 'login', p: {} };
let DRAFT = null;          // rascunho de formulário em andamento
let SIDE_OPEN = false;

const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2"/>',
  car: '<path d="M5 17h14M3 17v-5l2-5h14l2 5v5M7 17v2M17 17v2M6.5 13.5h.01M17.5 13.5h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  check: '<path d="M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  toll: '<path d="M4 20V8l8-5 8 5v12M4 12h16M9 20v-5h6v5"/>',
  fine: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  report: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  alert: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/>',
  handoff: '<path d="M3 12h13M12 7l5 5-5 5M20 4v16"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 18l6-6-6-6"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/>',
  seat: '<path d="M7 3h6a2 2 0 0 1 2 2v7H7zM5 12h12l1 5H6zM7 17v4M16 17v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0M12 18l4-6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
  road: '<path d="M4 21 9 3M20 21 15 3M12 6v2M12 11v2M12 16v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
};
const ic = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[k] || ''}</svg>`;

/* ----- tema claro / escuro (escolha salva neste aparelho) ----- */
const THEME_KEY = 'vialink-theme';
const themeNow = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || t === 'light' ? t : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); };
function applyTheme(t) {
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = themeNow() === 'dark' ? '#1C1C1C' : '#F4EFE4';
}
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (e) { applyTheme(null); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (e) { } if (!saved) { applyTheme(null); render(); } }); } catch (e) { }
const themeBtn = (cls = '') => { const d = themeNow() === 'dark'; return `<button class="icon-btn ${cls}" data-act="theme" aria-label="${d ? 'Usar modo claro' : 'Usar modo escuro'}" title="${d ? 'Modo claro' : 'Modo escuro'}">${ic(d ? 'sun' : 'moon')}</button>`; };

const NAV = [
  { g: 'Visão geral', items: [['dashboard', 'Painel da frota', 'dash'], ['calendario', 'Calendário', 'cal']] },
  { g: 'Frota', items: [['veiculos', 'Veículos', 'car'], ['condutores', 'Condutores', 'user'], ['transferencias', 'Transferências', 'swap']] },
  { g: 'Controle', items: [['checklists', 'Checklists', 'check'], ['abastecimento', 'Abastecimentos', 'fuel'], ['manutencao', 'Manutenção', 'wrench'], ['pedagios', 'Pedágios', 'toll'], ['multas', 'Multas', 'fine']] },
  { g: 'Gestão', items: [['bonificacao', 'Premiação', 'trophy'], ['relatorios', 'Relatórios', 'report']] },
  { g: 'Sistema', items: [['configuracoes', 'Configurações', 'gear']] }
];
const PAGE_ROLES = { configuracoes: ['admin'] };
const isManager = () => CUR && ['admin', 'gestor'].includes(CUR.role);
const isStaff = () => CUR && CUR.role !== 'condutor';
const canPage = page => !PAGE_ROLES[page] || PAGE_ROLES[page].includes(CUR.role);
const myDriver = () => CUR?.driverId ? drv(CUR.driverId) : null;

const PAGES = {}; // registrado nos demais arquivos: PAGES[nome] = { title, render(p), mount?(p), driver? }

function go(page, p = {}, opts = {}) {
  ROUTE = { page, p };
  if (!opts.keepDraft) DRAFT = null;
  SIDE_OPEN = false;
  if (!opts.noPush) { try { history.pushState({ page, p }, ''); } catch (e) { } }
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', e => { if (e.state && CUR) { ROUTE = e.state; DRAFT = null; render(); } });

function render() {
  const root = $('#app');
  stopCamera(); if (typeof destroyMaps === "function") destroyMaps();
  if (!CUR || ROUTE.page === 'login') { root.innerHTML = PAGES.login.render() + themeBtn('theme-fab'); PAGES.login.mount?.(); return; }
  let pg = PAGES[ROUTE.page];
  if (!pg || (!pg.driver && CUR.role === 'condutor') || !canPage(ROUTE.page)) { ROUTE = { page: homePage(), p: {} }; pg = PAGES[ROUTE.page]; }
  const body = pg.render(ROUTE.p);
  const demo = demoBar();
  if (CUR.role === 'condutor') {
    root.innerHTML = `${demo}<div class="drv-shell">${driverTop()}${body}</div>`;
  } else {
    const rb = pg.rightbar ? pg.rightbar(ROUTE.p) : '';
    root.innerHTML = `${demo}<div class="app">${sidebar()}${SIDE_OPEN ? '<div class="scrim" data-act="side-close"></div>' : ''}<div class="main">${topbar(pg)}<div class="body-wrap ${rb ? 'with-rb' : ''}"><div class="content">${body}</div>${rb ? `<aside class="rightbar">${rb}</aside>` : ''}</div></div></div>`;
  }
  pg.mount?.(ROUTE.p);
}
const homePage = () => CUR.role === 'condutor' ? 'inicio' : 'dashboard';

function demoBar() {
  if (APP_MODE === 'cloud') return '';
  const opts = S.users.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === CUR.id ? 'selected' : ''}>${esc(u.name)} — ${ROLES[u.role]}</option>`).join('');
  return `<div class="demo-bar"><b>Protótipo</b><span>dados de demonstração</span>
    <label class="row" style="gap:6px;margin-left:auto"><span>Entrar como</span><select id="demo-user" aria-label="Alternar usuário">${opts}</select></label>${cloudConfigured() ? '<button class="btn sm" data-act="cl-back">Sair da demonstração</button>' : ''}</div>`;
}
function sidebar() {
  const counts = { transferencias: S.transfers.filter(t => !['concluida', 'cancelada'].includes(t.status)).length, dashboard: attentionItems().filter(a => ['bad', 'urg'].includes(a.c)).length };
  const groups = NAV.map(g => {
    const items = g.items.filter(([k]) => canPage(k));
    if (!items.length) return '';
    return `<div class="nav-group">${g.g}</div>` + items.map(([k, l, i]) => `<button data-go="${k}" class="${ROUTE.page === k || (PARENT[ROUTE.page] === k) ? 'on' : ''}">${ic(i)}<span>${l}</span>${counts[k] ? `<span class="count ${k === 'dashboard' ? 'crit' : ''}">${counts[k]}</span>` : ''}</button>`).join('');
  }).join('');
  return `<aside class="side ${SIDE_OPEN ? 'open' : ''}"><div class="brand">${brandMark()}<div><b>gestaovia</b><span>Gestão de frota</span></div></div>
    <nav class="nav" aria-label="Menu principal">${groups}</nav>
    <div class="side-foot"><span class="avatar">${initials(CUR.name)}</span><div style="flex:1;min-width:0"><b style="color:var(--text2);display:block">${esc(CUR.name)}</b>${ROLES[CUR.role]}</div><button class="icon-btn" data-act="logout" aria-label="Sair" title="Sair">${ic('logout')}</button></div></aside>`;
}
const brandMark = () => `<div class="brand-mark">${ic('car')}</div>`;
const PARENT = { veiculo: 'veiculos', condutor: 'condutores', transferencia: 'transferencias', scan_result: 'veiculos', checklist_view: 'checklists', forcar: 'transferencias', checklist_full: 'manutencao', scanner: 'veiculos', abastecer: 'abastecimento', obra: 'veiculos', problema: 'veiculos' };
function topbar(pg) {
  const parent = PARENT[ROUTE.page];
  const parentTitle = parent ? NAV.flatMap(g => g.items).find(i => i[0] === parent)?.[1] : null;
  const title = typeof pg.title === 'function' ? pg.title(ROUTE.p) : pg.title;
  const unread = myNotifications().filter(n => !n.read).length;
  return `<header class="top">
    <button class="icon-btn menu-btn" data-act="side-open" aria-label="Abrir menu">${ic('menu')}</button>
    ${parentTitle ? `<button class="icon-btn" data-go="${parent}" aria-label="Voltar para ${parentTitle}" title="${parentTitle}">${ic('back')}</button>` : ''}
    <h1>${esc(title)}</h1>
    <div class="spacer"></div>
    ${syncBadge()}
    <button class="icon-btn scan" data-go="scanner" aria-label="Escanear QR Code" title="Escanear QR Code">${ic('qr')}</button>
    <button class="icon-btn" data-act="notifs" aria-label="Notificações" title="Notificações">${ic('bell')}${unread ? `<span class="badge">${unread}</span>` : ''}</button>
    ${themeBtn()}
    <div class="who"><span class="avatar">${initials(CUR.name)}</span><span class="nm">${esc(CUR.name.split(' ')[0])}</span></div>
  </header>`;
}
function driverTop() {
  const unread = myNotifications().filter(n => !n.read).length;
  const home = ROUTE.page === 'inicio';
  return `<header class="top" style="padding-inline:16px">
    ${home ? `${brandMark()}<b>gestaovia</b>` : `<button class="icon-btn" data-go="inicio" aria-label="Voltar ao início">${ic('back')}</button><h1>${esc(typeof PAGES[ROUTE.page]?.title === 'function' ? PAGES[ROUTE.page].title(ROUTE.p) : PAGES[ROUTE.page]?.title || '')}</h1>`}
    <div class="spacer"></div>
    <button class="icon-btn" data-act="notifs" aria-label="Notificações">${ic('bell')}${unread ? `<span class="badge">${unread}</span>` : ''}</button>
    ${themeBtn()}
    <button class="icon-btn" data-act="logout" aria-label="Sair">${ic('logout')}</button>
  </header>`;
}
function myNotifications() {
  if (!CUR) return [];
  return S.notifications.filter(n => n.to === CUR.driverId || n.to === CUR.id || (n.to === 'gestao' && isStaff())).sort((a, b) => b.at - a.at);
}

/* ----- componentes ----- */
const plate = (p, lg) => `<span class="plate ${lg ? 'lg' : ''}"><i></i><span>${esc(p)}</span></span>`;
const stTag = s => `<span class="st"><span class="dot ${V_STATUS[s].c}"></span>${V_STATUS[s].l}</span>`;
const pill = (txt, c = '') => `<span class="pill ${c}">${txt}</span>`;
const mLvl = l => `<span class="st"><span class="dot ${M_LEVEL[l].c}"></span>${M_LEVEL[l].l}</span>`;
const projLabel = id => { const p = prj(id); return p ? `${esc(p.code)}` : '<span class="st"><span class="dot urg"></span>Sem obra</span>'; };
const projFull = id => { const p = prj(id); return p ? `${esc(p.code)} <span class="muted">· ${esc(p.name)}</span>` : 'Sem obra'; };
const ccLabel = id => { const c = ccOf(id); return c ? `${c.code} – ${esc(c.name)}` : '—'; };
const drvLink = id => { const d = drv(id); if (!d) return '<span class="muted">—</span>'; return isStaff() ? `<button class="link" data-go="condutor" data-id="${d.id}">${esc(d.name)}</button>` : esc(d.name); };
const vehLink = id => { const v = veh(id); if (!v) return '—'; return isStaff() ? `<button class="link" data-go="veiculo" data-id="${v.id}" style="text-decoration:none">${plate(v.plate)}</button>` : plate(v.plate); };
const empty = t => `<div class="panel-b muted">${t}</div>`;
function photoSrc(p, label = '') {
  if (!p) return null;
  if (p.startsWith('data:') || p.startsWith('http')) return p;
  if (p.startsWith('sb:')) { const u = CLOUD.fileUrl(p); if (u) return u; label = 'Foto indisponível'; p = 'x:'; }
  const lab = { frontal: 'Frontal', traseira: 'Traseira', lat_dir: 'Lateral dir.', lat_esq: 'Lateral esq.', painel: 'Painel', cupom: 'Cupom fiscal' }[p.split(':')[1]] || label;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 160 120"><rect width="160" height="120" fill="#C9CED3"/><path d="M28 80h104M36 80v-16l10-18h68l10 18v16" stroke="#7B838B" stroke-width="3" fill="none"/><circle cx="54" cy="84" r="9" fill="#7B838B"/><circle cx="106" cy="84" r="9" fill="#7B838B"/><text x="80" y="22" font-family="sans-serif" font-size="12" fill="#3E454C" text-anchor="middle">${lab}${p === 'x:' ? '' : ' (exemplo)'}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function thumbs(photos) {
  if (!photos) return '';
  const ks = Object.entries(photos).filter(([, v]) => v && !v.startsWith('removida'));
  if (!ks.length) return '<span class="muted small">Sem fotos</span>';
  return `<div class="thumbs">${ks.map(([k, v]) => `<img src="${photoSrc(v, k)}" alt="${esc((PHOTO_SLOTS.find(s => s[0] === k) || [0, k])[1])}" data-act="photo" data-src="${k}">`).join('')}</div>`;
}

/* ----- modal e aviso ----- */
function openModal({ title, body, foot = '', wide = false, onMount }) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal-bg'; el.id = 'modal';
  el.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="x-btn" data-act="modal-close" aria-label="Fechar">×</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  el.addEventListener('click', e => { if (e.target === el) closeModal(); });
  document.body.appendChild(el);
  onMount?.(el);
  return el;
}
function closeModal() { $('#modal')?.remove(); }
let toastT = null;
function toast(msg) {
  $('.toast')?.remove(); clearTimeout(toastT);
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t);
  toastT = setTimeout(() => t.remove(), 3600);
}

/* ----- eventos globais ----- */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); const p = {}; Object.entries(g.dataset).forEach(([k, v]) => { if (k !== 'go') p[k] = v; }); closeModal(); go(g.dataset.go, p); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'side-open') { SIDE_OPEN = true; render(); }
  else if (act === 'side-close') { SIDE_OPEN = false; render(); }
  else if (act === 'modal-close') closeModal();
  else if (act === 'logout' && APP_MODE === 'cloud') CLOUD.leave();
  else if (act === 'logout') { CUR = null; try { sessionStorage.removeItem('vialink-user'); } catch (x) { } go('login'); }
  else if (act === 'notifs') showNotifications();
  else if (act === 'theme') { const t = themeNow() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(THEME_KEY, t); } catch (x) { } applyTheme(t); render(); }
  else if (act === 'photo') { openModal({ title: 'Foto', body: `<img src="${e.target.src}" alt="" style="width:100%">`, wide: true }); }
  else if (ACTIONS[act]) ACTIONS[act](a, e);
});
document.addEventListener('change', e => {
  if (e.target.id === 'demo-user') { CUR = byId(S.users, e.target.value); try { sessionStorage.setItem('vialink-user', CUR.id); } catch (x) { } go(homePage()); toast(`Agora você está como ${CUR.name} (${ROLES[CUR.role]}).`); }
});
const ACTIONS = {};

function showNotifications() {
  const ns = myNotifications();
  openModal({
    title: 'Notificações',
    body: ns.length ? `<ul class="att" style="padding:0">${ns.slice(0, 30).map(n => `<li ${n.link ? `data-go="${n.link.page}" data-id="${n.link.id || ''}"` : ''}><span class="ic ${n.level === 'info' ? 'neu' : n.level}">${ic('bell')}</span><div>${esc(n.text)}${n.read ? '' : ' <span class="pill blue">nova</span>'}</div><span class="when">${fmtShort(n.at)}</span></li>`).join('')}</ul>` : '<p class="empty">Nenhuma notificação.</p>',
    foot: ns.length ? '<button class="btn" data-act="notifs-read">Marcar todas como lidas</button>' : ''
  });
}
ACTIONS['notifs-read'] = () => { myNotifications().forEach(n => n.read = true); save(); closeModal(); render(); };

/* ----- utilidades de formulário ----- */
function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); return o; }
function projectOptions(sel) { return S.projects.filter(p => p.active).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.code)} – ${esc(p.name)}</option>`).join(''); }
function ccOptions(sel) { return S.costCenters.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.code} – ${esc(c.name)}</option>`).join(''); }
function purposeOptions(sel) { return PURPOSES.map(p => `<option ${p === sel ? 'selected' : ''}>${p}</option>`).join(''); }
function driverOptions(sel, filter = () => true) { return S.drivers.filter(filter).map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join(''); }

// redimensiona a foto para caber no armazenamento do protótipo
function readPhoto(file, maxW = 640) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, maxW / img.width); const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .62));
      };
      img.onerror = () => res(fr.result);
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
