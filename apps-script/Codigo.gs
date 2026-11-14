/**********************
 * CONFIGURAÇÕES
 **********************/
const SHEET_NAME = 'DIÁRIAS';      // aba onde você lança os dias do José (base)
const RESUMO_NAME = 'RESUMO';      // aba pronta para tirar print e mandar
const TITULO_RESUMO = 'Diárias do José — a pagar';

const COL_DIAS = 1;   // A
const COL_JOSE = 2;   // B (valor do dia — vale também para a aba da Manu)
const COL_OBS  = 3;   // C — observações (ex.: "Almoço (25,00)", "Falta R$ 60,00 (José)")
const FIRST_ROW = 2;  // dados começam na linha 2
const PAID_FONT_COLOR = '#00ff00'; // verde aplicado à fonte quando o dia é quitado
const LABEL_TOTAL_RECEBIDO = 'Total Recebido';

const MOEDA = '"R$ "#,##0.00';
const DIAS_SEMANA = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sáb' };
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const COLS_BLOCO = 3; // Data, Valor, Observação (cada bloco ocupa 3 colunas + 1 de espaço)

// Abas de diárias (mesmo layout: A = dia, B = valor, C = observação, rótulo "Total Recebido")
const DIARIAS = [
  { aba: 'DIÁRIAS',      pessoa: 'José' },
  { aba: 'DIÁRIAS MANU', pessoa: 'Manu' }
];

// Cartão de crédito (usado para saber em qual fatura cai cada parcela)
const DIA_VENCIMENTO_CARTAO = 9;   // a fatura vence todo dia 9
const DIA_FECHAMENTO_CARTAO = 1;   // a fatura fecha todo dia 1 (compras até esse dia entram na fatura que vence em seguida)

// Cartões aceitos na aba CARTÕES (coluna Cartão das compras e dos pagamentos)
const CARTOES = ['José', 'Manu'];

// Histórico: dias já pagos de meses anteriores ao atual são movidos para esta aba
const ABA_HISTORICO = 'HISTÓRICO';
const ARQUIVAR_DIARIAS = [DIARIAS[0]]; // só José. Para incluir a Manu: [DIARIAS[0], DIARIAS[1]]
const HIST_FIRST_ROW = 4;              // linha 3 = cabeçalho, dados a partir da 4

// Recebimentos: um registro por pagamento recebido (data, mês, quem, origem, valor).
// É a "ponte" para o dashboard de finanças: a entrada do mês = soma dos recebimentos daquele mês.
const ABA_RECEBIMENTOS = 'RECEBIMENTOS';

/**********************
 * ABAS EXTRAS (CARTÕES e CARRO)
 * Pago / Falta / Status são fórmulas na própria aba.
 * Os pagamentos ficam na tabela da direita de cada aba.
 **********************/
const EXTRA_FIRST_ROW = 4; // dados começam na linha 4 (linha 3 = cabeçalho)

const ABAS_EXTRAS = [
  {
    aba: 'CARTÕES',
    nomeMenu: 'Cartões',
    titulo: 'COMPRAS NOS CARTÕES',
    unidade: 'compra(s)',
    colValor: 4,     // D
    colFalta: 6,     // F
    colStatus: 7,    // G
    colPagData: 10,  // J
    colPagValor: 11, // K
    colPagCartao: 13, // M — cartão que o pagamento quita (José / Manu)
    colCartao: 3,     // C — cartão da compra
    colData: 1,       // A — data da compra
    colDescricao: 2,  // B — descrição (a parcela vem no fim: "Caminhao 2/4")
    cabecalho: ['Data', 'Descrição', 'Falta pagar'],
    colMoedaResumo: 2, // posição (0-based) da coluna de valor no quadro do RESUMO
    montarLinha: (row, falta, tz) => [formatDataBR_(row[0], tz), row[1], falta]
  },
  {
    aba: 'CARRO',
    nomeMenu: 'Carro',
    titulo: 'MÃO DE OBRA NO CARRO',
    unidade: 'serviço(s)',
    colValor: 2,    // B
    colFalta: 4,    // D
    colStatus: 5,   // E
    colPagData: 7,  // G
    colPagValor: 8, // H
    cabecalho: ['Serviço', 'Falta pagar', 'Status'],
    colMoedaResumo: 1,
    montarLinha: (row, falta) => [row[0], falta, row[4]]
  }
];

/**********************
 * MENU
 **********************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Freelancers')
    .addItem('Abater pagamento — Diárias José', 'abaterPagamento')
    .addItem('Abater pagamento — Diárias Manu', 'abaterDiariasManu')
    .addItem('Abater pagamento — Cartões', 'abaterCartoes')
    .addItem('Abater pagamento — Carro', 'abaterCarro')
    .addSeparator()
    .addItem('Arquivar pagos no histórico', 'arquivarPagos')
    .addItem('Importar recebimentos das notas', 'importarRecebimentosDasNotas')
    .addItem('Atualizar resumo', 'atualizarResumo')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('App do celular')
      .addItem('Criar chave de acesso', 'appCriarChave')
      .addItem('Ver quem tem acesso', 'appListarChaves')
      .addItem('Revogar acesso de uma pessoa', 'appRevogarChave'))
    .addToUi();
}

function atualizarResumo() {
  const rs = gerarResumo_();
  SpreadsheetApp.getActive().setActiveSheet(rs);
}

function abaterPagamento()    { abaterDiarias_(DIARIAS[0]); } // diárias do José (nome mantido)
function abaterDiariasManu()  { abaterDiarias_(DIARIAS[1]); }
function abaterCartoes()      { abaterExtra_(ABAS_EXTRAS[0]); }
function abaterCarro()        { abaterExtra_(ABAS_EXTRAS[1]); }

// Roda `fn` segurando a trava do script (menu e app nunca gravam ao mesmo tempo)
function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('A planilha está ocupada com outra gravação. Tente de novo em alguns segundos.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/**********************
 * ABATER PAGAMENTO (diárias — José ou Manu) — pelo MENU
 * Só pergunta e mostra o resultado; quem faz o trabalho é abaterDiariasCore_ (o app usa a mesma).
 **********************/
function abaterDiarias_(cfg) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const pessoa = cfg.pessoa;

  const resp = ui.prompt(
    `Abater pagamento — Diárias ${pessoa}`,
    'Informe o valor RECEBIDO AGORA (ex.: 750,00):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  let r;
  try {
    r = comTrava_(() => abaterDiariasCore_(cfg, sanitizeToNumber_(resp.getResponseText()), {}));
  } catch (e) {
    ui.alert(e.message);
    return;
  }

  ss.setActiveSheet(ss.getSheetByName(RESUMO_NAME));

  ui.alert(
    `Pagamento abatido!\n\n` +
    `Recebido agora: R$ ${formatMoney_(r.recebido)}\n\n` +
    `Abatido em ${pessoa.toUpperCase()}: R$ ${formatMoney_(r.abatido)}\n\n` +
    (r.sobrou > 0
      ? `Não havia mais nada pendente. Sobraram R$ ${formatMoney_(r.sobrou)} que não foram aplicados.`
      : `Valor recebido foi aplicado integralmente.`) +
    (r.avisos.length ? `\n\nAtenção: ${r.avisos.join(' ')}` : '') +
    `\n\nA aba RESUMO já está atualizada.`
  );
}

/**
 * Núcleo do abatimento das diárias (usado pelo menu e pelo app).
 * Do dia mais antigo para o mais novo; parcial vira "Falta R$ x (Pessoa)" na coluna C;
 * verde só quando quita; notinha datada; soma no "Total Recebido"; registra em RECEBIMENTOS.
 * opts.previa = true → calcula tudo e NÃO grava nada.
 * opts.autor = nome de quem fez pelo app (vai na notinha).
 */
function abaterDiariasCore_(cfg, recebidoAgora, opts) {
  opts = opts || {};
  const previa = !!opts.previa;
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(cfg.aba);
  if (!sh) throw new Error(`Não encontrei a aba "${cfg.aba}".`);
  const pessoa = cfg.pessoa;

  recebidoAgora = round2_(recebidoAgora);
  if (!recebidoAgora || recebidoAgora <= 0) throw new Error('Valor inválido. Tente novamente.');

  const lastRow = sh.getLastRow();
  const n = lastRow - FIRST_ROW + 1;
  if (n < 1) throw new Error(`Não há dias lançados na aba "${cfg.aba}".`);

  const rngDias = sh.getRange(FIRST_ROW, COL_DIAS, n, 1).getValues();
  const rngValor = sh.getRange(FIRST_ROW, COL_JOSE, n, 1);
  const rngObs  = sh.getRange(FIRST_ROW, COL_OBS,  n, 1);

  const valorVals = rngValor.getValues();
  const obsVals  = rngObs.getValues();
  const valorFonts = rngValor.getFontColors();

  const quem = opts.autor ? ` — ${opts.autor} (app)` : '';
  let disponivel = recebidoAgora;
  let abatido = 0;
  let faltaAntes = 0;
  const itens = [];  // dias que este pagamento toca
  const notas = [];  // { i, texto } — gravadas só se não for prévia

  for (let i = 0; i < rngDias.length; i++) {
    if (!rngDias[i][0]) break;

    let obsTexto = obsVals[i][0] || '';

    if (!isPaidFont_(valorFonts[i][0])) {
      const original = sanitizeToNumber_(valorVals[i][0]);
      const faltaAnterior = parseFalta_(obsTexto, pessoa);
      const efetivo = (faltaAnterior !== null) ? faltaAnterior : original;
      if (efetivo > 0.004) faltaAntes = round2_(faltaAntes + efetivo);

      if (efetivo > 0.004 && disponivel > 0) {
        const pago = round2_(Math.min(disponivel, efetivo));
        const restante = round2_(efetivo - pago);
        disponivel = round2_(disponivel - pago);
        abatido = round2_(abatido + pago);

        if (restante <= 0.004) {
          valorFonts[i][0] = PAID_FONT_COLOR;
          obsTexto = removeFaltaTag_(obsTexto, pessoa);
          notas.push({ i, texto: `Quitado via script em ${formatDate_()}.${quem}` });
        } else {
          obsTexto = setFaltaTag_(obsTexto, pessoa, restante);
          notas.push({ i, texto: `Abatido R$ ${formatMoney_(pago)} em ${formatDate_()}. Restam R$ ${formatMoney_(restante)}.${quem}` });
        }

        const d = rngDias[i][0];
        itens.push({
          titulo: d instanceof Date ? formatDataBR_(d, tz) : String(d),
          valorDia: round2_(original),
          antes: round2_(efetivo),
          pago,
          restante,
          quitou: restante <= 0.004
        });
      }
    }

    obsVals[i][0] = obsTexto;
  }

  const avisos = [];
  const totalRecebidoCell = findLabelValueCell_(sh, LABEL_TOTAL_RECEBIDO);
  if (!totalRecebidoCell) {
    avisos.push(`Não encontrei a célula com o rótulo "${LABEL_TOTAL_RECEBIDO}" na aba "${cfg.aba}" para atualizar o total.`);
  }

  if (!previa) {
    rngValor.setFontColors(valorFonts);
    rngObs.setValues(obsVals);
    notas.forEach(nt => addNote_(rngValor.getCell(nt.i + 1, 1), nt.texto));

    if (totalRecebidoCell) {
      const atual = sanitizeToNumber_(totalRecebidoCell.getValue());
      totalRecebidoCell.setValue(round2_((atual || 0) + recebidoAgora));
    }

    // Registra o recebimento (com data) na aba RECEBIMENTOS — é daqui que sai a "entrada do mês"
    registrarRecebimento_(cfg.pessoa, 'Diárias', recebidoAgora);

    // Atualiza o RESUMO (para o print continuar valendo)
    gerarResumo_();
  }

  return {
    gravado: !previa,
    previa,
    alvo: 'Diárias ' + pessoa,
    recebido: recebidoAgora,
    abatido,
    sobrou: round2_(disponivel),
    faltaAntes,
    faltaDepois: round2_(faltaAntes - abatido),
    itens,
    avisos
  };
}

/**********************
 * ABATER PAGAMENTO (CARTÕES / CARRO) — pelo MENU
 * Lança o valor na tabela de pagamentos da aba; as fórmulas
 * abatem dos itens mais antigos primeiro.
 * Na aba CARTÕES, pergunta qual cartão o pagamento quita (José / Manu);
 * se o valor passar do que falta nesse cartão, o excedente vai
 * automaticamente para o outro cartão, numa segunda linha.
 **********************/
function abaterExtra_(cfg) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(cfg.aba);
  if (!sh) {
    ui.alert(`Não encontrei a aba "${cfg.aba}".`);
    return;
  }

  // "falta" considerando todas as compras/parcelas (é o que as fórmulas abatem)
  const faltaTodasAntes = round2_(lerExtra_(cfg, tz, true).reduce((s, it) => s + it.falta, 0));
  if (faltaTodasAntes <= 0.004) {
    ui.alert(`Nada pendente em ${cfg.nomeMenu}.`);
    return;
  }

  // --- escolha do cartão (só na aba CARTÕES) ---
  let cartao = null;
  let faltaVencida = null; // por cartão, só o que já venceu (igual ao RESUMO)
  let faltaTotal = null;   // por cartão, incluindo parcelas futuras
  if (cfg.colPagCartao) {
    faltaVencida = faltaPorCartao_(cfg, tz, false);
    faltaTotal = faltaPorCartao_(cfg, tz, true);

    const linhasFalta = CARTOES.map(c => {
      const futuro = round2_(faltaTotal[c] - faltaVencida[c]);
      return `  ${c}: R$ ${formatMoneyBR_(faltaVencida[c])}` +
        (futuro > 0.004 ? `  (+ R$ ${formatMoneyBR_(futuro)} em parcelas futuras)` : '');
    }).join('\n');

    const respCartao = ui.prompt(
      `Abater pagamento — ${cfg.nomeMenu}`,
      `Falta pagar:\n${linhasFalta}\n\nEsse pagamento é para qual cartão? Digite JOSÉ ou MANU:`,
      ui.ButtonSet.OK_CANCEL
    );
    if (respCartao.getSelectedButton() !== ui.Button.OK) return;

    cartao = normalizarCartao_(respCartao.getResponseText());
    if (!cartao) {
      ui.alert('Cartão inválido. Digite JOSÉ ou MANU.');
      return;
    }
    if (faltaTotal[cartao] <= 0.004) {
      ui.alert(`Não há nada pendente no cartão ${cartao}.`);
      return;
    }
  }

  const faltaMostrar = cartao ? faltaVencida[cartao] : totalFaltaExtra_(cfg);
  const resp = ui.prompt(
    `Abater pagamento — ${cfg.nomeMenu}${cartao ? ' (' + cartao + ')' : ''}`,
    `Falta pagar: R$ ${formatMoneyBR_(faltaMostrar)}\n\nInforme o valor RECEBIDO AGORA (ex.: 750,00):`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  let r;
  try {
    r = comTrava_(() => abaterExtraCore_(cfg, sanitizeToNumber_(resp.getResponseText()), cartao, {}));
  } catch (e) {
    ui.alert(e.message);
    return;
  }

  ss.setActiveSheet(ss.getSheetByName(RESUMO_NAME));

  let detalhe = '';
  if (r.lancamentos.length > 1) {
    detalhe = `\n\nDividido em:\n` + r.lancamentos
      .map(l => `  ${l.cartao}: R$ ${formatMoneyBR_(l.valor)}`).join('\n');
  } else if (cartao) {
    detalhe = `\nCartão: ${cartao}`;
  }

  let faltaTxt;
  if (cfg.colPagCartao) {
    const depois = faltaPorCartao_(cfg, tz, false);
    faltaTxt = `Ainda falta:\n` + CARTOES.map(c => `  ${c}: R$ ${formatMoneyBR_(depois[c])}`).join('\n');
  } else {
    faltaTxt = `Ainda falta: R$ ${formatMoneyBR_(totalFaltaExtra_(cfg))}`;
  }

  ui.alert(
    `Pagamento abatido em ${cfg.nomeMenu}!\n\n` +
    `Recebido agora: R$ ${formatMoneyBR_(r.recebido)}` + detalhe + `\n\n` +
    faltaTxt +
    (r.sobrou > 0.004 ? `\n\nNão havia mais nada pendente. Sobraram R$ ${formatMoneyBR_(r.sobrou)} que ficam como crédito para os próximos lançamentos.` : '') +
    `\n\nA aba RESUMO já está atualizada.`
  );
}

/**
 * Núcleo do abatimento de CARTÕES / CARRO (usado pelo menu e pelo app).
 * Grava o pagamento na tabela da direita; quem abate são as fórmulas da aba.
 * Para a prévia, simula as fórmulas: em ordem de linha e, na CARTÕES, só nas compras do mesmo cartão.
 * opts.previa = true → NÃO grava nada.
 */
function abaterExtraCore_(cfg, recebido, cartao, opts) {
  opts = opts || {};
  const previa = !!opts.previa;
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(cfg.aba);
  if (!sh) throw new Error(`Não encontrei a aba "${cfg.aba}".`);

  recebido = round2_(recebido);
  if (!recebido || recebido <= 0) throw new Error('Valor inválido. Tente novamente.');

  const todos = lerExtra_(cfg, tz, true);
  const faltaTodasAntes = round2_(todos.reduce((s, it) => s + it.falta, 0));
  if (faltaTodasAntes <= 0.004) throw new Error(`Nada pendente em ${cfg.nomeMenu}.`);

  // monta os lançamentos
  const lancamentos = [];
  if (cfg.colPagCartao) {
    cartao = normalizarCartao_(cartao);
    if (!cartao) throw new Error('Cartão inválido. Escolha José ou Manu.');
    const faltaTotal = faltaPorCartao_(cfg, tz, true);
    if (faltaTotal[cartao] <= 0.004) throw new Error(`Não há nada pendente no cartão ${cartao}.`);

    const outro = CARTOES.find(c => c !== cartao);
    const noEscolhido = round2_(Math.min(recebido, faltaTotal[cartao]));
    const excedente = round2_(recebido - noEscolhido);
    if (excedente > 0.004 && faltaTotal[outro] > 0.004) {
      lancamentos.push({ valor: noEscolhido, cartao: cartao });
      lancamentos.push({ valor: excedente, cartao: outro });
    } else {
      lancamentos.push({ valor: recebido, cartao: cartao });
    }
  } else {
    lancamentos.push({ valor: recebido, cartao: null });
  }

  // simulação das fórmulas (mesma ordem da aba)
  const sim = todos.map(it => ({ titulo: it.titulo, sub: it.sub, cartao: it.cartao, falta: it.falta }));
  const itens = [];
  let sobrou = 0;
  lancamentos.forEach(l => {
    let disp = l.valor;
    sim.forEach(s => {
      if (disp <= 0.004 || s.falta <= 0.004) return;
      if (l.cartao && s.cartao !== l.cartao) return;
      const antes = s.falta;
      const pago = round2_(Math.min(disp, s.falta));
      s.falta = round2_(s.falta - pago);
      disp = round2_(disp - pago);
      itens.push({ titulo: s.titulo, sub: s.sub, antes, pago, restante: s.falta, quitou: s.falta <= 0.004 });
    });
    sobrou = round2_(sobrou + disp);
  });
  let abatido = round2_(recebido - sobrou);
  let faltaDepois = round2_(faltaTodasAntes - abatido);

  if (!previa) {
    // primeira linha vazia da tabela de pagamentos
    const nLinhas = sh.getMaxRows() - EXTRA_FIRST_ROW + 1;
    const pagVals = sh.getRange(EXTRA_FIRST_ROW, cfg.colPagValor, nLinhas, 1).getValues();
    const idx = pagVals.findIndex(v => v[0] === '' || v[0] === null);
    if (idx < 0 || idx + lancamentos.length > nLinhas) {
      throw new Error('A tabela de pagamentos está cheia. Adicione linhas na aba e tente de novo.');
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    lancamentos.forEach((l, i) => {
      const linha = EXTRA_FIRST_ROW + idx + i;
      sh.getRange(linha, cfg.colPagData).setValue(hoje);
      sh.getRange(linha, cfg.colPagValor).setValue(l.valor);
      if (cfg.colPagCartao) sh.getRange(linha, cfg.colPagCartao).setValue(l.cartao);
    });
    SpreadsheetApp.flush();

    // depois de gravar, vale o que as fórmulas calcularam (igual ao menu antigo)
    faltaDepois = round2_(lerExtra_(cfg, tz, true).reduce((s, it) => s + it.falta, 0));
    abatido = round2_(faltaTodasAntes - faltaDepois);
    sobrou = round2_(recebido - abatido);
    gerarResumo_();
  }

  return {
    gravado: !previa,
    previa,
    alvo: cfg.nomeMenu + (cartao ? ` (cartão ${cartao})` : ''),
    recebido,
    abatido,
    sobrou,
    faltaAntes: faltaTodasAntes,
    faltaDepois,
    lancamentos,
    itens,
    avisos: []
  };
}

// Soma o que falta por cartão. todas = true inclui parcelas de faturas futuras.
function faltaPorCartao_(cfg, tz, todas) {
  const totais = {};
  CARTOES.forEach(c => totais[c] = 0);
  lerExtra_(cfg, tz, todas).forEach(it => {
    if (it.cartao && totais[it.cartao] !== undefined) {
      totais[it.cartao] = round2_(totais[it.cartao] + it.falta);
    }
  });
  return totais;
}

// "jose", "JOSÉ", "j" → "José"; "manu", "m" → "Manu"
function normalizarCartao_(txt) {
  const t = String(txt || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  return CARTOES.find(c =>
    c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(t)
  ) || null;
}

/**********************
 * ABA RESUMO (para o print) — um bloco por mês (diárias do José), lado a lado;
 * abaixo, os quadros de CARTÕES, CARRO, DIÁRIAS DA MANU e o TOTAL GERAL
 **********************/
function gerarResumo_() {
  const ss = SpreadsheetApp.getActive();
  const ativa = ss.getActiveSheet();
  const tz = ss.getSpreadsheetTimeZone();
  const base = getSheet_();

  // Diárias do José: só o que falta pagar, agrupado por mês (ordem cronológica)
  const pendentes = lerDias_(base, tz, DIARIAS[0].pessoa).filter(it => it.restante > 0.004);
  const mapa = new Map();
  pendentes.forEach(it => {
    if (!mapa.has(it.mes)) mapa.set(it.mes, { mesTxt: it.mesTxt, itens: [] });
    mapa.get(it.mes).itens.push(it);
  });
  const grupos = Array.from(mapa.keys()).sort().map(k => mapa.get(k));

  // Diárias da Manu: só o que falta pagar
  const baseManu = ss.getSheetByName(DIARIAS[1].aba);
  const itensManu = baseManu
    ? lerDias_(baseManu, tz, DIARIAS[1].pessoa).filter(it => it.restante > 0.004)
    : [];

  const nBlocos = Math.max(1, grupos.length);
  const nColunas = Math.max(nBlocos, ABAS_EXTRAS.length + 2); // extras + diárias da Manu + total geral
  const larguraTotal = nColunas * COLS_BLOCO + (nColunas - 1); // +1 coluna de espaço entre blocos

  let rs = ss.getSheetByName(RESUMO_NAME);
  if (!rs) rs = ss.insertSheet(RESUMO_NAME, 0);
  rs.getRange(1, 1, rs.getMaxRows(), rs.getMaxColumns()).breakApart();
  rs.clear();
  rs.setHiddenGridlines(true);

  // Título
  rs.getRange(1, 1, 1, larguraTotal).merge();
  rs.getRange(1, 1).setValue(TITULO_RESUMO).setFontSize(16).setFontWeight('bold');
  rs.getRange(2, 1, 1, larguraTotal).merge();
  rs.getRange(2, 1)
    .setValue('Atualizado em ' + Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'às' HH:mm"))
    .setFontColor('#777777').setFontSize(10);

  let fimDiarias = 5;
  if (!grupos.length) {
    rs.getRange(4, 1, 2, nBlocos * COLS_BLOCO).merge().setBackground('#e6f4ea')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rs.getRange(4, 1).setValue('✅ Diárias: tudo pago! Nada pendente.')
      .setFontSize(16).setFontWeight('bold').setFontColor('#1e7e34');
  } else {
    grupos.forEach((g, k) => {
      const fim = renderMes_(rs, 1 + k * (COLS_BLOCO + 1), 4, g);
      fimDiarias = Math.max(fimDiarias, fim);
    });
  }

  // Segunda linha de quadros, 3 linhas abaixo das diárias: Cartões | Carro | Diárias da Manu | Total geral
  const rExtras = fimDiarias + 3;
  ABAS_EXTRAS.forEach((cfg, k) => renderExtra_(rs, 1 + k * (COLS_BLOCO + 1), rExtras, cfg, tz));

  const cManu = 1 + ABAS_EXTRAS.length * (COLS_BLOCO + 1);
  renderDiariasManu_(rs, cManu, rExtras, itensManu);

  const cTotal = 1 + (ABAS_EXTRAS.length + 1) * (COLS_BLOCO + 1);
  renderTotalizador_(rs, rExtras, cTotal, grupos, tz, itensManu);

  // Larguras das colunas (e coluna de espaço entre os blocos)
  for (let k = 0; k < nColunas; k++) {
    const c = 1 + k * (COLS_BLOCO + 1);
    rs.setColumnWidth(c, 150);
    rs.setColumnWidth(c + 1, 120);
    rs.setColumnWidth(c + 2, 230);
    if (k < nColunas - 1) rs.setColumnWidth(c + 3, 30);
  }
  rs.setRowHeight(6, 46);

  if (ativa && ativa.getName() !== RESUMO_NAME) ss.setActiveSheet(ativa);
  return rs;
}

// Desenha o bloco de um mês começando na coluna c, linha r. Retorna a última linha usada.
function renderMes_(rs, c, r, g) {
  const n = COLS_BLOCO;
  const falta = round2_(g.itens.reduce((s, it) => s + it.restante, 0));

  // Nome do mês
  rs.getRange(r, c, 1, n).merge().setBackground('#434343');
  rs.getRange(r, c).setValue(g.mesTxt.toUpperCase())
    .setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  r++;

  // Quadro FALTA PAGAR do mês
  rs.getRange(r, c, 1, n).merge();
  rs.getRange(r + 1, c, 1, n).merge();
  rs.getRange(r, c).setValue(`FALTA PAGAR  ·  ${g.itens.length} dia(s)`)
    .setFontSize(10).setFontWeight('bold').setFontColor('#555555');
  rs.getRange(r + 1, c).setValue(falta).setNumberFormat(MOEDA)
    .setFontSize(22).setFontWeight('bold').setFontColor('#c45500');
  rs.getRange(r, c, 2, n).setBackground('#fff4e5')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  r += 3;

  // Tabela dos dias pendentes
  const inicio = r;
  rs.getRange(r, c, 1, n).setValues([['Data', 'Valor', 'Observação']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
  r++;

  const linhas = g.itens.map(it => [it.dataTxt, it.restante, it.obs]);
  rs.getRange(r, c, linhas.length, n).setValues(linhas);
  rs.getRange(r, c + 1, linhas.length, 1).setNumberFormat(MOEDA);
  g.itens.forEach((it, k) => {
    if (it.obs) rs.getRange(r + k, c + 2).setFontColor('#c45500').setFontWeight('bold');
  });
  r += linhas.length;

  // Total do mês no rodapé
  rs.getRange(r, c, 1, n).setValues([['TOTAL', falta, '']])
    .setFontWeight('bold').setBackground('#fff4e5');
  rs.getRange(r, c + 1).setNumberFormat(MOEDA);

  rs.getRange(inicio, c, r - inicio + 1, n)
    .setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID)
    .setVerticalAlignment('middle');

  return r;
}

// Quadro DIÁRIAS DA MANU (mesmo visual dos outros). Sem pendências, mostra "Nada pendente".
function renderDiariasManu_(rs, c, r, itens) {
  const n = COLS_BLOCO;
  if (itens.length) {
    renderMes_(rs, c, r, { mesTxt: 'Diárias da Manu', itens });
    return;
  }
  rs.getRange(r, c, 1, n).merge().setBackground('#434343');
  rs.getRange(r, c).setValue('DIÁRIAS DA MANU')
    .setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  rs.getRange(r + 1, c, 2, n).merge().setBackground('#e6f4ea')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  rs.getRange(r + 1, c).setValue('✅ Nada pendente')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1e7e34');
}

// Desenha o quadro de uma aba extra (CARTÕES / CARRO) na coluna c, linha r.
function renderExtra_(rs, c, r, cfg, tz) {
  const n = COLS_BLOCO;
  const itens = lerExtra_(cfg, tz);
  const falta = round2_(itens.reduce((s, it) => s + it.falta, 0));

  // Título do quadro
  rs.getRange(r, c, 1, n).merge().setBackground('#434343');
  rs.getRange(r, c).setValue(cfg.titulo)
    .setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  r++;

  // FALTA PAGAR
  rs.getRange(r, c, 1, n).merge();
  rs.getRange(r + 1, c, 1, n).merge();
  rs.getRange(r, c).setValue(`FALTA PAGAR  ·  ${itens.length} ${cfg.unidade}`)
    .setFontSize(10).setFontWeight('bold').setFontColor('#555555');
  rs.getRange(r + 1, c).setValue(falta).setNumberFormat(MOEDA)
    .setFontSize(22).setFontWeight('bold').setFontColor('#c45500');
  rs.getRange(r, c, 2, n).setBackground('#fff4e5')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  rs.setRowHeight(r + 1, 46);
  r += 3;

  // Tabela dos itens pendentes
  const inicio = r;
  rs.getRange(r, c, 1, n).setValues([cfg.cabecalho])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
  r++;

  if (!itens.length) {
    rs.getRange(r, c, 1, n).merge();
    rs.getRange(r, c).setValue('Nada pendente')
      .setHorizontalAlignment('center').setFontColor('#1e7e34').setFontWeight('bold');
    r++;
  } else {
    const linhas = itens.map(it => it.linha);
    rs.getRange(r, c, linhas.length, n).setValues(linhas);
    rs.getRange(r, c + cfg.colMoedaResumo, linhas.length, 1).setNumberFormat(MOEDA);
    r += linhas.length;
  }

  // Total no rodapé
  const total = ['TOTAL', '', ''];
  total[cfg.colMoedaResumo] = falta;
  rs.getRange(r, c, 1, n).setValues([total])
    .setFontWeight('bold').setBackground('#fff4e5');
  rs.getRange(r, c + cfg.colMoedaResumo).setNumberFormat(MOEDA);

  rs.getRange(inicio, c, r - inicio + 1, n)
    .setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID)
    .setVerticalAlignment('middle');

  return r;
}

// Quadro TOTAL GERAL (mesmo visual dos outros blocos), na coluna c, linha r
function renderTotalizador_(rs, r, c, grupos, tz, itensManu) {
  const n = COLS_BLOCO;
  const linhas = [];

  grupos.forEach(g => {
    const mesCurto = g.mesTxt.slice(0, 3) + g.mesTxt.slice(g.mesTxt.indexOf('/'));
    linhas.push([
      `Diárias ${mesCurto}`,
      `${g.itens.length} dia(s)`,
      round2_(g.itens.reduce((s, it) => s + it.restante, 0))
    ]);
  });

  if (itensManu && itensManu.length) {
    linhas.push([
      'Diárias Manu',
      `${itensManu.length} dia(s)`,
      round2_(itensManu.reduce((s, it) => s + it.restante, 0))
    ]);
  }

  ABAS_EXTRAS.forEach(cfg => {
    const itens = lerExtra_(cfg, tz);
    if (!itens.length) return;
    linhas.push([
      cfg.nomeMenu,
      `${itens.length} ${cfg.unidade}`,
      round2_(itens.reduce((s, it) => s + it.falta, 0))
    ]);
  });

  if (!linhas.length) return; // tudo pago: não precisa de totalizador

  const totalGeral = round2_(linhas.reduce((s, l) => s + l[2], 0));

  // Título
  rs.getRange(r, c, 1, n).merge().setBackground('#434343');
  rs.getRange(r, c).setValue('TOTAL GERAL')
    .setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  r++;

  // Quadro FALTA PAGAR (tudo somado)
  rs.getRange(r, c, 1, n).merge();
  rs.getRange(r + 1, c, 1, n).merge();
  rs.getRange(r, c).setValue('FALTA PAGAR  ·  TUDO')
    .setFontSize(10).setFontWeight('bold').setFontColor('#555555');
  rs.getRange(r + 1, c).setValue(totalGeral).setNumberFormat(MOEDA)
    .setFontSize(22).setFontWeight('bold').setFontColor('#c45500');
  rs.getRange(r, c, 2, n).setBackground('#fff4e5')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  rs.setRowHeight(r + 1, 46);
  r += 3;

  // Tabela com o detalhe por área
  const inicio = r;
  rs.getRange(r, c, 1, n).setValues([['Área', 'Itens', 'Falta pagar']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
  r++;

  rs.getRange(r, c, linhas.length, n).setValues(linhas);
  rs.getRange(r, c + 1, linhas.length, 1).setHorizontalAlignment('center');
  rs.getRange(r, c + 2, linhas.length, 1).setNumberFormat(MOEDA);
  r += linhas.length;

  rs.getRange(r, c, 1, n).setValues([['TOTAL', '', totalGeral]])
    .setFontWeight('bold').setBackground('#fff4e5');
  rs.getRange(r, c + 2).setNumberFormat(MOEDA);

  rs.getRange(inicio, c, r - inicio + 1, n)
    .setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID)
    .setVerticalAlignment('middle');

  return r;
}

// Lê os itens pendentes (Falta > 0) de uma aba extra.
// Parcelas ("n/N" no fim da descrição) só aparecem quando vencem até o próximo vencimento do cartão,
// a não ser que `todas` seja true (aí entram também as parcelas de faturas futuras).
// Cada item traz também `titulo` e `sub` (texto curto para o app).
function lerExtra_(cfg, tz, todas) {
  const sh = SpreadsheetApp.getActive().getSheetByName(cfg.aba);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < EXTRA_FIRST_ROW) return [];

  const proxVenc = proximoVencimentoCartao_(new Date());

  const vals = sh.getRange(EXTRA_FIRST_ROW, 1, last - EXTRA_FIRST_ROW + 1, cfg.colStatus).getValues();
  const itens = [];
  vals.forEach(row => {
    const valor = sanitizeToNumber_(row[cfg.colValor - 1]);
    const falta = round2_(sanitizeToNumber_(row[cfg.colFalta - 1]));
    if (valor <= 0.004 || falta <= 0.004) return;

    let linhaOrigem = row;
    let venc = null;
    if (cfg.colData) {
      venc = vencimentoParcela_(row[cfg.colData - 1], row[cfg.colDescricao - 1]);
      if (venc) {
        if (!todas && venc > proxVenc) return; // parcela de fatura futura: fica guardada na aba
        linhaOrigem = row.slice();
        linhaOrigem[cfg.colData - 1] = venc; // no resumo aparece a data de vencimento da parcela
      }
    }

    const cartao = cfg.colCartao ? String(row[cfg.colCartao - 1] || '').trim() : null;

    let titulo, sub;
    if (cfg.colDescricao) {
      titulo = String(row[cfg.colDescricao - 1] || '').trim();
      const dt = parseDataBR_(linhaOrigem[cfg.colData - 1]);
      sub = (venc ? 'vence ' : '') + (dt ? formatDataBR_(dt, tz) : '') + (cartao ? ` · cartão ${cartao}` : '');
    } else {
      titulo = String(row[0] || '').trim();
      sub = String(row[cfg.colStatus - 1] || '');
    }

    itens.push({ falta, cartao, titulo, sub, linha: cfg.montarLinha(linhaOrigem, falta, tz) });
  });
  return itens;
}

function totalFaltaExtra_(cfg) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return round2_(lerExtra_(cfg, tz).reduce((s, it) => s + it.falta, 0));
}

// Lê os dias de uma aba de diárias (José ou Manu). `pessoa` define a tag "Falta R$ ... (Pessoa)".
function lerDias_(base, tz, pessoa) {
  pessoa = pessoa || 'José';
  const lastRow = base.getLastRow();
  if (lastRow < FIRST_ROW) return [];
  const n = lastRow - FIRST_ROW + 1;

  const dias = base.getRange(FIRST_ROW, COL_DIAS, n, 1).getValues();
  const rJ = base.getRange(FIRST_ROW, COL_JOSE, n, 1);
  const jv = rJ.getValues(), jf = rJ.getFontColors();
  const ov = base.getRange(FIRST_ROW, COL_OBS, n, 1).getValues();

  const itens = [];
  for (let i = 0; i < n; i++) {
    const d = dias[i][0];
    if (!d) break;

    const obs = String(ov[i][0] || '');
    const vJ = sanitizeToNumber_(jv[i][0]);
    const restJ = restante_(vJ, jf[i][0], parseFalta_(obs, pessoa));
    const valor = round2_(vJ);
    const restante = round2_(restJ);

    let obsLimpa = removeFaltaTag_(obs, pessoa)
      .replace(/^\|\s*|\s*\|$/g, '').trim();
    // dia pago só em parte: mostra só o que falta e avisa
    if (restante > 0.004 && restante < valor - 0.004) {
      const aviso = `restante do dia (de R$ ${formatMoneyBR_(valor)})`;
      obsLimpa = obsLimpa ? `${obsLimpa} · ${aviso}` : aviso;
    }

    let dataTxt = String(d);
    let mes = 'sem-data', mesTxt = 'Sem data';
    if (d instanceof Date) {
      dataTxt = formatDataBR_(d, tz);
      mes = Utilities.formatDate(d, tz, 'yyyy-MM');
      mesTxt = MESES[Number(Utilities.formatDate(d, tz, 'M')) - 1] + '/' + Utilities.formatDate(d, tz, 'yyyy');
    }

    itens.push({ dataTxt, valor, restante, obs: obsLimpa, mes, mesTxt });
  }
  return itens;
}

function restante_(valor, fonte, falta) {
  if (valor <= 0.004 || isPaidFont_(fonte)) return 0;
  return (falta !== null) ? falta : valor;
}

/**********************
 * AJUDANTES
 **********************/
function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(SHEET_NAME) ||
    ss.getSheets().find(s => s.getName() !== RESUMO_NAME);
}

// Date → "qua. 07/10/2026" (texto); outros valores voltam como texto
function formatDataBR_(d, tz) {
  if (!(d instanceof Date)) return d ? String(d) : '';
  const sem = DIAS_SEMANA[Utilities.formatDate(d, tz, 'EEE')] || '';
  return `${sem} ${Utilities.formatDate(d, tz, 'dd/MM/yyyy')}`.trim();
}

// "26/10/2026" (texto) ou Date → Date
function parseDataBR_(v) {
  if (v instanceof Date) return v;
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

// Primeira fatura (data de vencimento) em que uma compra feita em `dt` entra.
// Ex.: fecha dia 1 e vence dia 9 → compra de 26/10 entra na fatura que vence em 09/11.
function primeiroVencimentoFatura_(dt) {
  for (let i = 0; i < 3; i++) {
    const venc = new Date(dt.getFullYear(), dt.getMonth() + i, DIA_VENCIMENTO_CARTAO);
    const fechamento = new Date(venc.getFullYear(), venc.getMonth(), DIA_FECHAMENTO_CARTAO, 23, 59, 59);
    if (dt <= fechamento) return venc;
  }
  return new Date(dt.getFullYear(), dt.getMonth() + 1, DIA_VENCIMENTO_CARTAO);
}

// Próximo vencimento do cartão a partir de hoje (no próprio dia do vencimento ainda conta)
function proximoVencimentoCartao_(hoje) {
  let v = new Date(hoje.getFullYear(), hoje.getMonth(), DIA_VENCIMENTO_CARTAO, 23, 59, 59);
  if (v < hoje) v = new Date(hoje.getFullYear(), hoje.getMonth() + 1, DIA_VENCIMENTO_CARTAO, 23, 59, 59);
  return v;
}

// Vencimento da parcela "n/N" (ex.: "Caminhao 2/4"). Se não for parcelado, devolve null.
function vencimentoParcela_(dataCompra, descricao) {
  const dt = parseDataBR_(dataCompra);
  if (!dt) return null;
  const m = String(descricao || '').match(/(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m || Number(m[2]) < 2 || Number(m[1]) < 1) return null;
  const primeiro = primeiroVencimentoFatura_(dt);
  return new Date(primeiro.getFullYear(), primeiro.getMonth() + (Number(m[1]) - 1), DIA_VENCIMENTO_CARTAO);
}

function isPaidFont_(color) {
  if (!color) return false;
  return String(color).toUpperCase() === PAID_FONT_COLOR.toUpperCase();
}

function findLabelValueCell_(sh, label) {
  const found = sh.createTextFinder(label).matchEntireCell(true).matchCase(false).findNext();
  return found ? found.offset(0, 1) : null;
}

function parseFalta_(texto, pessoa) {
  if (!texto) return null;
  const re = new RegExp('Falta R\\$\\s*([\\d.,]+)\\s*\\(' + pessoa + '\\)', 'i');
  const m = String(texto).match(re);
  return m ? sanitizeToNumber_(m[1]) : null;
}

function removeFaltaTag_(texto, pessoa) {
  if (!texto) return '';
  const re = new RegExp('\\s*\\|?\\s*Falta R\\$\\s*[\\d.,]+\\s*\\(' + pessoa + '\\)', 'i');
  return String(texto).replace(re, '').trim();
}

function setFaltaTag_(texto, pessoa, restante) {
  const limpo = removeFaltaTag_(texto, pessoa);
  const tag = `Falta R$ ${formatMoney_(restante)} (${pessoa})`;
  return limpo ? `${limpo} | ${tag}` : tag;
}

function sanitizeToNumber_(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function round2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatMoney_(n) {
  return Utilities.formatString('%.2f', Number(n || 0)).replace('.', ',');
}

// 1600 → "1.600,00"
function formatMoneyBR_(n) {
  const [inteiro, dec] = Utilities.formatString('%.2f', Number(n || 0)).split('.');
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function formatDate_() {
  const tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';
  return Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
}

function addNote_(cell, noteText) {
  try {
    const old = cell.getNote();
    cell.setNote(old ? `${old}\n${noteText}` : noteText);
  } catch (e) {}
}

/**********************
 * HISTÓRICO — arquivar dias pagos de meses anteriores
 * Move os dias quitados (fonte verde) de meses ANTERIORES ao atual para a aba HISTÓRICO.
 * Dias pagos do mês atual continuam na aba de diárias.
 * O "Total Recebido" da aba é reduzido pelo mesmo valor arquivado, então o "Total" (o que falta) não muda.
 * O RESUMO não é alterado (ele só mostra o que está pendente).
 **********************/
function arquivarPagos() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const mesAtual = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const mesAtualTxt = nomeMesDeChave_(mesAtual);

  // 1) levanta o que pode ser arquivado em cada aba
  const planos = [];
  ARQUIVAR_DIARIAS.forEach(cfg => {
    const sh = ss.getSheetByName(cfg.aba);
    if (!sh) return;
    const itens = coletarPagosAntigos_(sh, cfg, tz, mesAtual);
    if (itens.length) planos.push({ cfg, sh, itens });
  });

  if (!planos.length) {
    ui.alert(`Não há dias pagos de meses anteriores a ${mesAtualTxt} para arquivar.`);
    return;
  }

  // 2) confere se o "Total Recebido" cobre o que vai sair (evita bagunçar os totais)
  for (const p of planos) {
    p.cell = findLabelValueCell_(p.sh, LABEL_TOTAL_RECEBIDO);
    if (!p.cell) {
      ui.alert(`Não encontrei o rótulo "${LABEL_TOTAL_RECEBIDO}" na aba "${p.cfg.aba}". Nada foi arquivado.`);
      return;
    }
    p.recebidoAtual = round2_(sanitizeToNumber_(p.cell.getValue()));
    p.totalArquivar = round2_(p.itens.reduce((s, it) => s + it.valor, 0));
    if (p.totalArquivar > p.recebidoAtual + 0.004) {
      ui.alert(
        `Não arquivei nada.\n\n` +
        `Na aba "${p.cfg.aba}" os dias pintados de verde de meses anteriores somam R$ ${formatMoneyBR_(p.totalArquivar)}, ` +
        `mas o "Total Recebido" é só R$ ${formatMoneyBR_(p.recebidoAtual)}.\n\n` +
        `Vale conferir se algum dia foi pintado de verde sem lançar o pagamento.`
      );
      return;
    }
  }

  // 3) confirmação
  let texto = `Vou mover para a aba ${ABA_HISTORICO} os dias já pagos de meses anteriores a ${mesAtualTxt}:\n`;
  planos.forEach(p => {
    texto += `\n${p.cfg.aba}:\n`;
    const porMes = {};
    p.itens.forEach(it => {
      porMes[it.mesKey] = porMes[it.mesKey] || { n: 0, total: 0 };
      porMes[it.mesKey].n++;
      porMes[it.mesKey].total = round2_(porMes[it.mesKey].total + it.valor);
    });
    Object.keys(porMes).sort().forEach(k => {
      texto += `  ${nomeMesDeChave_(k)}: ${porMes[k].n} dia(s) · R$ ${formatMoneyBR_(porMes[k].total)}\n`;
    });
    texto += `"Total Recebido": R$ ${formatMoneyBR_(p.recebidoAtual)} → R$ ${formatMoneyBR_(round2_(p.recebidoAtual - p.totalArquivar))}\n`;
  });
  texto += `\nO que falta pagar não muda, e os dias pagos de ${mesAtualTxt} continuam na aba. Continuar?`;

  if (ui.alert('Arquivar pagos no histórico', texto, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // 4) grava no histórico
  const hist = getHistorico_();
  const linhasHist = [];
  const agora = new Date();
  planos.forEach(p => {
    p.itens.forEach(it => {
      linhasHist.push([
        nomeMesDeChave_(it.mesKey),
        it.data,
        p.cfg.pessoa,
        it.valor,
        removeFaltaTag_(it.obs, p.cfg.pessoa).replace(/^\|\s*|\s*\|$/g, '').trim(),
        agora,
        it.nota
      ]);
    });
  });
  appendHistorico_(hist, linhasHist);
  reconstruirResumoHistorico_(hist, tz);

  // 5) atualiza o Total Recebido e remove as linhas arquivadas da aba de diárias
  planos.forEach(p => {
    p.cell.setValue(round2_(p.recebidoAtual - p.totalArquivar));
    apagarLinhas_(p.sh, p.itens.map(it => it.linha));
  });
  SpreadsheetApp.flush();

  const totalDias = planos.reduce((s, p) => s + p.itens.length, 0);
  const totalValor = round2_(planos.reduce((s, p) => s + p.totalArquivar, 0));
  ss.setActiveSheet(hist);
  ui.alert(`Pronto! ${totalDias} dia(s) arquivado(s), somando R$ ${formatMoneyBR_(totalValor)}.`);
}

// Dias quitados (fonte verde) de meses anteriores ao atual
function coletarPagosAntigos_(sh, cfg, tz, mesAtual) {
  const lastRow = sh.getLastRow();
  const n = lastRow - FIRST_ROW + 1;
  if (n < 1) return [];

  const dias = sh.getRange(FIRST_ROW, COL_DIAS, n, 1).getValues();
  const rValor = sh.getRange(FIRST_ROW, COL_JOSE, n, 1);
  const valores = rValor.getValues();
  const fontes = rValor.getFontColors();
  const notas = rValor.getNotes();   // notinhas "Quitado via script em ..." (têm a data do pagamento)
  const obs = sh.getRange(FIRST_ROW, COL_OBS, n, 1).getValues();

  const itens = [];
  for (let i = 0; i < n; i++) {
    const d = dias[i][0];
    if (!d) break;
    if (!(d instanceof Date)) continue;                 // sem data de verdade, não dá pra saber o mês
    if (!isPaidFont_(fontes[i][0])) continue;           // só o que está quitado (verde)
    const mesKey = Utilities.formatDate(d, tz, 'yyyy-MM');
    if (mesKey >= mesAtual) continue;                   // mês atual fica na aba
    const valor = round2_(sanitizeToNumber_(valores[i][0]));
    if (valor <= 0.004) continue;
    itens.push({
      linha: FIRST_ROW + i, data: d, valor, obs: String(obs[i][0] || ''),
      nota: String(notas[i][0] || ''), mesKey
    });
  }
  return itens;
}

// "2026-09" → "Setembro/2026"
function nomeMesDeChave_(chave) {
  const [ano, mes] = String(chave).split('-');
  return MESES[Number(mes) - 1] + '/' + ano;
}

// Cria (se preciso) a aba HISTÓRICO
function getHistorico_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  let sh = ss.getSheetByName(ABA_HISTORICO);

  if (sh) {
    // aba criada na versão anterior: acrescenta a coluna G e muda o resumo de H:K para I:L
    if (String(sh.getRange(3, 7).getValue()) !== 'Pago em / nota') {
      cabecalhoHistorico_(sh);
      const maxRows = sh.getMaxRows();
      sh.getRange(3, 8, maxRows - 2, 4).clearContent().clearFormat();  // limpa o resumo antigo (H:K)
      cabecalhoHistorico_(sh);
      larguraHistorico_(sh);
      reconstruirResumoHistorico_(sh, tz);
    }
    return sh;
  }

  sh = ss.insertSheet(ABA_HISTORICO);
  sh.getRange(1, 1).setValue('Histórico de diárias pagas').setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setValue('Dias quitados de meses anteriores, movidos das abas de diárias. O resumo por mês fica à direita.')
    .setFontColor('#777777').setFontSize(10);
  cabecalhoHistorico_(sh);
  larguraHistorico_(sh);
  sh.setFrozenRows(3);
  return sh;
}

function cabecalhoHistorico_(sh) {
  sh.getRange(3, 1, 1, 7).setValues([['Mês', 'Data', 'Quem', 'Valor', 'Observação', 'Arquivado em', 'Pago em / nota']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
  sh.getRange(3, 9, 1, 4).setValues([['Mês', 'Quem', 'Dias', 'Total pago']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
}

function larguraHistorico_(sh) {
  [120, 270, 70, 110, 280, 130, 260, 30, 120, 70, 60, 120].forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

// Primeira linha livre da tabela de dias (coluna B = Data)
function proximaLinhaHistorico_(sh) {
  const n = Math.max(1, sh.getMaxRows() - HIST_FIRST_ROW + 1);
  const col = sh.getRange(HIST_FIRST_ROW, 2, n, 1).getValues();
  const idx = col.findIndex(v => v[0] === '' || v[0] === null);
  return idx < 0 ? sh.getMaxRows() + 1 : HIST_FIRST_ROW + idx;
}

function appendHistorico_(sh, linhas) {
  if (!linhas.length) return;
  const inicio = proximaLinhaHistorico_(sh);
  const fim = inicio + linhas.length - 1;
  if (fim > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), fim - sh.getMaxRows());

  sh.getRange(inicio, 1, linhas.length, 1).setNumberFormat('@');   // "agosto/2026" fica como texto
  sh.getRange(inicio, 1, linhas.length, 7).setValues(linhas);
  sh.getRange(inicio, 2, linhas.length, 1).setNumberFormat('dddd, d "de" mmmm "de" yyyy');
  sh.getRange(inicio, 4, linhas.length, 1).setNumberFormat(MOEDA);
  sh.getRange(inicio, 6, linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');

  // mantém em ordem de data (e de pessoa)
  const total = fim - HIST_FIRST_ROW + 1;
  sh.getRange(HIST_FIRST_ROW, 1, total, 7).sort([{ column: 2, ascending: true }, { column: 3, ascending: true }]);
}

// Resumo por mês (à direita): mês, quem, quantidade de dias e total pago
function reconstruirResumoHistorico_(sh, tz) {
  const ultima = proximaLinhaHistorico_(sh) - 1;
  const n = ultima - HIST_FIRST_ROW + 1;

  const grupos = {};
  if (n > 0) {
    sh.getRange(HIST_FIRST_ROW, 1, n, 4).getValues().forEach(row => {
      const d = row[1];
      if (!(d instanceof Date)) return;
      const mesKey = Utilities.formatDate(d, tz, 'yyyy-MM');
      const chave = mesKey + '|' + row[2];
      if (!grupos[chave]) grupos[chave] = { mesTxt: nomeMesDeChave_(mesKey), quem: row[2], dias: 0, total: 0 };
      grupos[chave].dias++;
      grupos[chave].total = round2_(grupos[chave].total + sanitizeToNumber_(row[3]));
    });
  }

  const linhas = Object.keys(grupos).sort().map(k => [grupos[k].mesTxt, grupos[k].quem, grupos[k].dias, grupos[k].total]);

  // limpa o resumo antigo
  const maxRows = sh.getMaxRows();
  sh.getRange(HIST_FIRST_ROW, 9, maxRows - HIST_FIRST_ROW + 1, 4).clearContent().clearFormat();
  if (!linhas.length) return;

  const fimResumo = HIST_FIRST_ROW + linhas.length; // linha do total geral
  if (fimResumo > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), fimResumo - sh.getMaxRows());

  sh.getRange(HIST_FIRST_ROW, 9, linhas.length, 1).setNumberFormat('@');   // mês como texto (não vira data)
  sh.getRange(HIST_FIRST_ROW, 9, linhas.length, 4).setValues(linhas);
  sh.getRange(HIST_FIRST_ROW, 11, linhas.length, 1).setHorizontalAlignment('center');
  sh.getRange(HIST_FIRST_ROW, 12, linhas.length, 1).setNumberFormat(MOEDA);

  const totalDias = linhas.reduce((a, l) => a + l[2], 0);
  const totalValor = round2_(linhas.reduce((a, l) => a + l[3], 0));
  sh.getRange(fimResumo, 9, 1, 4).setValues([['TOTAL', '', totalDias, totalValor]])
    .setFontWeight('bold').setBackground('#fff4e5');
  sh.getRange(fimResumo, 11).setHorizontalAlignment('center');
  sh.getRange(fimResumo, 12).setNumberFormat(MOEDA);

  sh.getRange(3, 9, fimResumo - 2, 4)
    .setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID);
}

// Apaga linhas (números de linha), de baixo para cima, juntando as que são vizinhas
function apagarLinhas_(sh, linhas) {
  const ls = linhas.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < ls.length) {
    const fim = ls[i];
    let ini = fim;
    let j = i + 1;
    while (j < ls.length && ls[j] === ini - 1) { ini = ls[j]; j++; }
    sh.deleteRows(ini, fim - ini + 1);
    i = j;
  }
}

/**********************
 * RECEBIMENTOS — registro datado de tudo que foi recebido
 * Colunas: Data | Mês (texto MM/AAAA) | Quem | Origem | Valor
 * À direita (G:I) há um resumo automático por mês e por pessoa, que o dashboard pode ler.
 * Para lançar um recebimento antigo na mão: preencha Data, Mês (ex.: 10/2026), Quem, Origem e Valor.
 **********************/
function getRecebimentos_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_RECEBIMENTOS);
  if (sh) {
    // conserta o resumo se a fórmula tiver dado erro (separador de argumentos da planilha)
    if (String(sh.getRange('G2').getDisplayValue()).indexOf('#ERROR') >= 0) {
      colocarFormulaResumoRecebimentos_(sh);
    }
    return sh;
  }

  sh = ss.insertSheet(ABA_RECEBIMENTOS);
  sh.getRange('B:B').setNumberFormat('@'); // coluna Mês fica como texto ("11/2026" não vira data)

  sh.getRange(1, 1, 1, 5).setValues([['Data', 'Mês', 'Quem', 'Origem', 'Valor']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
  sh.getRange(1, 7, 1, 3).setValues([['Mês', 'Quem', 'Total recebido']])
    .setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');

  colocarFormulaResumoRecebimentos_(sh);
  sh.getRange('I2:I').setNumberFormat(MOEDA);
  sh.getRange('A2:A').setNumberFormat('dd/MM/yyyy');
  sh.getRange('E2:E').setNumberFormat(MOEDA);

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(4, 130);
  sh.setColumnWidth(5, 110);
  sh.setColumnWidth(6, 30);
  sh.setColumnWidth(7, 80);
  sh.setColumnWidth(8, 80);
  sh.setColumnWidth(9, 120);
  sh.setFrozenRows(1);
  return sh;
}

// Resumo automático por mês e pessoa (G2). Esta planilha usa ";" entre os argumentos das fórmulas;
// tenta com ";" e, se der erro, com ",", para funcionar em qualquer configuração.
function colocarFormulaResumoRecebimentos_(sh) {
  const consulta = "select B, C, sum(E) where B is not null group by B, C order by B label sum(E) ''";
  const candidatas = [
    '=IFERROR(QUERY(A2:E;"' + consulta + '";0);"")',
    '=IFERROR(QUERY(A2:E,"' + consulta + '",0),"")'
  ];
  const cel = sh.getRange('G2');
  for (const f of candidatas) {
    cel.setFormula(f);
    SpreadsheetApp.flush();
    if (String(cel.getDisplayValue()).indexOf('#ERROR') < 0) return;
  }
}

function registrarRecebimento_(pessoa, origem, valor) {
  if (!valor || valor <= 0) return;
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  appendRecebimentos_([[hoje, Utilities.formatDate(hoje, tz, 'MM/yyyy'), pessoa, origem, round2_(valor)]]);
}

// Grava várias linhas [Data, Mês, Quem, Origem, Valor] na primeira área livre da aba RECEBIMENTOS
function appendRecebimentos_(linhas) {
  if (!linhas.length) return;
  const sh = getRecebimentos_();
  const n = Math.max(1, sh.getMaxRows() - 1);
  const col = sh.getRange(2, 1, n, 1).getValues();
  const idx = col.findIndex(v => v[0] === '' || v[0] === null);
  const inicio = idx < 0 ? sh.getMaxRows() + 1 : 2 + idx;
  const fim = inicio + linhas.length - 1;
  if (fim > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), fim - sh.getMaxRows());
  sh.getRange(inicio, 1, linhas.length, 5).setValues(linhas);
}

/**********************
 * IMPORTAR RECEBIMENTOS DAS NOTAS
 * O "Abater pagamento" deixa uma notinha na célula de cada dia, com a data:
 *   "Abatido R$ 90,00 em 09/11/2026 08:38. Restam R$ 80,00."
 *   "Quitado via script em 09/11/2026 08:38."
 * Aqui essas notinhas viram recebimentos datados na aba RECEBIMENTOS.
 * Tudo que foi abatido no mesmo minuto conta como UM pagamento recebido.
 * Lê as notas das abas de diárias e a coluna "Pago em / nota" do HISTÓRICO.
 * Não duplica: pagamento que já está em RECEBIMENTOS (mesma data, pessoa e valor) é ignorado.
 **********************/
function eventosDaNota_(nota, valorDia) {
  const eventos = [];
  let jaAbatido = 0;
  String(nota || '').split('\n').forEach(linha => {
    let m = linha.match(/Abatido R\$\s*([\d.,]+)\s*em\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (m) {
      const v = round2_(sanitizeToNumber_(m[1]));
      jaAbatido = round2_(jaAbatido + v);
      eventos.push({
        valor: v,
        stamp: `${m[2]}/${m[3]}/${m[4]} ${m[5]}:${m[6]}`,
        data: new Date(Number(m[4]), Number(m[3]) - 1, Number(m[2]))
      });
      return;
    }
    m = linha.match(/Quitado via script em\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (m) {
      const v = round2_(valorDia - jaAbatido);   // o que faltava do dia no momento em que quitou
      jaAbatido = valorDia;
      if (v > 0.004) {
        eventos.push({
          valor: v,
          stamp: `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`,
          data: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
        });
      }
    }
  });
  return eventos;
}

function importarRecebimentosDasNotas() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();

  // 1) junta todos os dias que têm notinha (abas de diárias + coluna G do HISTÓRICO)
  const dias = []; // { pessoa, valorDia, nota }

  DIARIAS.forEach(cfg => {
    const sh = ss.getSheetByName(cfg.aba);
    if (!sh) return;
    const n = sh.getLastRow() - FIRST_ROW + 1;
    if (n < 1) return;
    const dd = sh.getRange(FIRST_ROW, COL_DIAS, n, 1).getValues();
    const rV = sh.getRange(FIRST_ROW, COL_JOSE, n, 1);
    const vals = rV.getValues();
    const notas = rV.getNotes();
    for (let i = 0; i < n; i++) {
      if (!dd[i][0]) break;
      if (notas[i][0]) dias.push({ pessoa: cfg.pessoa, valorDia: sanitizeToNumber_(vals[i][0]), nota: notas[i][0] });
    }
  });

  const hist = ss.getSheetByName(ABA_HISTORICO);
  if (hist) {
    const n = proximaLinhaHistorico_(hist) - HIST_FIRST_ROW;
    if (n > 0) {
      hist.getRange(HIST_FIRST_ROW, 1, n, 7).getValues().forEach(r => {
        if (r[6]) dias.push({ pessoa: r[2], valorDia: sanitizeToNumber_(r[3]), nota: r[6] });
      });
    }
  }

  // 2) cada "rodada" de pagamento (pessoa + minuto) vira um recebimento
  const grupos = {};
  dias.forEach(d => {
    eventosDaNota_(d.nota, d.valorDia).forEach(ev => {
      const chave = d.pessoa + '|' + ev.stamp;
      if (!grupos[chave]) grupos[chave] = { pessoa: d.pessoa, data: ev.data, stamp: ev.stamp, total: 0 };
      grupos[chave].total = round2_(grupos[chave].total + ev.valor);
    });
  });
  const lista = Object.keys(grupos).map(k => grupos[k]);
  if (!lista.length) {
    ui.alert('Não encontrei notinhas de pagamento ("Quitado via script..." / "Abatido R$...") nas abas.');
    return;
  }

  // 3) tira o que já está em RECEBIMENTOS
  const rec = getRecebimentos_();
  const existentes = {};
  const nRec = rec.getLastRow() - 1;
  if (nRec > 0) {
    rec.getRange(2, 1, nRec, 5).getValues().forEach(r => {
      if (!(r[0] instanceof Date)) return;
      existentes[Utilities.formatDate(r[0], tz, 'dd/MM/yyyy') + '|' + r[2] + '|' + round2_(sanitizeToNumber_(r[4])).toFixed(2)] = true;
    });
  }
  const novos = lista
    .filter(g => !existentes[Utilities.formatDate(g.data, tz, 'dd/MM/yyyy') + '|' + g.pessoa + '|' + g.total.toFixed(2)])
    .sort((a, b) => (a.data - b.data) || a.stamp.localeCompare(b.stamp));

  if (!novos.length) {
    ui.alert('Tudo que está nas notinhas já está na aba RECEBIMENTOS.');
    return;
  }

  // 4) confirmação (por mês e pessoa)
  const porMes = {};
  novos.forEach(g => {
    const k = Utilities.formatDate(g.data, tz, 'yyyy-MM') + '|' + g.pessoa;
    porMes[k] = porMes[k] || { n: 0, total: 0 };
    porMes[k].n++;
    porMes[k].total = round2_(porMes[k].total + g.total);
  });
  let texto = `Achei ${novos.length} recebimento(s) nas notinhas:\n\n`;
  Object.keys(porMes).sort().forEach(k => {
    const [mesKey, pessoa] = k.split('|');
    texto += `  ${nomeMesDeChave_(mesKey)} · ${pessoa}: ${porMes[k].n} recebimento(s) · R$ ${formatMoneyBR_(porMes[k].total)}\n`;
  });
  const totalGeral = round2_(novos.reduce((s, g) => s + g.total, 0));
  texto += `\nTotal: R$ ${formatMoneyBR_(totalGeral)}\n\nLançar na aba RECEBIMENTOS?`;
  if (ui.alert('Importar recebimentos das notas', texto, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // 5) grava
  appendRecebimentos_(novos.map(g => [
    g.data,
    Utilities.formatDate(g.data, tz, 'MM/yyyy'),
    g.pessoa,
    'Diárias (notas)',
    g.total
  ]));
  SpreadsheetApp.flush();
  ss.setActiveSheet(getRecebimentos_());
  ui.alert(`Pronto! ${novos.length} recebimento(s) lançado(s), somando R$ ${formatMoneyBR_(totalGeral)}.`);
}
