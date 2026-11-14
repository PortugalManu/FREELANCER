/* Diárias — app do celular (PWA).
 * Só desenha as telas. Toda regra de negócio fica no Apps Script da planilha. */
'use strict';
const APP_VERSAO = 3;

/* ---------------- guardado no aparelho ---------------- */
const K = { api: 'diarias.api', chave: 'diarias.chave', usuario: 'diarias.usuario', cfg: 'diarias.cfg', resumo: 'diarias.resumo' };
const guardado = {
  ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  apagar(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const CORES = ['#7c5cff', '#ff4f8b', '#ff7a45', '#f5b301', '#22c55e', '#14b8a6', '#3b82f6', '#e11d48', '#334155'];
const CFG_PADRAO = { cor: '#7c5cff', tema: 'auto', saudacao: 'Oi', emoji: '👋', valorDiaria: 170, pessoaPadrao: 'José', fonte: 'padrao', cantos: 'redondo' };

const st = {
  api: guardado.ler(K.api),
  chave: guardado.ler(K.chave),
  usuario: guardado.ler(K.usuario),
  cfg: Object.assign({}, CFG_PADRAO, guardado.ler(K.cfg) || {}),
  resumo: guardado.ler(K.resumo),
  tela: 'resumo',
  offline: false,
  abertos: new Set(),
  lancar: null,
  abater: { alvo: null, cartao: null, valor: '', previa: null, idEnvio: null, feito: null },
  rascunhoCfg: null,
  instalar: null
};

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = n => fmtBRL.format(Number(n || 0)).replace(/ /g, ' ');
const num2 = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function lerValor(txt) {
  let s = String(txt || '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const hojeISO = (delta = 0) => { const d = new Date(); d.setDate(d.getDate() + delta); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function dataBonita(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
}
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const vibrar = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const ehAdmin = () => !st.usuario || st.usuario.papel === 'admin';

const ICO = {
  diaria: '<svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
  cartoes: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 10h18M7 15h4"/></svg>',
  carro: '<svg viewBox="0 0 24 24"><path d="M5 16h14M4 16v-3l2-5h12l2 5v3M4 16v2M20 16v2"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/></svg>',
  manu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" class="bloco-chev"><path d="M6 9l6 6 6-6"/></svg>',
  enviar: '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-3-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lapis: '<svg viewBox="0 0 24 24" class="item-acao"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" class="item-acao"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};
const icoBloco = g => ICO[g === 'jose' ? 'diaria' : g] || ICO.diaria;

/* ---------------- tema ---------------- */
function luminancia(hex) {
  const v = hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const mqEscuro = window.matchMedia('(prefers-color-scheme: dark)');
function aplicarTema(cfg) {
  const r = document.documentElement;
  const escuro = cfg.tema === 'escuro' || (cfg.tema === 'auto' && mqEscuro.matches);
  r.dataset.theme = escuro ? 'dark' : 'light';
  r.dataset.fonte = cfg.fonte || 'padrao';
  r.style.setProperty('--accent', cfg.cor);
  r.style.setProperty('--on-accent', luminancia(cfg.cor) > 0.45 ? '#17151f' : '#ffffff');
  r.style.setProperty('--radius', { reto: '8px', suave: '14px', redondo: '22px' }[cfg.cantos] || '22px');
  $('meta[name="theme-color"]').setAttribute('content', escuro ? '#0f0e14' : cfg.cor);
}
mqEscuro.addEventListener('change', () => aplicarTema(st.rascunhoCfg || st.cfg));

/* ---------------- avisos ---------------- */
let toastTimer;
function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast on' + (erro ? ' erro' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, erro ? 4500 : 2600);
  if (erro) vibrar([40, 60, 40]);
}

function dialogo(html, acoes) {
  // acoes: [{ texto, classe, valor }]
  return new Promise(resolve => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog" class="dlg-corpo">${html}<div class="dlg-acoes">${acoes.map((a, i) =>
      `<button class="btn ${a.classe || 'secundario'}" value="${i}">${esc(a.texto)}</button>`).join('')}</div></form>`;
    d.onclose = () => resolve(d.returnValue === '' ? null : acoes[Number(d.returnValue)]?.valor ?? null);
    d.returnValue = '';
    d.showModal();
  });
}

/* ---------------- API ---------------- */
async function chamar(acao, dados = {}, tempo = 60000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), tempo);
  let resp;
  try {
    // corpo em texto simples: o Google aceita sem "preflight" de CORS
    resp = await fetch(st.api, { method: 'POST', body: JSON.stringify(Object.assign({ token: st.chave, acao }, dados)), signal: ctl.signal, redirect: 'follow' });
  } catch (e) {
    st.offline = true;
    throw new Error(e.name === 'AbortError' ? 'A planilha demorou demais para responder. Tente de novo.' : 'Sem conexão com a planilha. Confira a internet.');
  } finally { clearTimeout(timer); }
  let j;
  try { j = JSON.parse(await resp.text()); }
  catch (e) { throw new Error('A API respondeu algo inesperado. Confira a URL e se a implantação está como "Qualquer pessoa".'); }
  st.offline = false;
  if (!j.ok) {
    if (j.codigo === 'auth') { sair(j.erro); }
    throw new Error(j.erro || 'Algo deu errado.');
  }
  if (j.resumo) { st.resumo = j.resumo; guardado.gravar(K.resumo, j.resumo); }
  return j;
}

/* ---------------- início ---------------- */
function lerLinkMagico() {
  if (!location.hash.includes('chave=')) return;
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('api') && p.get('chave')) {
    st.api = p.get('api'); st.chave = p.get('chave');
    guardado.gravar(K.api, st.api); guardado.gravar(K.chave, st.chave);
  }
  history.replaceState(null, '', location.pathname + location.search);
}

async function iniciar() {
  lerLinkMagico();
  aplicarTema(st.cfg);
  if (!st.api || !st.chave) return mostrarSetup();
  mostrarApp();
  await sincronizar(true);
}

async function sincronizar(primeira) {
  const btn = $('#btnAtualizar');
  btn.classList.add('girando');
  try {
    const j = await chamar(primeira ? 'ping' : 'resumo');
    if (j.usuario) { st.usuario = j.usuario; guardado.gravar(K.usuario, j.usuario); }
    if (j.config) { st.cfg = Object.assign({}, CFG_PADRAO, j.config); guardado.gravar(K.cfg, st.cfg); aplicarTema(st.cfg); }
    ajustarAbas();
    render();
  } catch (e) {
    render();
    toast(e.message, true);
  } finally { btn.classList.remove('girando'); }
}

function mostrarSetup(msg) {
  $('#app').hidden = true;
  $('#setup').hidden = false;
  const m = $('#setupMsg');
  m.hidden = !msg; m.textContent = msg || '';
}
function mostrarApp() {
  $('#setup').hidden = true;
  $('#app').hidden = false;
  ajustarAbas();
  render();
}
function sair(msg) {
  [K.chave, K.usuario, K.resumo].forEach(guardado.apagar);
  st.chave = null; st.usuario = null; st.resumo = null;
  mostrarSetup(msg);
}

$('#formSetup').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  st.api = String(f.get('api')).trim(); st.chave = String(f.get('chave')).trim();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Conectando…';
  try {
    const j = await chamar('ping');
    guardado.gravar(K.api, st.api); guardado.gravar(K.chave, st.chave);
    st.usuario = j.usuario; guardado.gravar(K.usuario, j.usuario);
    st.cfg = Object.assign({}, CFG_PADRAO, j.config); guardado.gravar(K.cfg, st.cfg); aplicarTema(st.cfg);
    mostrarApp();
  } catch (err) {
    mostrarSetup(err.message);
  } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
});

$('#btnAtualizar').addEventListener('click', () => sincronizar(false));
$('#abas').addEventListener('click', e => {
  const b = e.target.closest('button[data-tela]');
  if (!b) return;
  irPara(b.dataset.tela);
});
function irPara(tela) {
  if (st.tela === 'ajustes' && tela !== 'ajustes' && st.rascunhoCfg) { st.rascunhoCfg = null; aplicarTema(st.cfg); }
  if (st.tela === 'lancar' && tela !== 'lancar' && st.lancar && st.lancar.modo === 'editar') st.lancar = null;
  st.tela = tela;
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativa', b.dataset.tela === tela));
  render();
  window.scrollTo({ top: 0 });
}
function ajustarAbas() {
  const admin = ehAdmin();
  $('#abaAbater').hidden = !admin;
  $('#abas').style.setProperty('--n-abas', admin ? 4 : 3);
  if (!admin && st.tela === 'abater') st.tela = 'resumo';
}

/* ---------------- render ---------------- */
function render() {
  const cfg = st.rascunhoCfg || st.cfg;
  $('#saudacao').textContent = `${cfg.saudacao || 'Oi'} ${cfg.emoji || ''}`.trim();
  $('#atualizado').textContent = st.resumo ? `Atualizado em ${st.resumo.atualizadoEm}` : 'Carregando…';
  const tela = $('#tela');
  tela.innerHTML = ({ resumo: telaResumo, lancar: telaLancar, abater: telaAbater, ajustes: telaAjustes }[st.tela])();
  ({ resumo: ligarResumo, lancar: ligarLancar, abater: ligarAbater, ajustes: ligarAjustes }[st.tela])(tela);
}

/* ===== Tela 1: Resumo ===== */
function telaResumo() {
  const r = st.resumo;
  if (!r) return `<div class="card" style="padding:24px;text-align:center"><p class="muted">Buscando os números na planilha…</p></div>`;
  const pend = r.blocos.filter(b => b.falta > 0.004);
  const itens = pend.reduce((s, b) => s + b.qtd, 0);
  return `
    ${st.offline ? '<p class="offline">Sem conexão: mostrando os últimos números salvos.</p>' : ''}
    ${scriptDesatualizado() ? '<p class="offline">O script da planilha está desatualizado: por isso não aparece editar/apagar. Cole os arquivos novos no Apps Script e implante uma <b>Nova versão</b> (Implantar → Gerenciar implantações → ✏️).</p>' : ''}
    <section class="hero">
      <p class="hero-rotulo">Total que o pai deve</p>
      <p class="hero-valor num">${brl(r.total)}</p>
      <p class="hero-sub">${itens ? `${itens} ${itens === 1 ? 'item pendente' : 'itens pendentes'} em ${pend.length} ${pend.length === 1 ? 'bloco' : 'blocos'}` : 'Tudo pago!'}</p>
      <div class="hero-acoes"><button class="btn-hero" id="btnEnviarPai">${ICO.enviar} Enviar pro pai</button></div>
    </section>
    <h2 class="secao-titulo">O que falta</h2>
    ${r.blocos.map(b => blocoHTML(b)).join('')}`;
}
function blocoHTML(b) {
  const emDia = b.falta <= 0.004;
  const aberto = st.abertos.has(b.id) && !emDia;
  return `
    <div class="card bloco${emDia ? ' em-dia' : ''}" ${aberto ? 'open' : ''} data-id="${esc(b.id)}">
      <button class="bloco-cab" ${emDia ? 'disabled' : ''} aria-expanded="${aberto}">
        <span class="bloco-ico">${emDia ? ICO.check : icoBloco(b.grupo)}</span>
        <span class="bloco-txt"><span class="bloco-titulo">${esc(b.titulo)}</span>
          <span class="bloco-qtd">${emDia ? 'Nada pendente' : `${b.qtd} ${esc(b.unidade)}`}</span></span>
        <span class="bloco-valor num">${emDia ? 'em dia' : brl(b.falta)}</span>
        ${emDia ? '' : ICO.chev}
      </button>
      ${aberto ? `<ul class="itens">${b.itens.map((it, i) => {
        const mexe = it.diaria && podeMexer(b);
        const corpo = `<span class="item-txt"><span class="item-titulo">${esc(it.titulo)}</span>${it.sub ? `<span class="item-sub">${esc(it.sub)}</span>` : ''}</span>
          <span class="item-valor num">${brl(it.valor)}</span>${mexe ? (it.diaria.editavel ? ICO.lapis : ICO.cadeado) : ''}`;
        return mexe ? `<li><button class="item item-btn" data-bloco="${esc(b.id)}" data-i="${i}">${corpo}</button></li>` : `<li class="item">${corpo}</li>`;
      }).join('')}</ul>${b.itens.some(it => it.diaria) && podeMexer(b) ? '<p class="dica itens-dica">Toque numa diária para editar ou apagar.</p>' : ''}` : ''}
    </div>`;
}
function ligarResumo(tela) {
  tela.querySelectorAll('.bloco-cab').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.parentElement.dataset.id;
    st.abertos.has(id) ? st.abertos.delete(id) : st.abertos.add(id);
    render();
  }));
  tela.querySelectorAll('.item-btn').forEach(btn => btn.addEventListener('click', () => {
    const b = st.resumo.blocos.find(x => x.id === btn.dataset.bloco);
    abrirDiaria(b, b.itens[Number(btn.dataset.i)]);
  }));
  const env = $('#btnEnviarPai');
  if (env) env.addEventListener('click', enviarProPai);
}

/* ----- editar / apagar diária ----- */
// script antigo não manda os dados de cada diária (sem eles não dá para editar/apagar)
function scriptDesatualizado() {
  const r = st.resumo;
  if (!r || st.offline) return false;
  return r.blocos.some(b => (b.grupo === 'jose' || b.grupo === 'manu') && b.itens.length && !b.itens.some(it => it.diaria));
}
const pessoaDoBloco = b => b.grupo === 'jose' ? 'José' : b.grupo === 'manu' ? 'Manu' : null;
const podeMexer = b => !!pessoaDoBloco(b) && (ehAdmin() || pessoaDoBloco(b) === st.usuario.pessoa);
const RE_REEMBOLSO = /\s*\|?\s*Reembolso R\$\s*([\d.,]+)/i;

async function abrirDiaria(b, it) {
  const d = it.diaria, pessoa = pessoaDoBloco(b);
  if (!d.editavel) {
    await dialogo(`<h2>${esc(it.titulo)}</h2><p>Essa diária já recebeu parte do pagamento, então fica travada no app para não bagunçar o que já foi recebido.</p><p class="dica">Se precisar mesmo mudar, ajuste pela planilha.</p>`,
      [{ texto: 'Entendi', classe: 'primario', valor: null }]);
    return;
  }
  const acao = await dialogo(`<h2>${esc(it.titulo)}</h2><p>Diária de ${esc(pessoa)} · <b class="num">${brl(d.valor)}</b>${d.obs ? `<br><span class="dica">${esc(d.obs)}</span>` : ''}</p>`,
    [{ texto: 'Apagar', classe: 'perigo', valor: 'apagar' }, { texto: 'Editar', classe: 'primario', valor: 'editar' }, { texto: 'Cancelar', classe: 'secundario so-texto', valor: null }]);
  if (acao === 'editar') {
    const m = String(d.obs || '').match(RE_REEMBOLSO);
    const reemb = m ? lerValor(m[1]) || 0 : 0;
    st.lancar = {
      modo: 'editar', pessoa, linha: d.linha, original: { data: d.data, valor: d.valor, obs: d.obs }, titulo: it.titulo,
      data: d.data, valor: num2(d.valor - reemb), reembolso: reemb ? num2(reemb) : '', obs: String(d.obs || '').replace(RE_REEMBOLSO, '').trim(),
      mostrarReembolso: reemb > 0, enviando: false
    };
    irPara('lancar');
  } else if (acao === 'apagar') {
    const ok = await dialogo(`<h2>Apagar diária?</h2><p>A diária de ${esc(pessoa)} em <b>${esc(it.titulo)}</b> (<b class="num">${brl(d.valor)}</b>) sai da planilha.</p>`,
      [{ texto: 'Cancelar', valor: false }, { texto: 'Apagar', classe: 'perigo-cheio', valor: true }]);
    if (!ok) return;
    toast('Apagando…');
    try {
      const j = await chamar('apagar', { pessoa, linha: d.linha, original: { data: d.data, valor: d.valor, obs: d.obs }, idEnvio: novoId() });
      vibrar(30); render();
      toast(`Diária de ${j.dataTxt} apagada`);
    } catch (e) { erroDeDiaria(e); }
  }
}
function erroDeDiaria(e) {
  toast(e.message, true);
  if (/mudou na planilha|já recebeu pagamento/.test(e.message)) { st.lancar = null; sincronizar(false); }
}

/* ===== Tela 2: Lançar diária ===== */
function telaLancar() {
  const cfg = st.cfg;
  if (!st.lancar) st.lancar = { pessoa: ehAdmin() ? cfg.pessoaPadrao : st.usuario.pessoa, data: hojeISO(), valor: num2(cfg.valorDiaria), reembolso: '', obs: '', mostrarReembolso: false, enviando: false };
  const L = st.lancar;
  const editando = L.modo === 'editar';
  const total = (lerValor(L.valor) || 0) + (lerValor(L.reembolso) || 0);
  return `
    ${editando ? `<div class="editando"><span>Editando a diária de <b>${esc(L.pessoa)}</b><br><span class="dica">${esc(L.titulo)}</span></span>
      <button type="button" class="chip" id="btnCancelarEdicao">Cancelar</button></div>` : ''}
    <form id="formLancar" class="form" autocomplete="off">
      ${editando ? '' : ehAdmin() ? `<div class="campo">De quem é a diária
        <div class="segmento" id="segPessoa">${['José', 'Manu'].map(p => `<button type="button" data-p="${p}" class="${L.pessoa === p ? 'sel' : ''}">${p}</button>`).join('')}</div></div>`
        : `<p class="dica">Diária de <b>${esc(st.usuario.pessoa)}</b></p>`}
      <label>Data
        <input type="date" name="data" value="${L.data}" max="${hojeISO(60)}" required>
        <div class="chips">
          <button type="button" class="chip ${L.data === hojeISO() ? 'sel' : ''}" data-dia="0">Hoje</button>
          <button type="button" class="chip ${L.data === hojeISO(-1) ? 'sel' : ''}" data-dia="-1">Ontem</button>
          <button type="button" class="chip ${L.data === hojeISO(-2) ? 'sel' : ''}" data-dia="-2">Anteontem</button>
        </div>
      </label>
      <label>Valor da diária
        <div class="input-moeda"><span>R$</span><input name="valor" inputmode="decimal" value="${esc(L.valor)}" required></div>
      </label>
      ${L.mostrarReembolso ? `
        <label>Reembolso (almoço, gasolina…)
          <div class="input-moeda"><span>R$</span><input name="reembolso" inputmode="decimal" value="${esc(L.reembolso)}" placeholder="0,00"></div>
          <p class="dica">Entra no valor do dia, mas fica anotado como reembolso na observação, separado da diária.</p>
        </label>` : `<button type="button" class="chip" id="btnReembolso" style="justify-self:start">+ Teve reembolso</button>`}
      <label>Observação <span class="dica" style="display:inline">(opcional)</span>
        <textarea name="obs" rows="2" placeholder="Ex.: trabalhou até as 20h">${esc(L.obs)}</textarea>
      </label>
      <div class="resumo-lanc"><span>${esc(L.pessoa)} · ${dataBonita(L.data)}</span><b class="num">${brl(total)}</b></div>
      <button class="btn primario" type="submit" ${L.enviando ? 'disabled' : ''}>${L.enviando ? '<span class="spin"></span> Gravando…' : editando ? 'Salvar alterações' : 'Lançar diária'}</button>
    </form>`;
}
function ligarLancar(tela) {
  const L = st.lancar;
  const f = $('#formLancar', tela);
  const atualizarTotal = () => {
    const total = (lerValor(L.valor) || 0) + (lerValor(L.reembolso) || 0);
    $('.resumo-lanc', tela).innerHTML = `<span>${esc(L.pessoa)} · ${dataBonita(L.data)}</span><b class="num">${brl(total)}</b>`;
  };
  f.addEventListener('input', e => {
    const n = e.target.name;
    if (n in L) L[n] = e.target.value;
    if (n === 'data') { render(); return; }
    atualizarTotal();
  });
  f.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { L.data = hojeISO(Number(b.dataset.dia)); render(); }));
  f.querySelectorAll('#segPessoa button').forEach(b => b.addEventListener('click', () => { L.pessoa = b.dataset.p; render(); }));
  const br = $('#btnReembolso', tela);
  if (br) br.addEventListener('click', () => { L.mostrarReembolso = true; render(); $('input[name="reembolso"]').focus(); });
  f.querySelectorAll('.input-moeda input').forEach(inp => inp.addEventListener('blur', () => {
    const v = lerValor(inp.value);
    if (v > 0) { inp.value = num2(v); L[inp.name] = inp.value; }
  }));
  f.addEventListener('submit', e => { e.preventDefault(); enviarLancamento(false); });
  const canc = $('#btnCancelarEdicao', tela);
  if (canc) canc.addEventListener('click', () => { st.lancar = null; irPara('resumo'); });
}
async function enviarLancamento(confirmarDuplicado) {
  const L = st.lancar;
  if (L.enviando) return;
  const valor = lerValor(L.valor), reembolso = lerValor(L.reembolso) || 0;
  if (!(valor > 0)) return toast('Informe o valor da diária.', true);
  if (isNaN(reembolso) || reembolso < 0) return toast('Reembolso inválido.', true);
  L.enviando = true; render();
  try {
    const editando = L.modo === 'editar';
    const j = editando
      ? await chamar('editar', { pessoa: L.pessoa, linha: L.linha, original: L.original, novo: { data: L.data, valor, reembolso, obs: L.obs }, confirmarDuplicado, idEnvio: novoId() })
      : await chamar('lancar', { pessoa: L.pessoa, data: L.data, valor, reembolso, obs: L.obs, confirmarDuplicado, idEnvio: novoId() });
    L.enviando = false;
    if (j.duplicado) {
      render();
      const lista = j.existentes.map(x => `<li><b class="num">${brl(x.valor)}</b>${x.obs ? ` · ${esc(x.obs)}` : ''}</li>`).join('');
      const ok = await dialogo(`<h2>Já tem diária nesse dia</h2><p>${esc(L.pessoa)} já tem lançamento em <b>${esc(j.dataTxt)}</b>:</p><ul style="margin:0;padding-left:20px">${lista}</ul><p>Lançar outra mesmo assim?</p>`,
        [{ texto: 'Cancelar', valor: false }, { texto: 'Lançar', classe: 'primario', valor: true }]);
      if (ok) return enviarLancamento(true);
      return;
    }
    vibrar(30);
    st.lancar = null;
    if (editando) { toast(`Diária de ${j.dataTxt} atualizada`); irPara('resumo'); }
    else { toast(`Diária de ${brl(j.valor)} lançada em ${j.dataTxt}`); render(); }
  } catch (e) {
    L.enviando = false; render();
    erroDeDiaria(e);
  }
}

/* ===== Tela 3: Abater pagamento ===== */
const ALVOS = [
  { id: 'jose', nome: 'Diárias José' },
  { id: 'manu', nome: 'Diárias Manu' },
  { id: 'cartoes', nome: 'Cartões' },
  { id: 'carro', nome: 'Carro' }
];
function faltaAlvo(id, cartao) {
  const a = st.resumo && st.resumo.alvos;
  if (!a) return 0;
  if (id === 'cartoes') {
    if (cartao) return a.cartoes.vencido[cartao] || 0;
    return Object.values(a.cartoes.vencido).reduce((s, v) => s + v, 0);
  }
  return a[id] || 0;
}
function telaAbater() {
  const A = st.abater;
  if (A.feito) return telaAbatido(A.feito);
  const a = st.resumo && st.resumo.alvos;
  let html = `<h2 class="secao-titulo" style="margin-top:6px">O que o pai pagou?</h2>
    <div class="alvos">${ALVOS.map(x => `
      <button class="alvo ${A.alvo === x.id ? 'sel' : ''}" data-alvo="${x.id}">
        <span class="alvo-nome">${x.nome}</span>
        <span class="alvo-falta num">${a ? (faltaAlvo(x.id) > 0.004 ? 'falta ' + brl(faltaAlvo(x.id)) : 'em dia') : '…'}</span>
      </button>`).join('')}</div>`;
  if (!A.alvo) return html;

  if (A.alvo === 'cartoes') {
    html += `<h2 class="secao-titulo">Qual cartão?</h2>
      <div class="segmento" id="segCartao">${['José', 'Manu'].map(c => `<button type="button" data-c="${c}" class="${A.cartao === c ? 'sel' : ''}">${c}</button>`).join('')}</div>`;
    if (A.cartao && a) {
      const venc = a.cartoes.vencido[A.cartao] || 0, tot = a.cartoes.total[A.cartao] || 0;
      html += `<p class="dica" style="margin:8px 4px 0">Vencido: <b class="num">${brl(venc)}</b>${tot - venc > 0.004 ? ` · + ${brl(tot - venc)} em parcelas futuras` : ''}. Se passar do que falta neste cartão, o resto vai para o outro.</p>`;
    }
    if (!A.cartao) return html;
  }

  const falta = faltaAlvo(A.alvo, A.cartao);
  html += `<h2 class="secao-titulo">Quanto?</h2>
    <form id="formAbater" class="form" autocomplete="off">
      <div class="input-moeda"><span>R$</span><input name="valor" inputmode="decimal" placeholder="0,00" value="${esc(A.valor)}" ${A.previa ? '' : 'autofocus'}></div>
      ${falta > 0.004 ? `<div class="chips"><button type="button" class="chip" id="btnTudo">Tudo (${brl(falta)})</button></div>` : ''}
      ${A.previa ? '' : `<button class="btn primario" type="submit" id="btnPrevia">Ver prévia</button>`}
    </form>`;
  if (A.previa) html += previaHTML(A.previa);
  return html;
}
function previaHTML(r) {
  return `<section class="card previa">
    <h3>Prévia · ${esc(r.alvo)}</h3>
    <p class="dica">Recebido: <b class="num">${brl(r.recebido)}</b>. Nada foi gravado ainda.</p>
    ${r.itens.map(it => `<div class="linha-previa">
      <span class="item-txt"><span class="item-titulo">${esc(it.titulo)}</span>${it.sub ? `<span class="item-sub">${esc(it.sub)}</span>` : ''}</span>
      ${it.quitou ? '<span class="tag ok">quita</span>' : `<span class="tag parcial">falta ${brl(it.restante)}</span>`}
      <span class="item-valor num">${brl(it.pago)}</span></div>`).join('')}
    <div class="antes-depois"><span>Falta antes<br><span class="num">${brl(r.faltaAntes)}</span></span><span aria-hidden="true">→</span><span style="text-align:right">Fica faltando<br><span class="num">${brl(r.faltaDepois)}</span></span></div>
    ${r.lancamentos && r.lancamentos.length > 1 ? `<p class="aviso">O valor passa do que falta no cartão: vai dividido em ${r.lancamentos.map(l => `${esc(l.cartao)} ${brl(l.valor)}`).join(' + ')}.</p>` : ''}
    ${r.sobrou > 0.004 ? `<p class="aviso">Sobram ${brl(r.sobrou)}: não há mais nada pendente aqui${r.lancamentos ? ' (fica como crédito)' : ' (o valor inteiro entra no Total Recebido)'}.</p>` : ''}
    ${r.avisos.map(a => `<p class="aviso">${esc(a)}</p>`).join('')}
    <div class="dlg-acoes" style="margin-top:14px">
      <button class="btn secundario" id="btnRefazer">Alterar</button>
      <button class="btn primario" id="btnConfirmar">Confirmar</button>
    </div>
  </section>`;
}
function telaAbatido(f) {
  const r = f.resultado;
  return `<section class="card sucesso">
    <div class="sucesso-ico">${ICO.check}</div>
    <h2 style="margin:0 0 4px">Pagamento abatido</h2>
    <p class="muted" style="margin:0">${esc(r.alvo)} · recebido <b class="num">${brl(r.recebido)}</b></p>
    <div class="antes-depois" style="margin:16px 0"><span>Abatido<br><span class="num">${brl(r.abatido)}</span></span><span style="text-align:right">Falta agora<br><span class="num">${brl(r.faltaDepois)}</span></span></div>
    ${f.repetido ? '<p class="dica">Esse envio já tinha sido gravado. Não foi lançado de novo.</p>' : ''}
    <p class="dica">A aba RESUMO da planilha já foi atualizada.</p>
    <div style="display:grid;gap:10px;margin-top:16px">
      <button class="btn primario" id="btnEnviarPai2">${ICO.enviar} Enviar resumo pro pai</button>
      <button class="btn secundario" id="btnNovo">Novo abatimento</button>
    </div>
  </section>`;
}
function ligarAbater(tela) {
  const A = st.abater;
  const limparPrevia = () => { A.previa = null; A.idEnvio = null; };
  tela.querySelectorAll('[data-alvo]').forEach(b => b.addEventListener('click', () => {
    if (A.alvo !== b.dataset.alvo) { A.alvo = b.dataset.alvo; A.cartao = null; A.valor = ''; limparPrevia(); }
    render();
  }));
  tela.querySelectorAll('#segCartao button').forEach(b => b.addEventListener('click', () => { A.cartao = b.dataset.c; limparPrevia(); render(); }));
  const f = $('#formAbater', tela);
  if (f) {
    const inp = f.querySelector('input');
    inp.addEventListener('input', () => {
      A.valor = inp.value;
      if (A.previa) { limparPrevia(); render(); const i = $('#formAbater input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); pedirPrevia(); });
    const tudo = $('#btnTudo', tela);
    if (tudo) tudo.addEventListener('click', () => { A.valor = num2(faltaAlvo(A.alvo, A.cartao)); limparPrevia(); pedirPrevia(); });
  }
  const conf = $('#btnConfirmar', tela);
  if (conf) conf.addEventListener('click', () => confirmarAbatimento(conf));
  const ref = $('#btnRefazer', tela);
  if (ref) ref.addEventListener('click', () => { limparPrevia(); render(); });
  const novo = $('#btnNovo', tela);
  if (novo) novo.addEventListener('click', () => { st.abater = { alvo: null, cartao: null, valor: '', previa: null, idEnvio: null, feito: null }; render(); });
  const env = $('#btnEnviarPai2', tela);
  if (env) env.addEventListener('click', enviarProPai);
}
async function pedirPrevia() {
  const A = st.abater;
  const valor = lerValor(A.valor);
  if (!(valor > 0)) return toast('Informe o valor recebido.', true);
  const btn = $('#btnPrevia');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Calculando…'; }
  try {
    const j = await chamar('abater', { alvo: A.alvo, cartao: A.cartao, valor, previa: true });
    A.previa = j.resultado;
    A.idEnvio = novoId();   // o mesmo id vale para todos os toques em "Confirmar" desta prévia
    render();
    $('.previa').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    render();
    toast(e.message, true);
  }
}
async function confirmarAbatimento(btn) {
  const A = st.abater;
  if (btn.disabled) return;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Gravando…';
  $('#btnRefazer').disabled = true;
  try {
    const j = await chamar('abater', { alvo: A.alvo, cartao: A.cartao, valor: A.previa.recebido, idEnvio: A.idEnvio });
    vibrar(30);
    A.feito = { resultado: j.resultado, repetido: !!j.repetido };
    render();
    toast('Pagamento abatido!');
  } catch (e) {
    // mantém o mesmo idEnvio: tentar de novo nunca grava duas vezes
    btn.disabled = false; btn.textContent = 'Tentar de novo';
    $('#btnRefazer').disabled = false;
    toast(e.message, true);
  }
}

/* ===== Tela 4: Do meu jeito ===== */
function telaAjustes() {
  if (!st.rascunhoCfg) st.rascunhoCfg = Object.assign({}, st.cfg);
  const c = st.rascunhoCfg;
  const seg = (campo, opcoes) => `<div class="segmento" data-campo="${campo}">${opcoes.map(([v, t]) => `<button type="button" data-v="${v}" class="${c[campo] === v ? 'sel' : ''}">${t}</button>`).join('')}</div>`;
  const custom = !CORES.includes(c.cor);
  return `
    <section class="hero" style="margin-bottom:6px">
      <p class="hero-rotulo">Prévia</p>
      <p class="hero-valor num">${brl(st.resumo ? st.resumo.total : 1234.56)}</p>
      <p class="hero-sub">${esc(c.saudacao)} ${esc(c.emoji)}</p>
    </section>
    <form class="form" id="formCfg" autocomplete="off">
      <h2 class="secao-titulo">Cor principal</h2>
      <div class="cores">${CORES.map(cor => `<button type="button" class="cor ${c.cor === cor ? 'sel' : ''}" style="background:${cor}" data-cor="${cor}" aria-label="Cor ${cor}"></button>`).join('')}
        <label class="cor cor-custom ${custom ? 'sel' : ''}" aria-label="Escolher outra cor"><input type="color" name="corCustom" value="${c.cor}"></label></div>
      <h2 class="secao-titulo">Tema</h2>
      ${seg('tema', [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']])}
      <h2 class="secao-titulo">Letra dos números</h2>
      ${seg('fonte', [['padrao', 'Moderna'], ['arredondada', 'Redondinha'], ['serifada', 'Elegante']])}
      <h2 class="secao-titulo">Cantos</h2>
      ${seg('cantos', [['reto', 'Retos'], ['suave', 'Suaves'], ['redondo', 'Redondos']])}
      <h2 class="secao-titulo">Saudação</h2>
      <div class="linha-ajuste">
        <input name="saudacao" maxlength="40" value="${esc(c.saudacao)}" aria-label="Saudação">
        <input name="emoji" maxlength="8" value="${esc(c.emoji)}" aria-label="Emoji" style="text-align:center;font-size:22px">
      </div>
      <h2 class="secao-titulo">Lançamento</h2>
      <label>Valor padrão da diária
        <div class="input-moeda"><span>R$</span><input name="valorDiaria" inputmode="decimal" value="${num2(c.valorDiaria)}"></div>
      </label>
      ${ehAdmin() ? `<div class="campo">Pessoa que já vem marcada ${seg('pessoaPadrao', [['José', 'José'], ['Manu', 'Manu']])}</div>` : ''}
      <button class="btn primario" type="submit" id="btnSalvarCfg">Salvar do meu jeito</button>
    </form>
    <h2 class="secao-titulo">Conta</h2>
    <section class="card conta">
      <p style="margin:0">Conectada como <b>${esc(st.usuario ? st.usuario.nome : '…')}</b>${st.usuario ? ` · ${st.usuario.papel === 'admin' ? 'acesso total' : 'lança diárias de ' + esc(st.usuario.pessoa)}` : ''}</p>
      ${st.instalar ? '<button class="btn secundario" id="btnInstalar">Instalar na tela inicial</button>' : ''}
      <button class="btn perigo" id="btnSair">Sair deste celular</button>
    </section>
    <p class="dica" style="text-align:center;margin-top:18px">Suas preferências ficam salvas na planilha: valem em qualquer celular em que você entrar.</p>
    <p class="dica" style="text-align:center">App versão ${APP_VERSAO} · script da planilha ${st.resumo && st.resumo.versaoScript ? 'versão ' + st.resumo.versaoScript : scriptDesatualizado() ? 'desatualizado' : 'versão 2'}</p>`;
}
function ligarAjustes(tela) {
  const c = st.rascunhoCfg;
  const preview = () => { aplicarTema(c); const h = $('.hero', tela); h.querySelector('.hero-sub').textContent = `${c.saudacao} ${c.emoji}`; $('#saudacao').textContent = `${c.saudacao} ${c.emoji}`.trim(); };
  tela.querySelectorAll('[data-cor]').forEach(b => b.addEventListener('click', () => { c.cor = b.dataset.cor; aplicarTema(c); render(); }));
  const cc = tela.querySelector('input[name="corCustom"]');
  cc.addEventListener('input', () => { c.cor = cc.value; aplicarTema(c); });
  cc.addEventListener('change', () => render());
  tela.querySelectorAll('.segmento[data-campo] button').forEach(b => b.addEventListener('click', () => {
    c[b.parentElement.dataset.campo] = b.dataset.v; aplicarTema(c); render();
  }));
  ['saudacao', 'emoji'].forEach(n => tela.querySelector(`input[name="${n}"]`).addEventListener('input', e => { c[n] = e.target.value; preview(); }));
  tela.querySelector('input[name="valorDiaria"]').addEventListener('input', e => { c.valorDiaria = lerValor(e.target.value); });
  $('#formCfg', tela).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#btnSalvarCfg');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      const j = await chamar('salvarConfig', { config: c });
      st.cfg = Object.assign({}, CFG_PADRAO, j.config); guardado.gravar(K.cfg, st.cfg);
      st.rascunhoCfg = null; st.lancar = null;
      aplicarTema(st.cfg); render();
      vibrar(20); toast('Salvo! O app agora está do seu jeito.');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Salvar do meu jeito';
      toast(err.message, true);
    }
  });
  const ins = $('#btnInstalar', tela);
  if (ins) ins.addEventListener('click', async () => { st.instalar.prompt(); await st.instalar.userChoice; st.instalar = null; render(); });
  $('#btnSair', tela).addEventListener('click', async () => {
    const ok = await dialogo('<h2>Sair deste celular?</h2><p>Para entrar de novo, você vai precisar do link de acesso.</p>', [{ texto: 'Cancelar', valor: false }, { texto: 'Sair', classe: 'primario', valor: true }]);
    if (ok) { st.rascunhoCfg = null; sair(); }
  });
}

/* ---------------- Enviar pro pai (imagem do resumo) ---------------- */
async function enviarProPai() {
  if (!st.resumo) return;
  try { await document.fonts.ready; } catch (e) {}
  const blob = await desenharResumo(st.resumo);
  const url = URL.createObjectURL(blob);
  const nome = `resumo-${hojeISO()}.png`;
  const arquivo = new File([blob], nome, { type: 'image/png' });
  const podeCompartilhar = navigator.canShare && navigator.canShare({ files: [arquivo] });
  const acao = await dialogo(`<h2>Resumo pro pai</h2><img src="${url}" alt="Imagem do resumo">`,
    [{ texto: 'Fechar', valor: null }, { texto: podeCompartilhar ? 'Compartilhar' : 'Baixar imagem', classe: 'primario', valor: 'ok' }]);
  if (acao === 'ok') {
    if (podeCompartilhar) {
      try { await navigator.share({ files: [arquivo], title: 'Resumo', text: `Total: ${brl(st.resumo.total)}` }); }
      catch (e) { if (e.name !== 'AbortError') toast('Não consegui abrir o compartilhar.', true); }
    } else {
      const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function desenharResumo(r) {
  const W = 1080, P = 64;
  const css = getComputedStyle(document.documentElement);
  const accent = st.cfg.cor, onAccent = css.getPropertyValue('--on-accent').trim() || '#fff';
  const fNum = css.getPropertyValue('--font-num').trim(), fTxt = css.getPropertyValue('--font').trim();
  const blocos = r.blocos.filter(b => b.falta > 0.004);
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');

  // 1ª passada mede a altura; 2ª desenha
  const desenhar = (real) => {
    let y = P;
    const txt = (s, x, yy, font, cor, alinhar = 'left', maxW) => {
      if (!real) return;
      ctx.font = font; ctx.fillStyle = cor; ctx.textAlign = alinhar; ctx.textBaseline = 'alphabetic';
      let t = String(s);
      if (maxW) { while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…'; }
      ctx.fillText(t, x, yy);
    };
    if (real) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, cv.height); }
    txt('Diárias e despesas: a pagar', P, y + 44, `800 44px ${fTxt}`, '#17151f');
    txt(`Atualizado em ${r.atualizadoEm}`, P, y + 90, `500 28px ${fTxt}`, '#6b6878');
    y += 130;
    // total
    if (real) {
      const g = ctx.createLinearGradient(P, y, W - P, y + 200);
      g.addColorStop(0, accent); g.addColorStop(1, shade(accent, -0.25));
      ctx.fillStyle = g; roundRect(ctx, P, y, W - 2 * P, 190, 36); ctx.fill();
    }
    txt('Total', P + 40, y + 62, `600 32px ${fTxt}`, onAccent);
    txt(brl(r.total), P + 40, y + 150, `800 84px ${fNum}`, onAccent);
    y += 230;
    if (!blocos.length) { txt('Tudo pago! ✅', P, y + 40, `700 36px ${fTxt}`, '#138a4a'); y += 80; }
    blocos.forEach(b => {
      txt(b.titulo, P, y + 40, `800 36px ${fTxt}`, '#17151f', 'left', 640);
      txt(brl(b.falta), W - P, y + 40, `800 36px ${fNum}`, shade(accent, -0.25), 'right');
      txt(`${b.qtd} ${b.unidade}`, P, y + 80, `500 26px ${fTxt}`, '#6b6878');
      y += 104;
      b.itens.forEach(it => {
        txt(it.titulo, P + 24, y + 30, `600 28px ${fTxt}`, '#2a2735', 'left', 700);
        txt(brl(it.valor), W - P, y + 30, `600 28px ${fNum}`, '#2a2735', 'right');
        y += 44;
        if (it.sub) { txt(it.sub, P + 24, y + 22, `400 24px ${fTxt}`, '#8a8697', 'left', W - 2 * P - 24); y += 36; }
        y += 8;
      });
      if (real) { ctx.fillStyle = '#e4e1ec'; ctx.fillRect(P, y + 10, W - 2 * P, 2); }
      y += 40;
    });
    return y + P - 20;
  };
  const H = desenhar(false);
  cv.width = W; cv.height = H;
  desenhar(true);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex, f) {
  const v = hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16));
  const o = v.map(c => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f));
  return '#' + o.map(c => c.toString(16).padStart(2, '0')).join('');
}

/* ---------------- instalação / offline ---------------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); st.instalar = e; if (st.tela === 'ajustes') render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // quando chega versão nova do app, recarrega uma vez sozinho
  const tinhaControle = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregou) return;
    recarregou = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    })
    .catch(() => {});
}

iniciar();
