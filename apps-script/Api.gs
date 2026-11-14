/**********************************************************************
 * API DO APP DO CELULAR
 *
 * O app (PWA) conversa com este script por POST, em JSON:
 *   { token, acao, ...dados }
 * Ações: ping, resumo, abater, lancar, salvarConfig.
 *
 * As regras de negócio NÃO ficam aqui: o app chama as mesmas funções do menu
 * (abaterDiariasCore_, abaterExtraCore_, lerDias_, lerExtra_, gerarResumo_).
 *
 * Publicar: Implantar → Nova implantação → App da Web
 *   Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 * O acesso é controlado pela chave de cada pessoa (menu Freelancers → App do celular).
 **********************************************************************/

const APP_PROP_USUARIOS = 'APP_USUARIOS';   // { chave: { nome, papel, pessoa } }
const APP_PROP_URL_PWA = 'APP_URL_PWA';      // endereço do app (GitHub Pages)
const APP_PROP_URL_API = 'APP_URL_API';      // URL do App da Web (termina em /exec)
const APP_PROP_CFG = 'APP_CFG_';             // + nome → preferências visuais da pessoa
const APP_VALOR_DIARIA = 170;

const ALVOS_ABATER = {
  jose:    { tipo: 'diarias', cfg: () => DIARIAS[0] },
  manu:    { tipo: 'diarias', cfg: () => DIARIAS[1] },
  cartoes: { tipo: 'extra',   cfg: () => ABAS_EXTRAS[0] },
  carro:   { tipo: 'extra',   cfg: () => ABAS_EXTRAS[1] }
};

/* ---------------- entrada ---------------- */

function doGet() {
  return json_({ ok: true, app: 'diarias', mensagem: 'A API está no ar. Abra o app para usar.' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, erro: 'Pedido inválido.' });
  }
  try {
    const u = usuarioDaChave_(req.token);
    if (!u) return json_({ ok: false, codigo: 'auth', erro: 'Chave de acesso inválida ou revogada.' });
    return json_(Object.assign({ ok: true }, rotear_(u, req)));
  } catch (err) {
    return json_({ ok: false, erro: (err && err.message) || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rotear_(u, req) {
  switch (req.acao) {
    case 'ping':
      return { usuario: publico_(u), config: lerConfig_(u), resumo: dadosResumo_() };

    case 'resumo':
      return { resumo: dadosResumo_() };

    case 'abater': {
      if (u.papel !== 'admin') throw new Error('Seu acesso não permite abater pagamentos.');
      const alvo = ALVOS_ABATER[req.alvo];
      if (!alvo) throw new Error('Escolha o que abater.');
      const valor = sanitizeToNumber_(req.valor);
      const executar = (previa) => alvo.tipo === 'diarias'
        ? abaterDiariasCore_(alvo.cfg(), valor, { previa, autor: u.nome })
        : abaterExtraCore_(alvo.cfg(), valor, req.cartao, { previa, autor: u.nome });

      if (req.previa) return { resultado: executar(true) };
      return comGravacao_(req.idEnvio, () => {
        const r = executar(false);
        return { gravado: true, resultado: r };
      });
    }

    case 'lancar': {
      const cfg = DIARIAS.find(d => d.pessoa === req.pessoa);
      if (!cfg) throw new Error('Escolha de quem é a diária.');
      if (u.papel !== 'admin' && u.pessoa !== cfg.pessoa) {
        throw new Error(`Seu acesso só permite lançar diárias de ${u.pessoa}.`);
      }
      return comGravacao_(req.idEnvio, () => lancarDiariaCore_(cfg, req, u.nome));
    }

    case 'salvarConfig':
      return { config: salvarConfig_(u, req.config || {}) };

    default:
      throw new Error('Ação desconhecida.');
  }
}

/**
 * Gravação segura: uma de cada vez (LockService) e cada envio só uma vez (idEnvio).
 * Se o celular mandar o mesmo envio de novo (toque duplo, rede instável),
 * devolve o resultado do primeiro sem gravar outra vez.
 */
function comGravacao_(idEnvio, fn) {
  if (!idEnvio || String(idEnvio).length < 8) throw new Error('Envio sem identificador. Atualize o app.');
  return comTrava_(() => {
    const cache = CacheService.getScriptCache();
    const chave = 'envio_' + idEnvio;
    const ja = cache.get(chave);
    if (ja) {
      const r = JSON.parse(ja);
      r.repetido = true;
      r.resumo = dadosResumo_();
      return r;
    }
    const r = fn();
    if (r && r.gravado) {
      try { cache.put(chave, JSON.stringify(r), 21600); }               // 6 horas
      catch (e) { cache.put(chave, JSON.stringify({ gravado: true }), 21600); }
    }
    r.resumo = dadosResumo_();
    return r;
  });
}

/* ---------------- lançar diária ---------------- */

/**
 * Insere o dia NA POSIÇÃO DA DATA, sempre dentro do intervalo da soma do rodapé
 * (=SUM(B2:Bn) cresce sozinho porque a linha entra no meio do intervalo).
 * Grava data de verdade em A, número em B (sem fórmula) e a observação em C.
 * Se já existir diária na data, devolve { duplicado: true } sem gravar,
 * a menos que req.confirmarDuplicado seja true.
 */
function lancarDiariaCore_(cfg, req, autor) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(cfg.aba);
  if (!sh) throw new Error(`Não encontrei a aba "${cfg.aba}".`);

  const m = String(req.data || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Data inválida.');
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  const valor = round2_(sanitizeToNumber_(req.valor));
  const reembolso = round2_(sanitizeToNumber_(req.reembolso) || 0);
  if (!(valor > 0)) throw new Error('Informe o valor da diária.');
  if (reembolso < 0) throw new Error('Reembolso inválido.');
  const total = round2_(valor + reembolso);

  let obs = String(req.obs || '').trim().slice(0, 300);
  if (reembolso > 0.004) {
    const tag = `Reembolso R$ ${formatMoney_(reembolso)}`;
    obs = obs ? `${obs} | ${tag}` : tag;
  }

  // onde está cada dia
  const lastRow = sh.getLastRow();
  const n = Math.max(0, lastRow - FIRST_ROW + 1);
  const dias = n ? sh.getRange(FIRST_ROW, COL_DIAS, n, 1).getValues() : [];
  const chave = Utilities.formatDate(data, tz, 'yyyy-MM-dd');
  let ultima = FIRST_ROW - 1;   // última linha com dia
  let pos = null;               // primeira linha com data DEPOIS da nova
  const mesmoDia = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i][0];
    if (!d) break;
    const linha = FIRST_ROW + i;
    ultima = linha;
    if (d instanceof Date) {
      const k = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      if (k === chave) mesmoDia.push(linha);
      if (pos === null && k > chave) pos = linha;
    }
  }

  if (mesmoDia.length && !req.confirmarDuplicado) {
    return {
      gravado: false,
      duplicado: true,
      dataTxt: formatDataBR_(data, tz),
      existentes: mesmoDia.map(l => ({
        valor: round2_(sanitizeToNumber_(sh.getRange(l, COL_JOSE).getValue())),
        obs: String(sh.getRange(l, COL_OBS).getValue() || '')
      }))
    };
  }

  let alvo, ref;
  if (ultima < FIRST_ROW) {
    // aba sem nenhum dia: usa a primeira linha (só se estiver vazia mesmo)
    if (sh.getRange(FIRST_ROW, COL_JOSE).getFormula() || sh.getRange(FIRST_ROW, COL_JOSE).getValue() !== '') {
      throw new Error(`A aba "${cfg.aba}" não tem nenhum dia e a linha ${FIRST_ROW} não está livre. Lance o primeiro dia pela planilha.`);
    }
    alvo = FIRST_ROW;
    ref = null;
  } else if (pos !== null) {
    // entra no meio: abre uma linha antes do primeiro dia mais novo
    sh.insertRowBefore(pos);
    alvo = pos;
    ref = pos + 1;
  } else {
    // entra no fim: abre a linha ANTES do último dia (garante que fica dentro da soma)
    // e desce o último dia para a linha nova; o dia novo fica logo abaixo dele.
    const notasUltimo = sh.getRange(ultima, 1, 1, COL_OBS).getNotes();
    sh.insertRowBefore(ultima);
    sh.getRange(ultima + 1, 1, 1, sh.getMaxColumns()).moveTo(sh.getRange(ultima, 1));
    sh.getRange(ultima, 1, 1, COL_OBS).setNotes(notasUltimo);   // garante que as notinhas foram junto
    alvo = ultima + 1;
    ref = ultima;
  }

  const linhaNova = sh.getRange(alvo, 1, 1, COL_OBS);
  if (ref) sh.getRange(ref, 1, 1, COL_OBS).copyFormatToRange(sh, 1, COL_OBS, alvo, alvo);
  linhaNova.clearNote();
  linhaNova.setValues([[data, total, obs]]);
  sh.getRange(alvo, COL_JOSE).setFontColor('#000000');   // nunca nasce "verde" (pago)
  addNote_(sh.getRange(alvo, COL_JOSE), `Lançado pelo app em ${formatDate_()} — ${autor}.`);
  SpreadsheetApp.flush();

  gerarResumo_();

  const itens = lerDias_(sh, tz, cfg.pessoa);
  return {
    gravado: true,
    pessoa: cfg.pessoa,
    linha: alvo,
    dataTxt: formatDataBR_(data, tz),
    valor: total,
    totalLancado: round2_(itens.reduce((s, it) => s + it.valor, 0)),
    falta: round2_(itens.reduce((s, it) => s + it.restante, 0))
  };
}

/* ---------------- resumo para o app ---------------- */

// Mesma lógica do RESUMO, mas em dados (o app não lê a aba RESUMO).
function dadosResumo_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const blocos = [];

  // José: um bloco por mês
  const pendJose = lerDias_(getSheet_(), tz, DIARIAS[0].pessoa).filter(it => it.restante > 0.004);
  const meses = new Map();
  pendJose.forEach(it => {
    if (!meses.has(it.mes)) meses.set(it.mes, { mesTxt: it.mesTxt, itens: [] });
    meses.get(it.mes).itens.push(it);
  });
  Array.from(meses.keys()).sort().forEach(k => {
    const g = meses.get(k);
    blocos.push(blocoDias_('jose-' + k, `José · ${g.mesTxt.slice(0, 3)}/${k.slice(0, 4)}`, 'jose', g.itens));
  });

  // Cartões e Carro
  ABAS_EXTRAS.forEach((cfg, i) => {
    const itens = lerExtra_(cfg, tz);
    blocos.push({
      id: i === 0 ? 'cartoes' : 'carro',
      grupo: i === 0 ? 'cartoes' : 'carro',
      titulo: cfg.nomeMenu,
      qtd: itens.length,
      unidade: cfg.unidade.replace('(s)', itens.length === 1 ? '' : 's'),
      falta: round2_(itens.reduce((s, it) => s + it.falta, 0)),
      itens: itens.map(it => ({ titulo: it.titulo, sub: it.sub, valor: it.falta }))
    });
  });

  // Manu
  const shManu = ss.getSheetByName(DIARIAS[1].aba);
  const pendManu = shManu ? lerDias_(shManu, tz, DIARIAS[1].pessoa).filter(it => it.restante > 0.004) : [];
  blocos.push(blocoDias_('manu', 'Diárias Manu', 'manu', pendManu));

  const total = round2_(blocos.reduce((s, b) => s + b.falta, 0));

  // números para a tela de abater
  const cfgCart = ABAS_EXTRAS[0];
  const alvos = {
    jose: round2_(pendJose.reduce((s, it) => s + it.restante, 0)),
    manu: round2_(pendManu.reduce((s, it) => s + it.restante, 0)),
    carro: totalFaltaExtra_(ABAS_EXTRAS[1]),
    cartoes: {
      vencido: faltaPorCartao_(cfgCart, tz, false),
      total: faltaPorCartao_(cfgCart, tz, true)
    }
  };

  return {
    total,
    blocos,
    alvos,
    atualizadoEm: Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'às' HH:mm")
  };
}

function blocoDias_(id, titulo, grupo, itens) {
  return {
    id,
    grupo,
    titulo,
    qtd: itens.length,
    unidade: itens.length === 1 ? 'dia' : 'dias',
    falta: round2_(itens.reduce((s, it) => s + it.restante, 0)),
    itens: itens.map(it => ({ titulo: it.dataTxt, sub: it.obs, valor: it.restante }))
  };
}

/* ---------------- pessoas e chaves ---------------- */

function usuarios_() {
  const raw = PropertiesService.getScriptProperties().getProperty(APP_PROP_USUARIOS);
  return raw ? JSON.parse(raw) : {};
}

function salvarUsuarios_(obj) {
  PropertiesService.getScriptProperties().setProperty(APP_PROP_USUARIOS, JSON.stringify(obj));
}

function usuarioDaChave_(token) {
  if (!token || String(token).length < 20) return null;
  const u = usuarios_()[String(token)];
  return u || null;
}

function publico_(u) {
  return { nome: u.nome, papel: u.papel, pessoa: u.pessoa || null };
}

/* ---------------- preferências visuais (por pessoa) ---------------- */

function chaveConfig_(u) {
  return APP_PROP_CFG + String(u.nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '_');
}

function configPadrao_(u) {
  return {
    cor: '#7c5cff',
    tema: 'auto',
    saudacao: `Oi, ${u.nome}`,
    emoji: '👋',
    valorDiaria: APP_VALOR_DIARIA,
    pessoaPadrao: (u.papel === 'admin' || !u.pessoa) ? DIARIAS[0].pessoa : u.pessoa,  // acesso total: José (dá para trocar no app)
    fonte: 'padrao',
    cantos: 'redondo'
  };
}

function lerConfig_(u) {
  const raw = PropertiesService.getScriptProperties().getProperty(chaveConfig_(u));
  return Object.assign(configPadrao_(u), raw ? JSON.parse(raw) : {});
}

function salvarConfig_(u, c) {
  const atual = lerConfig_(u);
  const limpo = {};
  if (/^#[0-9a-f]{6}$/i.test(c.cor || '')) limpo.cor = c.cor;
  if (['auto', 'claro', 'escuro'].indexOf(c.tema) >= 0) limpo.tema = c.tema;
  if (typeof c.saudacao === 'string') limpo.saudacao = c.saudacao.trim().slice(0, 40);
  if (typeof c.emoji === 'string') limpo.emoji = c.emoji.trim().slice(0, 8);
  if (sanitizeToNumber_(c.valorDiaria) > 0) limpo.valorDiaria = round2_(sanitizeToNumber_(c.valorDiaria));
  if (DIARIAS.some(d => d.pessoa === c.pessoaPadrao)) limpo.pessoaPadrao = c.pessoaPadrao;
  if (['padrao', 'arredondada', 'serifada'].indexOf(c.fonte) >= 0) limpo.fonte = c.fonte;
  if (['reto', 'suave', 'redondo'].indexOf(c.cantos) >= 0) limpo.cantos = c.cantos;
  const nova = Object.assign(atual, limpo);
  PropertiesService.getScriptProperties().setProperty(chaveConfig_(u), JSON.stringify(nova));
  return nova;
}

/* ---------------- menu: App do celular ---------------- */

function appCriarChave() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // endereços (pergunta só na primeira vez)
  let urlPwa = props.getProperty(APP_PROP_URL_PWA);
  if (!urlPwa) {
    const r = ui.prompt('App do celular', 'Endereço do app (GitHub Pages), ex.: https://seu-usuario.github.io/diarias/', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    urlPwa = r.getResponseText().trim();
    if (!/^https:\/\//.test(urlPwa)) { ui.alert('O endereço precisa começar com https://'); return; }
    if (!urlPwa.endsWith('/')) urlPwa += '/';
    props.setProperty(APP_PROP_URL_PWA, urlPwa);
  }
  let urlApi = props.getProperty(APP_PROP_URL_API);
  if (!urlApi) {
    const r = ui.prompt('App do celular',
      'URL do App da Web deste script (Implantar → Gerenciar implantações → copie a URL que termina em /exec):',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    urlApi = r.getResponseText().trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(urlApi)) { ui.alert('A URL precisa começar com https://script.google.com/ e terminar em /exec'); return; }
    props.setProperty(APP_PROP_URL_API, urlApi);
  }

  const rNome = ui.prompt('Criar chave de acesso', 'Nome da pessoa (ex.: Manu, José):', ui.ButtonSet.OK_CANCEL);
  if (rNome.getSelectedButton() !== ui.Button.OK) return;
  const nome = rNome.getResponseText().trim().slice(0, 30);
  if (!nome) { ui.alert('Informe um nome.'); return; }

  const total = ui.alert('Criar chave de acesso',
    `${nome} pode ABATER PAGAMENTOS?\n\nSIM = acesso total (lançar, abater e ver tudo).\nNÃO = só lança as próprias diárias e vê o resumo.`,
    ui.ButtonSet.YES_NO_CANCEL);
  if (total === ui.Button.CANCEL || total === ui.Button.CLOSE) return;

  let papel = 'admin', pessoa = null;
  if (total === ui.Button.NO) {
    papel = 'diarista';
    const rP = ui.prompt('Criar chave de acesso', `De quem são as diárias que ${nome} lança? (${DIARIAS.map(d => d.pessoa).join(' / ')})`, ui.ButtonSet.OK_CANCEL);
    if (rP.getSelectedButton() !== ui.Button.OK) return;
    const t = rP.getResponseText().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const achou = DIARIAS.find(d => d.pessoa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === t);
    if (!achou) { ui.alert('Não reconheci a pessoa.'); return; }
    pessoa = achou.pessoa;
  } else {
    // admin: lança para qualquer um, mas a pessoa padrão é a dela, se existir
    const achou = DIARIAS.find(d => d.pessoa.toLowerCase() === nome.toLowerCase());
    pessoa = achou ? achou.pessoa : null;
  }

  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
  const us = usuarios_();
  us[token] = { nome, papel, pessoa, criadaEm: formatDate_() };
  salvarUsuarios_(us);

  const link = `${urlPwa}#api=${encodeURIComponent(urlApi)}&chave=${token}`;
  mostrarLink_(nome, link, token, urlApi);
}

function mostrarLink_(nome, link, token, urlApi) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45">
      <p><b>Chave criada para ${esc(nome)}.</b></p>
      <p>Mande este link para o celular de ${esc(nome)} (pelo WhatsApp, por exemplo) e abra no <b>Chrome</b>. O app já entra configurado.</p>
      <textarea id="l" readonly style="width:100%;height:90px;font-size:12px">${esc(link)}</textarea>
      <button onclick="var t=document.getElementById('l');t.select();document.execCommand('copy');this.innerText='Copiado!'"
        style="margin-top:8px;padding:8px 14px;font-size:14px">Copiar link</button>
      <p style="color:#666;font-size:12px;margin-top:14px">Se preferir digitar no app:<br>
        API: <code>${esc(urlApi)}</code><br>Chave: <code>${esc(token)}</code></p>
      <p style="color:#b00;font-size:12px">Quem tiver este link consegue usar o app. Não poste em grupos.</p>
    </div>`
  ).setWidth(520).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'App do celular');
}

function appListarChaves() {
  const us = usuarios_();
  const linhas = Object.keys(us).map(k => {
    const u = us[k];
    const acesso = u.papel === 'admin' ? 'acesso total' : `só lança diárias de ${u.pessoa}`;
    return `• ${u.nome} — ${acesso} (criada em ${u.criadaEm || '?'}, chave …${k.slice(-4)})`;
  });
  SpreadsheetApp.getUi().alert('Quem tem acesso ao app', linhas.length ? linhas.join('\n') : 'Ninguém ainda.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function appRevogarChave() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Revogar acesso', 'Nome da pessoa (todas as chaves dela deixam de funcionar):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const nome = r.getResponseText().trim().toLowerCase();
  const us = usuarios_();
  let n = 0;
  Object.keys(us).forEach(k => { if (String(us[k].nome).toLowerCase() === nome) { delete us[k]; n++; } });
  salvarUsuarios_(us);
  ui.alert(n ? `${n} chave(s) revogada(s).` : 'Não achei ninguém com esse nome.');
}
