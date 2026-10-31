/*
 * regras.js — Gastos do Casal · cálculos puros
 *
 * Dono: Agente Regras. Especificação: CONTRATO.md, seções 2, 3, 4, 5 e 8 (orçamento, R9).
 *
 * O QUE ESTE ARQUIVO FAZ
 *   Recebe a lista de registros (tudo junto, de todos os tipos) e devolve números e
 *   listas prontos para a tela: fatura de cada compra, parcelas, gasto do mês, receita,
 *   sobra, faturas por cartão, quanto cada parente deve, texto do WhatsApp e CSV.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ
 *   Não desenha tela, não grava nada, não acessa internet e NÃO LÊ O RELÓGIO.
 *   Quem chama passa a data de hoje como texto "AAAA-MM-DD".
 *
 * REGRAS GERAIS (valem para todas as funções)
 *   - Dinheiro é sempre centavos em número inteiro (3890 = R$ 38,90). Nunca número quebrado.
 *   - Datas são texto "AAAA-MM-DD"; mês é "AAAA-MM". Este arquivo NÃO usa o objeto Date:
 *     toda conta de data é feita com ano/mês/dia em números (assim não há erro de fuso).
 *   - Registros com apagado:true (lixeira) e registros do tipo "historico" são IGNORADOS
 *     em todos os cálculos, mesmo que quem chama esqueça de tirar.
 *   - Campo ausente vira null. Este arquivo nunca inventa um valor que não foi informado.
 *     As funções de formatação (dinheiro, dataBR, mesExtenso) devolvem "NÃO INFORMADO"
 *     quando recebem null ou algo inválido, para a tela mostrar direto.
 *
 * Funciona no navegador (window.Regras) e no Node (module.exports), sem nenhuma dependência.
 */
(function (raiz) {
  "use strict";

  var NAO_INFORMADO = "NÃO INFORMADO";

  // ===================================================================================
  // 1. AJUDANTES DE TEXTO, NÚMERO E DATA (seção 2 do contrato)
  // ===================================================================================

  /** Verdadeiro se v é um número inteiro "seguro" (sem casas decimais). */
  function ehInteiro(v) {
    return typeof v === "number" && Number.isSafeInteger(v);
  }

  /** Completa com zero à esquerda: 5 -> "05". */
  function doisDigitos(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** Ano bissexto (fevereiro com 29 dias). */
  function ehBissexto(ano) {
    return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  }

  /** Quantos dias tem o mês (mes de 1 a 12). */
  function ultimoDia(ano, mes) {
    if (mes === 2) return ehBissexto(ano) ? 29 : 28;
    if (mes === 4 || mes === 6 || mes === 9 || mes === 11) return 30;
    return 31;
  }

  /**
   * Lê "AAAA-MM-DD" e devolve {ano, mes, dia} em números, ou null se o texto
   * não for uma data válida (ex.: "2026-02-30" é inválida).
   */
  function lerData(texto) {
    if (typeof texto !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (!m) return null;
    var ano = +m[1], mes = +m[2], dia = +m[3];
    if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDia(ano, mes)) return null;
    return { ano: ano, mes: mes, dia: dia };
  }

  /** Lê "AAAA-MM" e devolve {ano, mes} ou null. */
  function lerMes(texto) {
    if (typeof texto !== "string") return null;
    var m = /^(\d{4})-(\d{2})$/.exec(texto);
    if (!m) return null;
    var ano = +m[1], mes = +m[2];
    if (mes < 1 || mes > 12) return null;
    return { ano: ano, mes: mes };
  }

  /** Monta "AAAA-MM". */
  function textoMes(ano, mes) {
    return ano + "-" + doisDigitos(mes);
  }

  /**
   * Monta "AAAA-MM-DD" com a regra da seção 2: dia que não existe no mês
   * vira o último dia do mês (dia 31 em fevereiro -> 28 ou 29).
   */
  function dataNoMes(ano, mes, dia) {
    var d = Math.min(dia, ultimoDia(ano, mes));
    return ano + "-" + doisDigitos(mes) + "-" + doisDigitos(d);
  }

  /**
   * Mesma coisa, recebendo o mês como texto: dataDoMes("2026-02", 31) -> "2026-02-28".
   * Devolve null se o mês ou o dia forem inválidos.
   */
  function dataDoMes(mesTexto, dia) {
    var m = lerMes(mesTexto);
    if (!m || !ehInteiro(dia) || dia < 1 || dia > 31) return null;
    return dataNoMes(m.ano, m.mes, dia);
  }

  /** "2026-09-19" -> "2026-09". Data inválida -> null. */
  function mesDe(data) {
    var d = lerData(data);
    return d ? textoMes(d.ano, d.mes) : null;
  }

  /**
   * Regras.somaMes("2026-09", k) -> "2026-10". k pode ser negativo.
   * Atravessa o ano corretamente ("2026-12" + 1 = "2027-01"). Entrada inválida -> null.
   */
  function somaMes(mesTexto, k) {
    var m = lerMes(mesTexto);
    if (!m || !ehInteiro(k)) return null;
    var total = m.ano * 12 + (m.mes - 1) + k; // conta tudo em "meses desde o ano zero"
    var ano = Math.floor(total / 12);
    var mes = total - ano * 12 + 1;
    return textoMes(ano, mes);
  }

  /** "2026-09-19" -> "19/09/2026". null ou inválido -> "NÃO INFORMADO". */
  function dataBR(data) {
    var d = lerData(data);
    if (!d) return NAO_INFORMADO;
    return doisDigitos(d.dia) + "/" + doisDigitos(d.mes) + "/" + d.ano;
  }

  /** "2026-09-19" -> "19/09" (forma curta usada nas listas do protótipo). Inválido -> "NÃO INFORMADO". */
  function dataCurta(data) {
    var d = lerData(data);
    if (!d) return NAO_INFORMADO;
    return doisDigitos(d.dia) + "/" + doisDigitos(d.mes);
  }

  var NOMES_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /** "2026-09" -> "setembro de 2026". Inválido -> "NÃO INFORMADO". */
  function mesExtenso(mesTexto) {
    var m = lerMes(mesTexto);
    if (!m) return NAO_INFORMADO;
    return NOMES_MESES[m.mes - 1] + " de " + m.ano;
  }

  /**
   * Regras.dinheiro(3890) -> "R$ 38,90"; 240000 -> "R$ 2.400,00"; -1000 -> "-R$ 10,00".
   * Usa espaço comum entre "R$" e o número (o toLocaleString põe um espaço especial
   * que atrapalha no texto do WhatsApp; o resultado visual é o mesmo).
   * null ou valor que não é inteiro -> "NÃO INFORMADO".
   */
  function dinheiro(centavos) {
    if (!ehInteiro(centavos)) return NAO_INFORMADO;
    var negativo = centavos < 0;
    var abs = Math.abs(centavos);
    var reais = Math.floor(abs / 100);
    var cents = abs - reais * 100;
    // separador de milhar com ponto
    var r = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (negativo ? "-" : "") + "R$ " + r + "," + doisDigitos(cents);
  }

  /** Centavos em texto de reais SEM "R$" e sem milhar, para o CSV: 3890 -> "38,90". */
  function reaisCSV(centavos) {
    if (!ehInteiro(centavos)) return "";
    var negativo = centavos < 0;
    var abs = Math.abs(centavos);
    var reais = Math.floor(abs / 100);
    return (negativo ? "-" : "") + reais + "," + doisDigitos(abs - reais * 100);
  }

  /**
   * Regras.centavos(texto) -> número inteiro de centavos, ou null se não der para entender.
   *
   * Aceita: "38,90"  "38.90"  "38,9"  "38"  "1.234,56"  "1,234.56"  "1.234"  "R$ 10"  " 10,00 "  ",50"
   * Regras de leitura (jeito brasileiro primeiro):
   *   - tira "R$" e espaços;
   *   - se tem vírgula E ponto: o que aparece por último é o separador de centavos;
   *   - só vírgula: a vírgula separa os centavos (no máximo 2 casas);
   *   - só ponto: ponto seguido de exatamente 3 dígitos é milhar ("1.234" = mil duzentos e
   *     trinta e quatro reais); seguido de 1 ou 2 dígitos é centavo ("38.90");
   *   - milhar tem que estar em grupos de 3 ("1.23.4" é recusado).
   * Recusa (devolve null): texto vazio, letras ("abc"), mais de 2 casas de centavos,
   * número negativo (gasto/receita nunca é negativo neste app), e qualquer coisa que não seja texto.
   */
  function centavos(texto) {
    if (typeof texto !== "string") return null;
    var t = texto.replace(/R\$/gi, "").replace(/[\s ]/g, "");
    if (t === "" || !/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

    var inteiro, decimal;
    var temVirgula = t.indexOf(",") >= 0;
    var temPonto = t.indexOf(".") >= 0;

    if (temVirgula && temPonto) {
      var sepDec = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
      var sepMil = sepDec === "," ? "." : ",";
      var partes = t.split(sepDec);
      if (partes.length !== 2) return null;
      inteiro = partes[0];
      decimal = partes[1];
      if (inteiro.indexOf(sepDec) >= 0) return null;
      // o inteiro tem separador de milhar: precisa ser grupos de 3
      var grupos = inteiro.split(sepMil);
      if (!/^\d{1,3}$/.test(grupos[0])) return null;
      for (var i = 1; i < grupos.length; i++) if (!/^\d{3}$/.test(grupos[i])) return null;
      inteiro = grupos.join("");
    } else if (temVirgula) {
      var pv = t.split(",");
      if (pv.length !== 2) return null;
      inteiro = pv[0];
      decimal = pv[1];
    } else if (temPonto) {
      var pp = t.split(".");
      var ultimo = pp[pp.length - 1];
      if (pp.length === 2 && ultimo.length >= 1 && ultimo.length <= 2) {
        // "38.90" ou "38.9" -> ponto é centavo
        inteiro = pp[0];
        decimal = ultimo;
      } else {
        // "1.234" ou "1.234.567" -> pontos são milhar
        if (!/^\d{1,3}$/.test(pp[0])) return null;
        for (var j = 1; j < pp.length; j++) if (!/^\d{3}$/.test(pp[j])) return null;
        inteiro = pp.join("");
        decimal = "";
      }
    } else {
      inteiro = t;
      decimal = "";
    }

    if (!/^\d*$/.test(inteiro) || !/^\d{0,2}$/.test(decimal)) return null;
    if (inteiro === "" && decimal === "") return null;
    if (decimal.length === 1) decimal += "0";
    if (decimal === "") decimal = "00";
    var valor = parseInt(inteiro || "0", 10) * 100 + parseInt(decimal, 10);
    return Number.isSafeInteger(valor) ? valor : null;
  }

  /**
   * Regras.dividirParcelas(total, n) -> lista com n valores em centavos.
   * Regra da seção 2: a sobra dos centavos vai na PRIMEIRA parcela.
   * Ex.: dividirParcelas(10000, 3) -> [3334, 3333, 3333].
   * total precisa ser inteiro ≥ 0 e n inteiro ≥ 1; senão devolve null.
   */
  function dividirParcelas(total, n) {
    if (!ehInteiro(total) || total < 0 || !ehInteiro(n) || n < 1) return null;
    var base = Math.floor(total / n);
    var sobra = total - base * n;
    var lista = [];
    for (var k = 0; k < n; k++) lista.push(base);
    lista[0] = base + sobra;
    return lista;
  }

  // ===================================================================================
  // 2. ORGANIZAR OS REGISTROS
  // ===================================================================================

  /**
   * Separa os registros válidos para cálculo:
   *   - joga fora apagado:true e tipo "historico" (regra geral do contrato);
   *   - monta um índice por id e listas por tipo.
   * Chamado no começo de cada função pública (as funções não guardam nada entre chamadas).
   */
  function indexar(registros) {
    var porId = {}, porTipo = {};           // VIVOS: entram nos cálculos
    var todosPorId = {}, todosPorTipo = {}; // TODOS (inclusive lixeira): só para achar nome/dados de referência
    var lista = Array.isArray(registros) ? registros : [];
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      if (!r || typeof r !== "object") continue;
      if (r.tipo === "historico") continue;
      var t = r.tipo || "?";
      if (r.id != null) todosPorId[r.id] = r;
      (todosPorTipo[t] = todosPorTipo[t] || []).push(r);
      if (r.apagado === true) continue;
      if (r.id != null) porId[r.id] = r;
      (porTipo[t] = porTipo[t] || []).push(r);
    }
    return {
      porId: porId,
      todosPorId: todosPorId,
      tipo: function (t) { return porTipo[t] || []; },
      todosDoTipo: function (t) { return todosPorTipo[t] || []; }
    };
  }

  /** Pega um registro pelo id entre TODOS (inclusive lixeira), conferindo o tipo. */
  function buscarTodos(idx, id, tipo) {
    if (id == null) return null;
    var r = idx.todosPorId[id];
    if (!r) return null;
    if (tipo && r.tipo !== tipo) return null;
    return r;
  }

  /** Pega um registro pelo id, conferindo o tipo. Não achou -> null. */
  function buscar(idx, id, tipo) {
    if (id == null) return null;
    var r = idx.porId[id];
    if (!r) return null;
    if (tipo && r.tipo !== tipo) return null;
    return r;
  }

  /**
   * Nome de um registro referenciado (categoria, meio, cartão, pessoa, fonte) ou null.
   * Procura entre TODOS os registros, inclusive os da lixeira: se a categoria ou a pessoa
   * foi apagada, a compra viva continua mostrando o nome dela.
   */
  function nomeDe(idx, id) {
    var r = id == null ? null : idx.todosPorId[id];
    return r && r.nome != null ? r.nome : null;
  }

  /**
   * Descobre como a compra foi paga, olhando o campo `meio` do lançamento:
   *   { tipo: "cartao", cartao: <registro>, nome }   -> é um cartão cadastrado
   *   { tipo: "meio",   cartao: null,       nome }   -> Pix, dinheiro, débito... (sem fatura)
   *   { tipo: "desconhecido", ... }                  -> id não encontrado (ex.: cartão foi para a lixeira)
   *   { tipo: null, ... }                            -> campo `meio` vazio
   * "desconhecido" e null são tratados como meio que não é cartão: sem fatura (R1).
   * Procura entre TODOS os registros: cartão que foi para a lixeira continua valendo para
   * calcular a fatura das compras vivas (o campo `apagado` do cartão avisa a tela).
   */
  function infoMeio(idx, idMeio) {
    if (idMeio == null) return { tipo: null, cartao: null, nome: null, id: null };
    var r = idx.todosPorId[idMeio];
    if (!r) return { tipo: "desconhecido", cartao: null, nome: null, id: idMeio };
    if (r.tipo === "cartao") return { tipo: "cartao", cartao: r, nome: r.nome != null ? r.nome : null, id: idMeio };
    return { tipo: "meio", cartao: null, nome: r.nome != null ? r.nome : null, id: idMeio };
  }

  /** O cartão tem os dois dias informados (1 a 31)? */
  function cartaoTemDatas(cartao) {
    return !!cartao &&
      ehInteiro(cartao.dia_fechamento) && cartao.dia_fechamento >= 1 && cartao.dia_fechamento <= 31 &&
      ehInteiro(cartao.dia_vencimento) && cartao.dia_vencimento >= 1 && cartao.dia_vencimento <= 31;
  }

  // ===================================================================================
  // 3. R1 — FATURA DE UMA COMPRA NO CARTÃO
  // ===================================================================================

  /**
   * Calcula fechamento e vencimento a partir do MÊS de fechamento (ano, mes).
   * Usado por fatura() e pelas parcelas (que só andam o mês de fechamento para frente).
   *
   * R1, vencimento: se V > F -> dia V do mesmo mês do fechamento;
   *                 se V ≤ F -> dia V do mês seguinte ao fechamento.
   * A comparação V > F usa os dias CADASTRADOS (não os ajustados ao fim do mês).
   * Dia inexistente vira último dia do mês (seção 2).
   */
  function faturaPeloMesDeFechamento(cartao, anoF, mesF) {
    var F = cartao.dia_fechamento, V = cartao.dia_vencimento;
    var fechamento = dataNoMes(anoF, mesF, F);
    var mesV = textoMes(anoF, mesF);
    if (V <= F) mesV = somaMes(mesV, 1);
    var mv = lerMes(mesV);
    return { mes: mesV, vencimento: dataNoMes(mv.ano, mv.mes, V), fechamento: fechamento };
  }

  /**
   * Regras.fatura(cartao, dataCompra)
   *   -> { mes: "2026-10", vencimento: "2026-10-05", fechamento: "2026-09-28" } | null
   *
   * R1. Compra no dia D do mês M, cartão que fecha dia F:
   *   - D < F  -> fecha no dia F do mês M;
   *   - D ≥ F  -> fecha no dia F do mês M+1 (compra no próprio dia do fechamento já vai
   *     para a fatura seguinte).
   *   Se F não existe no mês (ex.: F=31 em fevereiro), o fechamento é o último dia do mês
   *   e a comparação é feita com esse último dia (compra 10/02 com F=31 -> fecha 28/02;
   *   compra 28/02 com F=31 -> já é dia de fechamento -> fecha 31/03).
   * `mes` identifica a fatura: é o mês do VENCIMENTO.
   * Devolve null quando: cartao é null, não é registro de cartão, falta dia de fechamento
   * ou de vencimento ("NÃO INFORMADO"), ou a data da compra é inválida/ausente.
   */
  function fatura(cartao, dataCompra) {
    if (!cartao || (cartao.tipo != null && cartao.tipo !== "cartao")) return null;
    if (!cartaoTemDatas(cartao)) return null;
    var d = lerData(dataCompra);
    if (!d) return null;
    var Fefetivo = Math.min(cartao.dia_fechamento, ultimoDia(d.ano, d.mes));
    var mesF = textoMes(d.ano, d.mes);
    if (d.dia >= Fefetivo) mesF = somaMes(mesF, 1);
    var mf = lerMes(mesF);
    return faturaPeloMesDeFechamento(cartao, mf.ano, mf.mes);
  }

  // ===================================================================================
  // 4. R2 — PARCELAS
  // ===================================================================================

  /**
   * Quantas parcelas e quanto vale cada uma, para um lançamento.
   *   - "parcelado" com parcelas ≥ 2: divide valor_total (R2: "valor_total manda").
   *     Se valor_total estiver ausente mas `valor` (valor da parcela) existir, usa `valor`
   *     em cada parcela (é o valor gravado, não suposição) e marca valorTotalAusente.
   *   - "unico" (ou qualquer outra coisa): 1 parcela com `valor`.
   *   - "parcelado" com número de parcelas ausente/inválido: tratado como 1 parcela e
   *     marcado parcelasInvalidas (a tela pode avisar).
   * valores = null quando não há valor nenhum gravado.
   */
  function valoresDoLancamento(lanc) {
    var parcelado = lanc.repeticao === "parcelado";
    var n = lanc.parcelas;
    var aviso = { valorTotalAusente: false, parcelasInvalidas: false };
    if (parcelado && ehInteiro(n) && n >= 2) {
      if (ehInteiro(lanc.valor_total) && lanc.valor_total >= 0) {
        return { n: n, total: lanc.valor_total, valores: dividirParcelas(lanc.valor_total, n), parcelado: true, aviso: aviso };
      }
      aviso.valorTotalAusente = true;
      if (ehInteiro(lanc.valor) && lanc.valor >= 0) {
        var vs = [];
        for (var i = 0; i < n; i++) vs.push(lanc.valor);
        return { n: n, total: lanc.valor * n, valores: vs, parcelado: true, aviso: aviso };
      }
      return { n: n, total: null, valores: null, parcelado: true, aviso: aviso };
    }
    if (parcelado) aviso.parcelasInvalidas = true;
    var v = ehInteiro(lanc.valor) ? lanc.valor : (parcelado && ehInteiro(lanc.valor_total) ? lanc.valor_total : null);
    return { n: 1, total: v, valores: v == null ? null : [v], parcelado: false, aviso: aviso };
  }

  /** hoje é uma data válida? (todas as funções aceitam hoje inválido, mas aí "vencida" fica null) */
  function hojeOk(hoje) {
    return lerData(hoje) != null;
  }

  /**
   * Monta as parcelas de um lançamento usando um índice já pronto (uso interno).
   * Ver comentário de Regras.parcelasDe para o formato.
   */
  function parcelasComIndice(lanc, idx, hoje) {
    var info = infoMeio(idx, lanc.meio);
    var vals = valoresDoLancamento(lanc);
    var mesCompra = mesDe(lanc.data_compra);
    var temDatas = info.tipo === "cartao" && cartaoTemDatas(info.cartao);
    var base = temDatas ? fatura(info.cartao, lanc.data_compra) : null;
    var baseFech = base ? lerData(base.fechamento) : null;
    var ok = hojeOk(hoje);
    var lista = [];

    for (var k = 1; k <= vals.n; k++) {
      // R2: parcela k cai na fatura da compra + (k-1) meses (anda o mês de fechamento)
      var fat = null;
      if (base) {
        var mf = lerMes(somaMes(textoMes(baseFech.ano, baseFech.mes), k - 1));
        fat = faturaPeloMesDeFechamento(info.cartao, mf.ano, mf.mes);
      }
      // R2 (ajuste de 31/10/2026, pedido do Lucian): compra PARCELADA em cartão com datas
      // pesa no mês do VENCIMENTO da fatura de cada parcela — o mesmo mês e o mesmo número
      // de parcela que aparecem na fatura do banco. Compra única continua no mês da compra.
      // Sem fatura conhecida (cartão sem datas, Pix, dinheiro): mês da compra + (k-1), como antes.
      var competencia;
      if (vals.parcelado && fat) competencia = fat.mes;
      else competencia = mesCompra ? somaMes(mesCompra, k - 1) : null;
      // R2: vencida = vencimento da fatura ≤ hoje. Sem fatura: vencida quando o mês de
      // competência já começou (dia 1 do mês ≤ hoje).
      var vencida = null;
      if (ok) {
        if (fat) vencida = fat.vencimento <= hoje;
        else if (competencia) vencida = (competencia + "-01") <= hoje;
      }
      lista.push({
        k: k,
        n: vals.n,
        valor: vals.valores ? vals.valores[k - 1] : null,
        competencia: competencia,
        fatura: fat,
        vencimento: fat ? fat.vencimento : null,
        vencida: vencida,
        ehCartao: info.tipo === "cartao",
        semDatas: info.tipo === "cartao" && !temDatas,
        cartao_id: info.tipo === "cartao" ? info.id : null,
        lancamento_id: lanc.id != null ? lanc.id : null
      });
    }
    return lista;
  }

  /**
   * Regras.parcelasDe(lancamento, registros, hoje) -> lista de parcelas
   *
   * Funciona também para compra única (devolve 1 item com k=1, n=1).
   * Cada item:
   *   k, n            número da parcela e total de parcelas
   *   valor           centavos desta parcela (sobra na 1ª — seção 2) ou null se sem valor
   *   competencia     "AAAA-MM" em que a parcela pesa no gasto (R2) ou null se sem data_compra
   *   fatura          {mes, vencimento, fechamento} desta parcela, ou null (sem cartão / cartão sem datas)
   *   vencimento      atalho para fatura.vencimento (ou null)
   *   vencida         true/false conforme R2; null se `hoje` inválido ou sem data de compra
   *   ehCartao        a compra foi num cartão cadastrado
   *   semDatas        cartão sem dia de fechamento ou de vencimento ("NÃO INFORMADO")
   *   cartao_id       id do cartão ou null
   *   lancamento_id   id do lançamento
   * Lançamento ausente ou apagado -> lista vazia.
   */
  function parcelasDe(lancamento, registros, hoje) {
    if (!lancamento || lancamento.apagado === true || lancamento.tipo === "historico") return [];
    return parcelasComIndice(lancamento, indexar(registros), hoje);
  }

  /**
   * Resumo das parcelas de uma compra, contado pelas DATAS (R2, compras do casal):
   *   pagas = vencidas; faltam = n − pagas; próxima = primeira não vencida.
   */
  function resumoPorVencimento(parcelas) {
    var pagas = 0, valorVencido = 0, valorAVencer = 0, proxima = null;
    for (var i = 0; i < parcelas.length; i++) {
      var p = parcelas[i];
      var v = p.valor || 0;
      if (p.vencida === true) { pagas++; valorVencido += v; }
      else {
        valorAVencer += v;
        if (!proxima) proxima = { k: p.k, n: p.n, data: p.vencimento, competencia: p.competencia, valor: p.valor };
      }
    }
    return { vencidas: pagas, aVencer: parcelas.length - pagas, valorVencido: valorVencido, valorAVencer: valorAVencer, proxima: proxima };
  }

  /** Porcentagem com 1 casa (60.4). Divisor zero -> null. */
  function pct(parte, todo) {
    if (!todo) return null;
    return Math.round((parte / todo) * 1000) / 10;
  }

  // ===================================================================================
  // 5. R3, R4, R5 — RESUMO DO MÊS
  // ===================================================================================

  /**
   * Conta fixa vale no mês?  R3: inicio ≤ mês ≤ fim (fim null = sem fim).
   * Interpretação conservadora (ver relatório):
   *   - se o mês tem confirmação (dinheiro real gasto), a conta conta sempre;
   *   - sem confirmação, só conta se ativo !== false e o mês está entre inicio e fim;
   *   - inicio ausente = sem limite de começo (não se inventa uma data).
   */
  function fixaValeNoMes(cf, mes, confirmada) {
    if (confirmada) return true;
    return valeNoPeriodo(cf, mes);
  }

  /**
   * Conta fixa ou fonte gera a ocorrência PREVISTA no mês? (vale para as duas)
   *   - mês precisa estar entre inicio e fim (inicio ausente = sem limite; fim null = sem fim);
   *   - ativo:false SEM fim  -> não gera mais nada (comportamento antigo);
   *   - ativo:false COM fim  -> continua valendo normalmente de inicio até fim
   *     (ajuste do encarregado: desativar não mexe no passado).
   */
  function valeNoPeriodo(reg, mes) {
    var temFim = lerMes(reg.fim) != null;
    if (reg.ativo === false && !temFim) return false;
    if (lerMes(reg.inicio) && mes < reg.inicio) return false;
    if (temFim && mes > reg.fim) return false;
    return true;
  }

  /** Acha a confirmação de uma conta fixa no mês (pelo id determinístico; se não, pelos campos). */
  function acharConfirmacaoFixa(idx, cf, mes) {
    var id = "cf:" + cf.id + ":" + mes;
    var r = buscar(idx, id, "fixa_confirmada");
    if (r) return r;
    var todas = idx.tipo("fixa_confirmada");
    for (var i = 0; i < todas.length; i++) {
      if (todas[i].conta_fixa_id === cf.id && todas[i].mes === mes) return todas[i];
    }
    return null;
  }

  /**
   * Todas as ocorrências de contas fixas de um mês (uso interno; R3 e R6).
   *
   * 1) Para cada conta fixa VIVA: confirmada no mês -> entra com o valor real;
   *    sem confirmação -> entra com o previsto se estiver valendo (fixaValeNoMes).
   * 2) Para cada `fixa_confirmada` VIVA do mês que não foi usada no passo 1 (a conta foi
   *    para a lixeira, ou nem existe mais): entra SEMPRE, com o valor real — foi dinheiro
   *    gasto de verdade. Nome, categoria, meio e lancado_por vêm da conta fixa mesmo apagada
   *    (procurada no índice de todos). Conta fixa apagada NÃO gera ocorrência prevista.
   * Cada item: {conta_fixa_id, nome, dia, dataPrevista, previsto, real, valor, confirmada,
   *             data_pagamento, categoria_id, meio, lancado_por, id_confirmacao,
   *             contaNaLixeira, _criado}
   */
  function ocorrenciasFixas(idx, mes) {
    var lista = [], usadas = {};
    var contas = idx.tipo("conta_fixa");
    for (var c = 0; c < contas.length; c++) {
      var cf = contas[c];
      var conf = acharConfirmacaoFixa(idx, cf, mes);
      if (!fixaValeNoMes(cf, mes, !!conf)) continue;
      if (conf) usadas[conf.id] = true;
      lista.push(montarOcorrenciaFixa(cf, conf, mes, cf.id));
    }
    var confs = idx.tipo("fixa_confirmada");
    for (var i = 0; i < confs.length; i++) {
      var cn = confs[i];
      if (cn.mes !== mes || usadas[cn.id]) continue;
      usadas[cn.id] = true;
      var cfTodos = buscarTodos(idx, cn.conta_fixa_id, "conta_fixa");
      lista.push(montarOcorrenciaFixa(cfTodos || {}, cn, mes, cn.conta_fixa_id != null ? cn.conta_fixa_id : null));
    }
    return lista;
  }

  function montarOcorrenciaFixa(cf, conf, mes, idConta) {
    var previsto = ehInteiro(cf.valor_previsto) ? cf.valor_previsto : null;
    var real = conf && ehInteiro(conf.valor_real) ? conf.valor_real : null;
    return {
      conta_fixa_id: idConta,
      nome: cf.nome != null ? cf.nome : null,
      dia: ehInteiro(cf.dia) ? cf.dia : null,
      dataPrevista: dataDoMes(mes, cf.dia),
      previsto: previsto,
      real: real,
      // R3: valor_real da confirmação se existir, senão valor_previsto
      valor: real != null ? real : previsto,
      confirmada: !!conf,
      data_pagamento: conf && conf.data_pagamento != null ? conf.data_pagamento : null,
      categoria_id: cf.categoria_id != null ? cf.categoria_id : null,
      meio: cf.meio != null ? cf.meio : null,
      // R3: lancado_por da conta fixa = quem criou a conta fixa (confirmação não muda)
      lancado_por: cf.lancado_por != null ? cf.lancado_por : null,
      id_confirmacao: conf && conf.id != null ? conf.id : "cf:" + idConta + ":" + mes,
      contaNaLixeira: cf.id == null || cf.apagado === true,
      _criado: cf.criado_em
    };
  }

  /** Acha a confirmação de uma ocorrência de receita (pelo id; se não, pelos campos). */
  function acharConfirmacaoReceita(idx, fonte, mes, n) {
    var id = "rc:" + fonte.id + ":" + mes + ":" + n;
    var r = buscar(idx, id, "receita_confirmada");
    if (r) return r;
    var todas = idx.tipo("receita_confirmada");
    for (var i = 0; i < todas.length; i++) {
      var c = todas[i];
      if (c.fonte_id === fonte.id && c.mes === mes && c.ocorrencia === n) return c;
    }
    return null;
  }

  /** Ordena itens: data mais recente primeiro; sem data vai para o fim. */
  function maisRecentePrimeiro(a, b) {
    if (a.data !== b.data) {
      if (a.data == null) return 1;
      if (b.data == null) return -1;
      return a.data < b.data ? 1 : -1;
    }
    var ca = a._criado || "", cb = b._criado || "";
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? -1 : 1;
  }

  /**
   * Regras.resumoMes(registros, mes, hoje) -> objeto do mês "AAAA-MM"
   *
   *   entrou      R4: soma das ocorrências CONFIRMADAS (valor_recebido) + receitas avulsas do mês
   *   aReceber    R4: soma do previsto das ocorrências NÃO confirmadas
   *   previsto    R4: previsto de todas as ocorrências + avulsas recebidas
   *   gastou      R3: compras do casal + parcelas do casal + contas fixas (nunca terceiros)
   *   sobrou      R5: entrou − gastou (pode ser negativo)
   *   totalParcelas  quanto do "gastou" é parcela (para "Total inclui R$ X de parcelas")
   *   totalFixas     quanto do "gastou" é conta fixa
   *   porCategoria [{categoria_id, nome, total}]   maior primeiro; categoria ausente -> id e nome null
   *   porPessoa    [{nome, total, pct}]            por `lancado_por`; os dois nomes do casal
   *                (registro "ajuste:casal") aparecem mesmo com 0; pct com 1 casa (60.4),
   *                null se gastou = 0; lancado_por ausente -> nome null
   *   receitas    [{fonte_id, nome, de, ocorrencia, totalOcorrencias, dia, dataPrevista,
   *                 previsto, recebido|null, data|null, confirmada, id_confirmacao,
   *                 foraDosDias, fonteNaLixeira}]
   *                uma por dia da fonte (quinzenal = 2). id_confirmacao é o id que a tela
   *                deve usar ao gravar a receita_confirmada.
   *                Receita CONFIRMADA sempre aparece, mesmo com a fonte na lixeira ou com dias
   *                mudados: nesse caso foraDosDias=true, previsto/dia/dataPrevista = null.
   *   avulsas     [{id, fonte_id, nome, descricao, recebido, data}]  receitas avulsas do mês
   *   fixas       [{conta_fixa_id, nome, dia, dataPrevista, previsto, real|null, valor,
   *                 confirmada, data_pagamento|null, categoria_id, meio, lancado_por, id_confirmacao,
   *                 contaNaLixeira}]
   *                valor = o que entrou no gastou (real se confirmada, senão previsto).
   *                Confirmação de conta fixa que foi para a lixeira continua aqui
   *                (contaNaLixeira=true), com nome/categoria/meio da conta apagada.
   *   fixasResumo {previsto, confirmado, quantidade, confirmadas}
   *                previsto = soma dos previstos; confirmado = soma dos reais confirmados
   *   itens       [{id, tipoItem: "unico"|"parcela"|"fixa", descricao, data, data_compra, valor,
   *                 categoria_id, categoria, meio_id, meio, lancado_por, rotulo, k, n}]
   *                mais recente primeiro. data = dia em que o item pesa no mês:
   *                compra única -> data_compra; parcela -> mesmo dia da compra no mês de
   *                competência; conta fixa -> data_pagamento se confirmada, senão o dia previsto.
   *                Para conta fixa, id = id da conta fixa. Nomes ausentes -> null.
   * Mês inválido -> null.
   */
  function resumoMes(registros, mes, hoje) {
    if (!lerMes(mes)) return null;
    var idx = indexar(registros);
    var itens = [];
    var gastou = 0, totalParcelas = 0, totalFixas = 0;

    // --- R3: lançamentos do casal (únicos e parcelas) ---
    var lancs = idx.tipo("lancamento");
    for (var i = 0; i < lancs.length; i++) {
      var l = lancs[i];
      if (l.de_quem !== "casal") continue; // compra de terceiro NUNCA entra no Gastou (R3)
      var parcelas = parcelasComIndice(l, idx, hoje);
      var info = infoMeio(idx, l.meio);
      for (var p = 0; p < parcelas.length; p++) {
        var pc = parcelas[p];
        if (pc.competencia !== mes) continue;
        var valor = pc.valor || 0;
        gastou += valor;
        var ehParcela = pc.n > 1;
        if (ehParcela) totalParcelas += valor;
        var dc = lerData(l.data_compra);
        var mm = lerMes(mes);
        itens.push({
          id: l.id,
          tipoItem: ehParcela ? "parcela" : "unico",
          descricao: l.descricao != null ? l.descricao : null,
          data: ehParcela ? dataNoMes(mm.ano, mm.mes, dc.dia) : l.data_compra,
          data_compra: l.data_compra != null ? l.data_compra : null,
          valor: pc.valor,
          categoria_id: l.categoria_id != null ? l.categoria_id : null,
          categoria: nomeDe(idx, l.categoria_id),
          meio_id: l.meio != null ? l.meio : null,
          meio: info.nome,
          lancado_por: l.lancado_por != null ? l.lancado_por : null,
          rotulo: ehParcela ? "parcela " + pc.k + "/" + pc.n + " · compra de " + dataCurta(l.data_compra) : null,
          k: pc.k,
          n: pc.n,
          _criado: l.criado_em
        });
      }
    }

    // --- R3: contas fixas (inclusive confirmações de contas que foram para a lixeira) ---
    var fixas = [];
    var fixasResumo = { previsto: 0, confirmado: 0, quantidade: 0, confirmadas: 0 };
    var ocs = ocorrenciasFixas(idx, mes);
    for (var c = 0; c < ocs.length; c++) {
      var oc = ocs[c];
      fixas.push({
        conta_fixa_id: oc.conta_fixa_id,
        nome: oc.nome,
        dia: oc.dia,
        dataPrevista: oc.dataPrevista,
        previsto: oc.previsto,
        real: oc.real,
        valor: oc.valor,
        confirmada: oc.confirmada,
        data_pagamento: oc.data_pagamento,
        categoria_id: oc.categoria_id,
        meio: oc.meio,
        lancado_por: oc.lancado_por,
        id_confirmacao: oc.id_confirmacao,
        contaNaLixeira: oc.contaNaLixeira
      });
      fixasResumo.quantidade++;
      fixasResumo.previsto += oc.previsto || 0;
      if (oc.confirmada) { fixasResumo.confirmadas++; fixasResumo.confirmado += oc.real || 0; }
      gastou += oc.valor || 0;
      totalFixas += oc.valor || 0;
      itens.push({
        id: oc.conta_fixa_id,
        tipoItem: "fixa",
        descricao: oc.nome,
        data: lerData(oc.data_pagamento) ? oc.data_pagamento : oc.dataPrevista,
        data_compra: null,
        valor: oc.valor,
        categoria_id: oc.categoria_id,
        categoria: nomeDe(idx, oc.categoria_id),
        meio_id: oc.meio,
        meio: infoMeio(idx, oc.meio).nome,
        lancado_por: oc.lancado_por,
        rotulo: oc.confirmada ? "conta fixa confirmada" : "conta fixa prevista",
        k: null,
        n: null,
        _criado: oc._criado
      });
    }

    itens.sort(maisRecentePrimeiro);
    for (var t = 0; t < itens.length; t++) delete itens[t]._criado;

    // --- quebra por categoria e por pessoa (R3) ---
    var mapaCat = {}, ordemCat = [];
    var mapaPes = {}, ordemPes = [];
    var ajuste = buscar(idx, "ajuste:casal", "ajuste");
    if (ajuste && Array.isArray(ajuste.nomes)) {
      for (var a = 0; a < ajuste.nomes.length; a++) {
        var nm = ajuste.nomes[a];
        if (!(String(nm) in mapaPes)) { mapaPes[String(nm)] = { nome: nm, total: 0 }; ordemPes.push(String(nm)); }
      }
    }
    for (var it = 0; it < itens.length; it++) {
      var x = itens[it];
      var v = x.valor || 0;
      var chC = x.categoria_id == null ? "\u0000null" : String(x.categoria_id);
      if (!mapaCat[chC]) { mapaCat[chC] = { categoria_id: x.categoria_id, nome: x.categoria, total: 0 }; ordemCat.push(chC); }
      mapaCat[chC].total += v;
      var chP = x.lancado_por == null ? "\u0000null" : String(x.lancado_por);
      if (!mapaPes[chP]) { mapaPes[chP] = { nome: x.lancado_por, total: 0 }; ordemPes.push(chP); }
      mapaPes[chP].total += v;
    }
    var porCategoria = ordemCat.map(function (k) { return mapaCat[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    var porPessoa = ordemPes.map(function (k) {
      return { nome: mapaPes[k].nome, total: mapaPes[k].total, pct: pct(mapaPes[k].total, gastou) };
    }).sort(function (a, b) { return b.total - a.total; });

    // --- R4: receitas ---
    var receitas = [];
    var entrou = 0, aReceber = 0, previstoMes = 0;
    var recUsadas = {}; // confirmações já colocadas numa ocorrência atual
    var fontes = idx.tipo("fonte");
    for (var f = 0; f < fontes.length; f++) {
      var fo = fontes[f];
      var dias = Array.isArray(fo.dias) ? fo.dias.filter(function (d) { return ehInteiro(d) && d >= 1 && d <= 31; }) : [];
      dias = dias.slice().sort(function (a, b) { return a - b; });
      for (var o = 0; o < dias.length; o++) {
        var n = o + 1;
        var confR = acharConfirmacaoReceita(idx, fo, mes, n);
        // Mesma regra das contas fixas: ocorrência confirmada conta sempre; não confirmada
        // só se a fonte vale no mês (valeNoPeriodo: inicio, fim e ativo).
        if (!confR && !valeNoPeriodo(fo, mes)) continue;
        if (confR) recUsadas[confR.id] = true;
        var prev = ehInteiro(fo.valor_previsto) ? fo.valor_previsto : null;
        var receb = confR && ehInteiro(confR.valor_recebido) ? confR.valor_recebido : null;
        previstoMes += prev || 0;
        if (confR) entrou += receb || 0;
        else aReceber += prev || 0;
        receitas.push({
          fonte_id: fo.id,
          nome: fo.nome != null ? fo.nome : null,
          de: fo.de != null ? fo.de : null,
          ocorrencia: n,
          totalOcorrencias: dias.length,
          dia: dias[o],
          dataPrevista: dataDoMes(mes, dias[o]),
          previsto: prev,
          recebido: receb,
          data: confR && confR.data_recebimento != null ? confR.data_recebimento : null,
          confirmada: !!confR,
          id_confirmacao: confR && confR.id != null ? confR.id : "rc:" + fo.id + ":" + mes + ":" + n,
          foraDosDias: false,
          fonteNaLixeira: false
        });
      }
    }
    // R4 (correção do encarregado): receita CONFIRMADA sempre entra no "Entrou" do mês dela,
    // mesmo que a fonte tenha ido para a lixeira, mudado de quinzenal para mensal ou mudado
    // os dias. Aparece como recebida, com a data dela. Como essa ocorrência não está mais no
    // plano atual da fonte, não tem "previsto" (null); no "Previsto do mês" ela soma o valor
    // recebido, igual a uma receita avulsa (assim o previsto nunca fica menor que o que entrou).
    var confsR = idx.tipo("receita_confirmada");
    for (var q = 0; q < confsR.length; q++) {
      var cr = confsR[q];
      if (cr.mes !== mes || recUsadas[cr.id]) continue;
      recUsadas[cr.id] = true;
      var foT = buscarTodos(idx, cr.fonte_id, "fonte") || {};
      var rcb = ehInteiro(cr.valor_recebido) ? cr.valor_recebido : null;
      entrou += rcb || 0;
      previstoMes += rcb || 0;
      receitas.push({
        fonte_id: cr.fonte_id != null ? cr.fonte_id : null,
        nome: foT.nome != null ? foT.nome : null,
        de: foT.de != null ? foT.de : null,
        ocorrencia: ehInteiro(cr.ocorrencia) ? cr.ocorrencia : null,
        totalOcorrencias: null,
        dia: null,
        dataPrevista: null,
        previsto: null,
        recebido: rcb,
        data: cr.data_recebimento != null ? cr.data_recebimento : null,
        confirmada: true,
        id_confirmacao: cr.id,
        foraDosDias: true,
        fonteNaLixeira: foT.id == null || foT.apagado === true
      });
    }
    // R4: receitas avulsas do mês entram no "Entrou" e no "Previsto"
    var avulsas = [];
    var avs = idx.tipo("receita_avulsa");
    for (var r = 0; r < avs.length; r++) {
      var av = avs[r];
      if (mesDe(av.data_recebimento) !== mes) continue;
      var vr = ehInteiro(av.valor_recebido) ? av.valor_recebido : null;
      entrou += vr || 0;
      previstoMes += vr || 0;
      avulsas.push({
        id: av.id,
        fonte_id: av.fonte_id != null ? av.fonte_id : null,
        nome: nomeDe(idx, av.fonte_id),
        descricao: av.descricao != null ? av.descricao : null,
        recebido: vr,
        data: av.data_recebimento
      });
    }
    avulsas.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });

    return {
      mes: mes,
      entrou: entrou,
      aReceber: aReceber,
      previsto: previstoMes,
      gastou: gastou,
      sobrou: entrou - gastou, // R5
      totalParcelas: totalParcelas,
      totalFixas: totalFixas,
      porCategoria: porCategoria,
      porPessoa: porPessoa,
      receitas: receitas,
      avulsas: avulsas,
      fixas: fixas,
      fixasResumo: fixasResumo,
      itens: itens
    };
  }

  // ===================================================================================
  // 6. R6 — FATURAS DE UM MÊS DE VENCIMENTO
  // ===================================================================================

  /**
   * Regras.faturasDoMes(registros, mesVencimento, hoje)
   *   -> { mes, total, totalTerceiros, totalCasal, cartoes:[...], foraDoCalculo:{total, cartoes:[...]} }
   *
   * R6. Para cada cartão: compras únicas + parcelas + contas fixas cuja fatura vence no mês
   * pedido, separando casal e terceiros.
   *   total           soma dos cartões COM datas (casal + terceiros). Cartões sem datas ficam fora.
   *   totalTerceiros  parte do total que é de parentes
   *   totalCasal      parte do total que é do casal
   *   cartoes: um item por cartão (todos: com e sem datas; ordenados por nome). Cartão inativo
   *            ou na lixeira só aparece se tiver algo no mês. Cada item:
   *     cartao          o registro do cartão
   *     cartao_id, nome
   *     apagado         true se o cartão foi para a lixeira (as compras vivas dele continuam
   *                     aqui, calculadas com os dias do cartão apagado, e SOMAM no total)
   *     vencimento      "AAAA-MM-DD" do vencimento deste mês, ou null se cartão sem datas
   *     fechamento      "AAAA-MM-DD" do fechamento desta fatura, ou null
   *     vencida         vencimento ≤ hoje (null se sem datas ou hoje inválido)
   *     total           casal + terceiros deste cartão
   *     casal           soma das compras/parcelas/contas fixas do casal
   *     casalParcelas   quanto de `casal` é parcela ("inclui R$ X de parcelas de vocês")
   *     casalFixas      quanto de `casal` é conta fixa paga neste cartão
   *     itens           TODOS os itens do cartão no mês:
   *                     [{lancamento_id|null, conta_fixa_id|null, descricao, data, k, n, valor,
   *                       de_quem: "casal"|"terceiro", pessoa_id, pessoa, fixa: bool, confirmada|null}]
   *                     data = data da compra (ou, para conta fixa, o dia da conta naquele mês)
   *     terceiros       [{pessoa_id, pessoa (nome|null), lancamento_id, descricao, data_compra, k, n, valor, fixa:false}]
   *                     o nome da pessoa aparece mesmo se ela foi para a lixeira
   *     totalTerceiros  soma de `terceiros`
   *     quantidade      quantos itens caíram no cartão
   *     semDatas        true se falta dia de fechamento ou de vencimento
   *   foraDoCalculo: { total, cartoes:[os mesmos itens, só os semDatas] }
   *     Para cartão sem datas não existe fatura: usa-se a COMPETÊNCIA (mês da compra + k−1,
   *     ou o mês da conta fixa) igual ao mês pedido (R6).
   *
   * Conta fixa paga no cartão (correção do encarregado): cada ocorrência mensal é tratada
   * como compra única com data = dia da conta naquele mês (dataDoMes) e valor = real se
   * confirmada, senão previsto. Conta fixa sem `dia` não tem data -> não entra em cartão com
   * datas (só no "fora do cálculo" se o cartão for sem datas).
   */
  function faturasDoMes(registros, mesVencimento, hoje) {
    if (!lerMes(mesVencimento)) return null;
    var idx = indexar(registros);
    var mapa = {};
    var cartoes = idx.todosDoTipo("cartao"); // inclusive lixeira (correção do encarregado)
    var ok = hojeOk(hoje);
    var mv = lerMes(mesVencimento);

    for (var i = 0; i < cartoes.length; i++) {
      var c = cartoes[i];
      var temDatas = cartaoTemDatas(c);
      var venc = null, fech = null;
      if (temDatas) {
        venc = dataNoMes(mv.ano, mv.mes, c.dia_vencimento);
        // mês do fechamento desta fatura: mesmo mês se V > F, mês anterior se V ≤ F (R1 ao contrário)
        var mesF = c.dia_vencimento > c.dia_fechamento ? mesVencimento : somaMes(mesVencimento, -1);
        var mf = lerMes(mesF);
        fech = dataNoMes(mf.ano, mf.mes, c.dia_fechamento);
      }
      mapa[c.id] = {
        cartao: c,
        cartao_id: c.id,
        nome: c.nome != null ? c.nome : null,
        apagado: c.apagado === true,
        vencimento: venc,
        fechamento: fech,
        vencida: venc && ok ? venc <= hoje : null,
        total: 0,
        casal: 0,
        casalParcelas: 0,
        casalFixas: 0,
        itens: [],
        terceiros: [],
        totalTerceiros: 0,
        quantidade: 0,
        semDatas: !temDatas
      };
    }

    // --- compras e parcelas ---
    var lancs = idx.tipo("lancamento");
    for (var j = 0; j < lancs.length; j++) {
      var l = lancs[j];
      var info = infoMeio(idx, l.meio);
      if (info.tipo !== "cartao" || !mapa[info.id]) continue; // R1: meio que não é cartão não tem fatura
      var item = mapa[info.id];
      var parcelas = parcelasComIndice(l, idx, hoje);
      for (var p = 0; p < parcelas.length; p++) {
        var pc = parcelas[p];
        var entra = item.semDatas ? pc.competencia === mesVencimento : (pc.fatura && pc.fatura.mes === mesVencimento);
        if (!entra) continue;
        var v = pc.valor || 0;
        var ehTerceiro = l.de_quem === "terceiro";
        item.quantidade++;
        item.total += v;
        item.itens.push({
          lancamento_id: l.id,
          conta_fixa_id: null,
          descricao: l.descricao != null ? l.descricao : null,
          data: l.data_compra != null ? l.data_compra : null,
          k: pc.k,
          n: pc.n,
          valor: pc.valor,
          de_quem: ehTerceiro ? "terceiro" : "casal",
          pessoa_id: ehTerceiro && l.pessoa_id != null ? l.pessoa_id : null,
          pessoa: ehTerceiro ? nomeDe(idx, l.pessoa_id) : null,
          fixa: false,
          confirmada: null
        });
        if (ehTerceiro) {
          item.totalTerceiros += v;
          item.terceiros.push({
            pessoa_id: l.pessoa_id != null ? l.pessoa_id : null,
            pessoa: nomeDe(idx, l.pessoa_id), // busca também na lixeira
            lancamento_id: l.id,
            descricao: l.descricao != null ? l.descricao : null,
            data_compra: l.data_compra != null ? l.data_compra : null,
            k: pc.k,
            n: pc.n,
            valor: pc.valor,
            fixa: false
          });
        } else {
          // de_quem "casal" (ou ausente: tratado como do casal, que é quem paga o cartão)
          item.casal += v;
          if (pc.n > 1) item.casalParcelas += v;
        }
      }
    }

    // --- contas fixas pagas no cartão ---
    // Uma ocorrência do mês M pode vencer em M, M+1 ou M+2 (compra depois do fechamento e
    // vencimento no mês seguinte ao fechamento). Por isso olha os meses M−2, M−1 e M.
    for (var d = -2; d <= 0; d++) {
      var mesOc = somaMes(mesVencimento, d);
      var ocs = ocorrenciasFixas(idx, mesOc);
      for (var o = 0; o < ocs.length; o++) {
        var oc = ocs[o];
        var infoF = infoMeio(idx, oc.meio);
        if (infoF.tipo !== "cartao" || !mapa[infoF.id]) continue;
        var itF = mapa[infoF.id];
        var dataOc = dataDoMes(mesOc, oc.dia);
        var entraF;
        if (itF.semDatas) entraF = mesOc === mesVencimento;
        else {
          var fat = dataOc ? fatura(itF.cartao, dataOc) : null;
          entraF = !!fat && fat.mes === mesVencimento;
        }
        if (!entraF) continue;
        var vf = oc.valor || 0;
        itF.quantidade++;
        itF.total += vf;
        itF.casal += vf;
        itF.casalFixas += vf;
        itF.itens.push({
          lancamento_id: null,
          conta_fixa_id: oc.conta_fixa_id,
          descricao: oc.nome,
          data: dataOc,
          k: 1,
          n: 1,
          valor: oc.valor,
          de_quem: "casal",
          pessoa_id: null,
          pessoa: null,
          fixa: true,
          confirmada: oc.confirmada
        });
      }
    }

    var lista = [];
    for (var id in mapa) {
      if (!Object.prototype.hasOwnProperty.call(mapa, id)) continue;
      var it = mapa[id];
      if ((it.cartao.ativo === false || it.apagado) && it.quantidade === 0) continue;
      it.terceiros.sort(function (a, b) {
        return String(a.pessoa || "").localeCompare(String(b.pessoa || ""), "pt-BR");
      });
      it.itens.sort(function (a, b) {
        return String(a.data || "") < String(b.data || "") ? -1 : String(a.data || "") > String(b.data || "") ? 1 : 0;
      });
      lista.push(it);
    }
    lista.sort(function (a, b) {
      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { numeric: true });
    });

    var total = 0, totalTerceiros = 0, totalCasal = 0, fora = [], totalFora = 0;
    for (var k = 0; k < lista.length; k++) {
      if (lista[k].semDatas) { fora.push(lista[k]); totalFora += lista[k].total; }
      else { total += lista[k].total; totalTerceiros += lista[k].totalTerceiros; totalCasal += lista[k].casal; }
    }
    return {
      mes: mesVencimento,
      total: total,
      totalTerceiros: totalTerceiros,
      totalCasal: totalCasal,
      cartoes: lista,
      foraDoCalculo: { total: totalFora, cartoes: fora }
    };
  }

  // ===================================================================================
  // 7. R7 — PARENTES
  // ===================================================================================

  /**
   * Quantas parcelas o parente já cobriu com o que pagou para a compra.
   * Contrato: floor(pago / valor da parcela), limitado a n. Como a 1ª parcela pode ter
   * centavos a mais (seção 2), a conta é feita somando parcela por parcela em ordem até
   * o dinheiro acabar — dá o mesmo resultado do floor quando as parcelas são iguais.
   */
  function parcelasCobertas(parcelas, pago) {
    var acum = 0, q = 0;
    for (var i = 0; i < parcelas.length; i++) {
      var v = parcelas[i].valor;
      if (v == null) break;
      if (acum + v > pago) break;
      acum += v;
      q++;
    }
    return q;
  }

  /** Aceita a pessoa como registro ou como id. */
  function resolverPessoa(pessoa, idx) {
    if (pessoa == null) return null;
    // procura também na lixeira: pessoa apagada com dívida viva continua aparecendo
    if (typeof pessoa === "string") return buscarTodos(idx, pessoa, "pessoa") || { id: pessoa, nome: null, whatsapp: null };
    return pessoa;
  }

  /**
   * Monta o resumo de uma pessoa com índice pronto (uso interno). Ver Regras.resumoPessoa.
   */
  function resumoPessoaComIndice(pessoa, idx, hoje) {
    var pid = pessoa.id;

    // pagamentos da pessoa, agrupados por ref_id.
    // Correção do encarregado: se o ref_id aponta para uma compra/empréstimo que foi para a
    // lixeira (ou que não existe), o dinheiro foi recebido do mesmo jeito -> o pagamento
    // passa a contar como pagamento SOLTO (abate do total da pessoa) e gera um aviso.
    var pagsTodos = idx.tipo("pagamento").filter(function (p) { return p.pessoa_id === pid; });
    var pagoPorRef = {};
    var totalPago = 0;
    var pagamentosSoltos = 0;
    var avisos = [];
    var situacaoRef = {}; // id do pagamento -> {tipo, situacao}
    for (var i = 0; i < pagsTodos.length; i++) {
      var pg = pagsTodos[i];
      var v = ehInteiro(pg.valor) ? pg.valor : 0;
      totalPago += v;
      var sit = { tipo: null, situacao: null };
      if (pg.ref_id != null) {
        var refT = idx.todosPorId[pg.ref_id];
        sit.tipo = !refT ? "desconhecido" : (refT.tipo === "lancamento" ? "compra" : (refT.tipo === "emprestimo" ? "emprestimo" : "desconhecido"));
        if (sit.tipo === "desconhecido") sit.situacao = "desconhecido";
        else sit.situacao = refT.apagado === true ? "lixeira" : "vivo";
      }
      situacaoRef[pg.id] = sit;
      if (sit.situacao === "vivo") {
        pagoPorRef[pg.ref_id] = (pagoPorRef[pg.ref_id] || 0) + v;
      } else {
        pagamentosSoltos += v;
        if (sit.situacao === "lixeira") {
          avisos.push("Pagamento de " + dinheiro(v) + " ligado a " + (sit.tipo === "compra" ? "uma compra" : "um empréstimo") + " que foi para a lixeira");
        } else if (sit.situacao === "desconhecido") {
          avisos.push("Pagamento de " + dinheiro(v) + " ligado a um registro que não foi encontrado");
        }
      }
    }

    // compras de terceiro desta pessoa
    var compras = [];
    var totalCompras = 0;
    var lancs = idx.tipo("lancamento");
    for (var j = 0; j < lancs.length; j++) {
      var l = lancs[j];
      if (l.de_quem !== "terceiro" || l.pessoa_id !== pid) continue;
      var parcelas = parcelasComIndice(l, idx, hoje);
      var vals = valoresDoLancamento(l);
      var porData = resumoPorVencimento(parcelas);
      var pago = pagoPorRef[l.id] || 0;
      var total = vals.total || 0;
      var cobertas = Math.min(parcelasCobertas(parcelas, pago), vals.n);
      // próxima "a pagar" pelo parente = a parcela logo depois das que ele já cobriu
      var proxAPagar = cobertas < parcelas.length ? parcelas[cobertas] : null;
      var info = infoMeio(idx, l.meio);
      totalCompras += total;
      compras.push({
        id: l.id,
        descricao: l.descricao != null ? l.descricao : null,
        data_compra: l.data_compra != null ? l.data_compra : null,
        meio_id: l.meio != null ? l.meio : null,
        meio: info.nome,
        ehCartao: info.tipo === "cartao",
        parcelado: vals.parcelado,
        n: vals.n,
        total: vals.total,
        valorParcela: vals.parcelado ? (ehInteiro(l.valor) ? l.valor : (vals.valores ? vals.valores[vals.n - 1] : null)) : vals.total,
        parcelas: parcelas,
        // contado pelas DATAS (R2): quantas já venceram no cartão
        vencidas: porData.vencidas,
        aVencer: porData.aVencer,
        valorVencido: porData.valorVencido,
        valorAVencer: porData.valorAVencer,
        proxima: porData.proxima,           // primeira parcela ainda não vencida
        // contado pelo que o PARENTE PAGOU (R7)
        pago: pago,
        pagasParente: cobertas,             // "parcelas pagas pelo parente"
        faltamParente: vals.n - cobertas,
        falta: Math.max(0, total - pago),
        pagoAMais: Math.max(0, pago - total),
        proximaAPagar: proxAPagar ? { k: proxAPagar.k, n: proxAPagar.n, data: proxAPagar.vencimento, competencia: proxAPagar.competencia, valor: proxAPagar.valor } : null,
        pctPago: total ? Math.round(Math.min(pago, total) / total * 100) : null,
        datasPagas: parcelas.slice(0, cobertas).map(function (x) { return x.vencimento; }),
        valorTotalAusente: vals.aviso.valorTotalAusente
      });
    }
    compras.sort(function (a, b) { return String(a.data_compra || "") < String(b.data_compra || "") ? -1 : 1; });

    // empréstimos de dinheiro
    var emprestimos = [];
    var totalEmprestimos = 0;
    var emps = idx.tipo("emprestimo").filter(function (e) { return e.pessoa_id === pid; });
    for (var e = 0; e < emps.length; e++) {
      var em = emps[e];
      var valorE = ehInteiro(em.valor) ? em.valor : null;
      var pagoE = pagoPorRef[em.id] || 0;
      totalEmprestimos += valorE || 0;
      var pagsE = pagsTodos.filter(function (p) { return p.ref_id === em.id; })
        .map(function (p) { return { id: p.id, data: p.data != null ? p.data : null, valor: ehInteiro(p.valor) ? p.valor : null }; });
      emprestimos.push({
        id: em.id,
        data: em.data != null ? em.data : null,
        descricao: em.descricao != null ? em.descricao : null,
        valor: valorE,
        pago: pagoE,
        falta: Math.max(0, (valorE || 0) - pagoE),
        situacao: pagoE <= 0 ? "sem pagamento" : (pagoE >= (valorE || 0) ? "quitado" : "parcialmente pago"),
        pagamentos: pagsE
      });
    }
    emprestimos.sort(function (a, b) { return String(a.data || "") < String(b.data || "") ? -1 : 1; });

    // lista de pagamentos, mais recente primeiro, dizendo a que cada um se refere
    var pagamentos = pagsTodos.map(function (p) {
      var sit = situacaoRef[p.id] || { tipo: null, situacao: null };
      return {
        id: p.id,
        data: p.data != null ? p.data : null,
        valor: ehInteiro(p.valor) ? p.valor : null,
        ref_id: p.ref_id != null ? p.ref_id : null,
        ref_tipo: sit.tipo,         // "compra" | "emprestimo" | "desconhecido" | null (sem ligação)
        ref_situacao: sit.situacao, // "vivo" | "lixeira" | "desconhecido" | null
        contaComoSolto: sit.situacao !== "vivo", // abate do total geral da pessoa
        observacao: p.observacao != null ? p.observacao : null
      };
    }).sort(function (a, b) { return String(a.data || "") < String(b.data || "") ? 1 : -1; });

    // R7: deve = Σ compras + Σ empréstimos − Σ TODOS os pagamentos dela; nunca abaixo de 0.
    var saldo = totalCompras + totalEmprestimos - totalPago;

    // próxima parcela da pessoa: a mais cedo entre as "próximas a pagar" das compras
    var proximaParcela = null;
    for (var c = 0; c < compras.length; c++) {
      var pp = compras[c].proximaAPagar;
      if (pp && pp.data && (!proximaParcela || pp.data < proximaParcela.data)) {
        proximaParcela = { data: pp.data, k: pp.k, n: pp.n, valor: pp.valor, lancamento_id: compras[c].id, descricao: compras[c].descricao };
      }
    }
    return {
      pessoa: pessoa,
      deve: Math.max(0, saldo),
      credito: Math.max(0, -saldo),
      saldo: saldo,
      totalCompras: totalCompras,
      totalEmprestimos: totalEmprestimos,
      totalPago: totalPago,
      pagamentosSoltos: pagamentosSoltos,
      avisos: avisos,
      compras: compras,
      emprestimos: emprestimos,
      pagamentos: pagamentos,
      proximaParcela: proximaParcela
    };
  }

  /**
   * Regras.resumoPessoa(pessoa, registros, hoje) -> resumo de um parente (R7)
   *   pessoa: o registro da pessoa (ou só o id dela)
   *
   *   deve              quanto deve (nunca negativo)
   *   credito           se pagou a mais, quanto (senão 0) — a tela mostra "crédito de R$ X"
   *   saldo             deve − crédito (com sinal)
   *   totalCompras, totalEmprestimos, totalPago,
   *   pagamentosSoltos  pagamentos com ref_id null + os ligados a registro na lixeira/inexistente
   *   compras: [{ id, descricao, data_compra, meio_id, meio, ehCartao, parcelado, n, total,
   *               valorParcela, parcelas:[como parcelasDe],
   *               vencidas, aVencer, valorVencido, valorAVencer, proxima   <- pelas DATAS do cartão
   *               pago, pagasParente, faltamParente, falta, pagoAMais,
   *               proximaAPagar {k, n, data, competencia, valor}|null, pctPago (0–100 inteiro),
   *               datasPagas ["AAAA-MM-DD"...] <- pelo que o PARENTE PAGOU
   *               valorTotalAusente }]
   *   emprestimos: [{ id, data, descricao, valor, pago, falta,
   *                   situacao: "sem pagamento"|"parcialmente pago"|"quitado", pagamentos:[{id,data,valor}] }]
   *   pagamentos: [{ id, data, valor, ref_id, ref_tipo, ref_situacao, contaComoSolto, observacao }]
   *               mais recente primeiro. ref_situacao: "vivo" | "lixeira" | "desconhecido" | null.
   *               Pagamento ligado a compra/empréstimo que foi para a lixeira (ou não existe)
   *               conta como SOLTO (entra em pagamentosSoltos) e gera um aviso.
   *   avisos: ["Pagamento de R$ X ligado a uma compra que foi para a lixeira", ...]
   *   proximaParcela: {data, k, n, valor, lancamento_id, descricao} | null
   *                   = a parcela seguinte às já pagas pelo parente, a de data mais cedo entre as compras
   * Pessoa ausente -> null.
   */
  function resumoPessoa(pessoa, registros, hoje) {
    var idx = indexar(registros);
    var p = resolverPessoa(pessoa, idx);
    if (!p) return null;
    return resumoPessoaComIndice(p, idx, hoje);
  }

  /**
   * Regras.resumoParentes(registros, hoje)
   *   -> { total, totalCredito, pessoas:[{pessoa, deve, credito, rotulo, proxima, parcelasAVencer, situacao}] }
   *   total         soma do que todos devem
   *   totalCredito  soma dos créditos (quem pagou a mais)
   *   pessoas       todas as pessoas cadastradas, quem deve mais primeiro
   *     rotulo           frase curta como no protótipo: "cartão 5/12 + dinheiro", "cartão 2/6 — geladeira",
   *                      "dinheiro emprestado em 02/08", "2 compras", "sem pendências"
   *     proxima          "AAAA-MM-DD" da próxima parcela a pagar pelo parente, ou null
   *     parcelasAVencer  soma de faltamParente das compras (parcelas que o parente ainda não pagou)
   *     situacao         "em aberto" | "parcialmente pago" | "quitado" | "crédito" | "sem pendências"
   *                      | "pessoa na lixeira" (pessoa apagada que ainda tem compra/empréstimo vivo;
   *                      nesse caso pessoa.apagado === true e ela continua somando no total)
   */
  function resumoParentes(registros, hoje) {
    var idx = indexar(registros);
    // Pessoas vivas + pessoas na LIXEIRA que ainda têm compra ou empréstimo vivo
    // (correção do encarregado: o "total que te devem" não pode cair em silêncio).
    var comDivida = {};
    idx.tipo("lancamento").forEach(function (l) { if (l.de_quem === "terceiro" && l.pessoa_id != null) comDivida[l.pessoa_id] = true; });
    idx.tipo("emprestimo").forEach(function (e) { if (e.pessoa_id != null) comDivida[e.pessoa_id] = true; });
    var pessoas = idx.todosDoTipo("pessoa").filter(function (p) {
      return p.apagado !== true || comDivida[p.id];
    });
    var total = 0, totalCredito = 0, lista = [];
    for (var i = 0; i < pessoas.length; i++) {
      var rp = resumoPessoaComIndice(pessoas[i], idx, hoje);
      total += rp.deve;
      totalCredito += rp.credito;
      var partes = [];
      var nc = rp.compras.length, ne = rp.emprestimos.length;
      if (nc === 1) {
        var c0 = rp.compras[0];
        var palavra = c0.ehCartao ? "cartão" : "compra";
        partes.push(c0.parcelado ? palavra + " " + c0.pagasParente + "/" + c0.n : palavra);
      } else if (nc > 1) partes.push(nc + " compras");
      if (ne > 0 && nc > 0) partes.push("dinheiro");
      var rotulo;
      if (nc === 1 && ne === 0) rotulo = partes[0] + (rp.compras[0].descricao ? " — " + rp.compras[0].descricao : "");
      else if (nc === 0 && ne === 1) rotulo = "dinheiro emprestado em " + dataCurta(rp.emprestimos[0].data);
      else if (nc === 0 && ne > 1) rotulo = ne + " empréstimos";
      else if (nc === 0 && ne === 0) rotulo = "sem pendências";
      else rotulo = partes.join(" + ");

      var aVencer = 0;
      for (var c = 0; c < rp.compras.length; c++) aVencer += rp.compras[c].faltamParente;
      var situacao;
      if (pessoas[i].apagado === true) situacao = "pessoa na lixeira";
      else if (nc === 0 && ne === 0 && rp.totalPago === 0) situacao = "sem pendências";
      else if (rp.credito > 0) situacao = "crédito";
      else if (rp.deve === 0) situacao = "quitado";
      else if (rp.totalPago > 0) situacao = "parcialmente pago";
      else situacao = "em aberto";

      lista.push({
        pessoa: pessoas[i],
        deve: rp.deve,
        credito: rp.credito,
        rotulo: rotulo,
        proxima: rp.proximaParcela ? rp.proximaParcela.data : null,
        parcelasAVencer: aVencer,
        situacao: situacao
      });
    }
    lista.sort(function (a, b) {
      return b.deve - a.deve || String(a.pessoa.nome || "").localeCompare(String(b.pessoa.nome || ""), "pt-BR");
    });
    return { total: total, totalCredito: totalCredito, pessoas: lista };
  }

  /**
   * Regras.textoWhatsApp(pessoa, registros, hoje) -> texto pronto para mandar (R7)
   *
   * Formato (igual ao protótipo), uma "bloco" por compra:
   *   Oi, Márcia! Resumo até 19/09/2026:
   *   Tênis — R$ 2.400,00 em 12x de R$ 200,00
   *   Pagas: 5 (R$ 1.000,00)          <- parcelas cobertas pelo que ELA pagou (e quanto pagou)
   *   Faltam: 7 (R$ 1.400,00)         <- n − pagas (e total − pago)
   *   Próxima parcela: 20/10/2026     <- vencimento da parcela seguinte às pagas (some se quitou)
   *   Dinheiro emprestado: R$ 300,00  <- só se houver empréstimo
   *   Total em aberto: R$ 1.700,00
   * Compra única:      "Bolsa — R$ 150,00 (compra de 12/08/2026)" + "Pago: R$ X" se pagou algo.
   * Empréstimo com pagamento: "Dinheiro emprestado: R$ 500,00 (pago R$ 200,00, falta R$ 300,00)".
   * Pagamentos sem ligação (ref_id null): linha "Pagamentos avulsos: R$ X".
   * Pagou a mais: última linha vira "Crédito a seu favor: R$ X".
   * Sem nome: "Oi!". Linhas separadas por "\n".
   */
  function textoWhatsApp(pessoa, registros, hoje) {
    var idx = indexar(registros);
    var p = resolverPessoa(pessoa, idx);
    if (!p) return "";
    var rp = resumoPessoaComIndice(p, idx, hoje);
    var L = [];
    L.push((p.nome ? "Oi, " + p.nome + "!" : "Oi!") + " Resumo até " + dataBR(hoje) + ":");
    for (var i = 0; i < rp.compras.length; i++) {
      var c = rp.compras[i];
      var desc = c.descricao != null ? c.descricao : NAO_INFORMADO;
      if (c.parcelado) {
        L.push(desc + " — " + dinheiro(c.total) + " em " + c.n + "x de " + dinheiro(c.valorParcela));
        L.push("Pagas: " + c.pagasParente + " (" + dinheiro(c.pago) + ")");
        L.push("Faltam: " + c.faltamParente + " (" + dinheiro(c.falta) + ")");
        if (c.proximaAPagar) L.push("Próxima parcela: " + (c.proximaAPagar.data ? dataBR(c.proximaAPagar.data) : mesExtenso(c.proximaAPagar.competencia)));
      } else {
        L.push(desc + " — " + dinheiro(c.total) + " (compra de " + dataBR(c.data_compra) + ")");
        if (c.pago > 0) L.push("Pago: " + dinheiro(c.pago) + (c.falta > 0 ? " (falta " + dinheiro(c.falta) + ")" : ""));
      }
    }
    if (rp.emprestimos.length) {
      var pagoE = 0;
      for (var e = 0; e < rp.emprestimos.length; e++) pagoE += rp.emprestimos[e].pago;
      var linha = "Dinheiro emprestado: " + dinheiro(rp.totalEmprestimos);
      if (pagoE > 0) linha += " (pago " + dinheiro(pagoE) + ", falta " + dinheiro(Math.max(0, rp.totalEmprestimos - pagoE)) + ")";
      L.push(linha);
    }
    if (rp.pagamentosSoltos > 0) L.push("Pagamentos avulsos: " + dinheiro(rp.pagamentosSoltos));
    if (rp.credito > 0) L.push("Crédito a seu favor: " + dinheiro(rp.credito));
    else L.push("Total em aberto: " + dinheiro(rp.deve));
    return L.join("\n");
  }

  /**
   * Regras.linkWhatsApp(pessoa, texto) -> "https://wa.me/55<whatsapp>?text=<texto codificado>" | null
   * O whatsapp é guardado só com dígitos, com DDD, sem o 55 (seção 3). Por segurança,
   * qualquer caractere que não seja dígito é removido. Sem whatsapp -> null.
   */
  function linkWhatsApp(pessoa, texto) {
    if (!pessoa || pessoa.whatsapp == null) return null;
    var num = String(pessoa.whatsapp).replace(/\D/g, "");
    if (!num) return null;
    return "https://wa.me/55" + num + "?text=" + encodeURIComponent(texto == null ? "" : String(texto));
  }

  // ===================================================================================
  // 8. R8 — PARCELAS EM ANDAMENTO
  // ===================================================================================

  /**
   * Regras.parcelasEmAndamento(registros, hoje)
   *   -> { casal:[...], terceiros:[...], aindaDevendo, aindaDevendoTerceiros, proximoMes, mesSeguinte }
   *
   * R8. Só compras PARCELADAS com pelo menos uma parcela ainda não vencida.
   *   casal: [{ id, descricao, data_compra, meio_id, meio, total, n, valorParcela,
   *             pagas (=vencidas), faltam, valorPago, restante, proxima {k,n,data,competencia,valor}|null,
   *             pctPago (0–100 inteiro, pelas parcelas pagas) }]  — próxima mais cedo primeiro
   *   terceiros: mesmos campos (contados pelas DATAS) + pessoa_id, pessoa (nome),
   *             pago, pagasParente, faltamParente, faltaParente, proximaAPagar, pctPagoParente
   *             (contados pelo que o parente pagou — é o que o protótipo mostra: "5 pagas · faltam 7")
   *   aindaDevendo           soma das parcelas não vencidas das compras do CASAL
   *   aindaDevendoTerceiros  soma das parcelas não vencidas das compras de terceiros
   *   proximoMes             soma das parcelas do casal com competência no mês seguinte a hoje
   *   mesSeguinte            "AAAA-MM" desse mês seguinte
   * hoje inválido -> null.
   */
  function parcelasEmAndamento(registros, hoje) {
    if (!hojeOk(hoje)) return null;
    var idx = indexar(registros);
    var mesSeguinte = somaMes(mesDe(hoje), 1);
    var casal = [], terceiros = [];
    var aindaDevendo = 0, aindaDevendoTerceiros = 0, proximoMes = 0;
    var pagosPorRef = {};
    var pags = idx.tipo("pagamento");
    for (var g = 0; g < pags.length; g++) {
      if (pags[g].ref_id != null && ehInteiro(pags[g].valor)) pagosPorRef[pags[g].ref_id] = (pagosPorRef[pags[g].ref_id] || 0) + pags[g].valor;
    }

    var lancs = idx.tipo("lancamento");
    for (var i = 0; i < lancs.length; i++) {
      var l = lancs[i];
      var vals = valoresDoLancamento(l);
      if (!vals.parcelado) continue;
      var parcelas = parcelasComIndice(l, idx, hoje);
      var r = resumoPorVencimento(parcelas);
      var ehCasal = l.de_quem === "casal";
      if (ehCasal) {
        for (var p = 0; p < parcelas.length; p++) if (parcelas[p].competencia === mesSeguinte) proximoMes += parcelas[p].valor || 0;
      }
      if (r.aVencer === 0) continue; // R8: só quem ainda tem parcela a vencer
      var info = infoMeio(idx, l.meio);
      var item = {
        id: l.id,
        descricao: l.descricao != null ? l.descricao : null,
        data_compra: l.data_compra != null ? l.data_compra : null,
        meio_id: l.meio != null ? l.meio : null,
        meio: info.nome,
        total: vals.total,
        n: vals.n,
        valorParcela: ehInteiro(l.valor) ? l.valor : (vals.valores ? vals.valores[vals.n - 1] : null),
        pagas: r.vencidas,
        faltam: r.aVencer,
        valorPago: r.valorVencido,
        restante: r.valorAVencer,
        proxima: r.proxima,
        pctPago: Math.round(r.vencidas / vals.n * 100)
      };
      if (ehCasal) {
        aindaDevendo += r.valorAVencer;
        casal.push(item);
      } else if (l.de_quem === "terceiro") {
        aindaDevendoTerceiros += r.valorAVencer;
        var pago = pagosPorRef[l.id] || 0;
        var cob = Math.min(parcelasCobertas(parcelas, pago), vals.n);
        var prox = cob < parcelas.length ? parcelas[cob] : null;
        item.pessoa_id = l.pessoa_id != null ? l.pessoa_id : null;
        item.pessoa = nomeDe(idx, l.pessoa_id);
        item.pago = pago;
        item.pagasParente = cob;
        item.faltamParente = vals.n - cob;
        item.faltaParente = Math.max(0, (vals.total || 0) - pago);
        item.proximaAPagar = prox ? { k: prox.k, n: prox.n, data: prox.vencimento, competencia: prox.competencia, valor: prox.valor } : null;
        item.pctPagoParente = vals.total ? Math.round(Math.min(pago, vals.total) / vals.total * 100) : null;
        terceiros.push(item);
      }
    }
    var porProxima = function (a, b) {
      var da = a.proxima && (a.proxima.data || a.proxima.competencia) || "";
      var db = b.proxima && (b.proxima.data || b.proxima.competencia) || "";
      return da < db ? -1 : da > db ? 1 : 0;
    };
    casal.sort(porProxima);
    terceiros.sort(porProxima);
    return {
      casal: casal,
      terceiros: terceiros,
      aindaDevendo: aindaDevendo,
      aindaDevendoTerceiros: aindaDevendoTerceiros,
      proximoMes: proximoMes,
      mesSeguinte: mesSeguinte
    };
  }

  // ===================================================================================
  // 9. CSV PARA O EXCEL BRASILEIRO
  // ===================================================================================

  // Ordem das colunas por tipo: campos comuns (seção 3) + campos próprios do tipo.
  var CAMPOS_COMUNS = ["id", "tipo", "criado_em", "alterado_em", "lancado_por", "apagado", "versao_formato"];
  var CAMPOS_TIPO = {
    lancamento: ["descricao", "data_compra", "valor", "valor_total", "parcelas", "repeticao", "categoria_id", "meio", "de_quem", "pessoa_id"],
    cartao: ["nome", "dia_fechamento", "dia_vencimento", "ativo"],
    meio: ["nome", "ativo"],
    categoria: ["nome", "ativo", "ordem"],
    pessoa: ["nome", "whatsapp", "observacao", "ativo"],
    emprestimo: ["pessoa_id", "valor", "data", "descricao"],
    pagamento: ["pessoa_id", "valor", "data", "ref_id", "observacao"],
    conta_fixa: ["nome", "valor_previsto", "dia", "categoria_id", "meio", "inicio", "fim", "ativo"],
    fixa_confirmada: ["conta_fixa_id", "mes", "valor_real", "data_pagamento"],
    fonte: ["nome", "periodicidade", "dias", "valor_previsto", "de", "inicio", "fim", "ativo"],
    receita_confirmada: ["fonte_id", "mes", "ocorrencia", "valor_recebido", "data_recebimento"],
    receita_avulsa: ["fonte_id", "descricao", "valor_recebido", "data_recebimento"],
    reserva: ["nome", "valor_guardado", "meta"],
    historico: ["alvo_tipo", "alvo_id", "acao", "antes", "depois"],
    ajuste: ["nomes"]
  };
  // Campos que são dinheiro (centavos) -> saem como "38,90"
  var CAMPOS_DINHEIRO = { valor: 1, valor_total: 1, valor_previsto: 1, valor_real: 1, valor_recebido: 1, valor_guardado: 1, meta: 1 };
  // Campos que são data "AAAA-MM-DD" -> saem como "DD/MM/AAAA"
  var CAMPOS_DATA = { data: 1, data_compra: 1, data_pagamento: 1, data_recebimento: 1 };

  // Campos que são momento ISO (criado/alterado) -> saem em horário de Brasília "DD/MM/AAAA HH:MM"
  var CAMPOS_MOMENTO = { criado_em: 1, alterado_em: 1 };
  // Coluna de nome legível colocada logo depois de cada coluna de id (resolvida pelo índice de todos)
  var COLUNA_NOME = { categoria_id: "categoria_nome", meio: "meio_nome", pessoa_id: "pessoa_nome", conta_fixa_id: "conta_fixa_nome", fonte_id: "fonte_nome" };

  /** Dias desde 01/01/1970 para uma data do calendário (conta pura, sem objeto Date). */
  function diasDesdeEpoca(ano, mes, dia) {
    var a = mes <= 2 ? ano - 1 : ano;
    var era = Math.floor(a / 400);
    var aDaEra = a - era * 400;
    var diaDoAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
    var diaDaEra = aDaEra * 365 + Math.floor(aDaEra / 4) - Math.floor(aDaEra / 100) + diaDoAno;
    return era * 146097 + diaDaEra - 719468;
  }
  /** Inverso de diasDesdeEpoca: devolve {ano, mes, dia}. */
  function dataDeDias(z) {
    z += 719468;
    var era = Math.floor(z / 146097);
    var doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153);
    var dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
    var mes = mp + (mp < 10 ? 3 : -9);
    return { ano: yoe + era * 400 + (mes <= 2 ? 1 : 0), mes: mes, dia: dia };
  }

  /**
   * Momento ISO ("2026-09-19T14:30:00.000Z", ou com fuso "+00:00"/"-03:00") ->
   * "DD/MM/AAAA HH:MM" em horário de Brasília (UTC−3 fixo: o Brasil não tem horário de
   * verão desde 2019). Texto que não é ISO com hora e fuso -> devolvido como veio.
   */
  function momentoBrasilia(iso) {
    if (typeof iso !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))$/.exec(iso);
    if (!m || !lerData(m[1] + "-" + m[2] + "-" + m[3])) return iso;
    var fusoMin = m[7] === "Z" ? 0 : (m[8] === "-" ? -1 : 1) * (+m[9] * 60 + +m[10]);
    // minutos desde a época em UTC, depois −180 para Brasília
    var minutos = diasDesdeEpoca(+m[1], +m[2], +m[3]) * 1440 + +m[4] * 60 + +m[5] - fusoMin - 180;
    var dias = Math.floor(minutos / 1440);
    var resto = minutos - dias * 1440;
    var d = dataDeDias(dias);
    return doisDigitos(d.dia) + "/" + doisDigitos(d.mes) + "/" + d.ano + " " +
      doisDigitos(Math.floor(resto / 60)) + ":" + doisDigitos(resto % 60);
  }

  /** Converte um valor em texto de célula do CSV (antes de colocar aspas). */
  function celula(campo, v) {
    if (v == null) return "";
    if (CAMPOS_MOMENTO[campo] && typeof v === "string") return momentoBrasilia(v);
    if (CAMPOS_DINHEIRO[campo] && ehInteiro(v)) return reaisCSV(v);
    if (CAMPOS_DATA[campo] && lerData(v)) return dataBR(v);
    if (typeof v === "boolean") return v ? "sim" : "não";
    // lista simples (ex.: dias [15,30], nomes) -> "15 / 30" (vírgula confundiria o Excel com decimal)
    if (Array.isArray(v) && v.every(function (x) { return x == null || typeof x !== "object"; })) return v.join(" / ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  /** Coloca aspas quando a célula tem ";", aspas, quebra de linha ou espaço nas pontas. */
  function aspas(t) {
    if (/[;"\r\n]/.test(t) || /^\s|\s$/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  /**
   * Regras.paraCSV(registros, tipo) -> texto CSV
   *   - começa com BOM UTF-8 ("﻿") para o Excel reconhecer os acentos;
   *   - separador ";" e vírgula decimal (Excel brasileiro abre direto);
   *   - 1ª linha = nomes dos campos; uma coluna por campo (comuns + do tipo, na ordem do
   *     contrato; campos extras que existirem nos registros vão no fim, em ordem alfabética);
   *   - dinheiro em reais "38,90" (sem "R$" e sem ponto de milhar); datas "DD/MM/AAAA";
   *     sim/não para verdadeiro/falso; vazio para null; listas "15 / 30"; objetos em JSON;
   *   - momentos criado_em/alterado_em em horário de Brasília "DD/MM/AAAA HH:MM";
   *   - ao lado de cada id de referência vem uma coluna com o NOME legível:
   *     categoria_id -> categoria_nome, meio -> meio_nome, pessoa_id -> pessoa_nome,
   *     conta_fixa_id -> conta_fixa_nome, fonte_id -> fonte_nome (só quando o tipo tem o campo).
   *     O nome é procurado em TODOS os registros recebidos (inclusive lixeira), por isso
   *     quem chama deve passar a lista COMPLETA, não só os registros do tipo;
   *   - linhas separadas por "\r\n".
   * Exporta TODOS os registros do tipo pedido que vierem na lista, inclusive os da lixeira
   * (coluna "apagado" = sim) — é cópia de segurança, não cálculo. Quem quiser sem a lixeira
   * filtra antes de chamar. Sem `tipo`: exporta todos os tipos juntos (colunas somadas).
   */
  function paraCSV(registros, tipo) {
    var lista = (Array.isArray(registros) ? registros : []).filter(function (r) {
      return r && typeof r === "object" && (tipo == null || r.tipo === tipo);
    });
    var colunas = CAMPOS_COMUNS.slice();
    var vistos = {};
    colunas.forEach(function (c) { vistos[c] = 1; });
    var tiposUsados = tipo != null ? [tipo] : Object.keys(CAMPOS_TIPO);
    tiposUsados.forEach(function (t) {
      (CAMPOS_TIPO[t] || []).forEach(function (c) { if (!vistos[c]) { vistos[c] = 1; colunas.push(c); } });
    });
    var extras = [];
    lista.forEach(function (r) {
      Object.keys(r).forEach(function (c) { if (!vistos[c]) { vistos[c] = 1; extras.push(c); } });
    });
    extras.sort();
    colunas = colunas.concat(extras);

    // coloca a coluna de nome logo depois de cada coluna de id de referência
    var comNomes = [];
    var origemNome = {}; // "categoria_nome" -> "categoria_id"
    colunas.forEach(function (c) {
      comNomes.push(c);
      var cn = COLUNA_NOME[c];
      if (cn && colunas.indexOf(cn) < 0 && !origemNome[cn]) { comNomes.push(cn); origemNome[cn] = c; }
    });
    colunas = comNomes;

    // índice de TODOS os registros recebidos (inclusive lixeira) só para achar os nomes
    var idx = indexar(registros);

    var linhas = [colunas.map(aspas).join(";")];
    lista.forEach(function (r) {
      linhas.push(colunas.map(function (c) {
        if (origemNome[c]) return aspas(r[origemNome[c]] == null ? "" : (nomeDe(idx, r[origemNome[c]]) || ""));
        return aspas(celula(c, r[c]));
      }).join(";"));
    });
    return "﻿" + linhas.join("\r\n") + "\r\n";
  }

  // ===================================================================================
  // 10. R9 — ORÇAMENTO DO SALÁRIO (CONTRATO.md, seção 8)
  // ===================================================================================

  // Regras de divisão aceitas. Qualquer outro valor no ajuste vira a padrão (70/20/10).
  var REGRAS_ORCAMENTO = {
    "70/20/10": { fixas: 70, livre: 20, investir: 10 },
    "60/30/10": { fixas: 60, livre: 30, investir: 10 }
  };
  var REGRA_PADRAO = "70/20/10";
  var REFERENCIA_MERCADINHO_PADRAO = 50000; // R$ 500,00 (seção 8.1)

  /**
   * Deixa um nome pronto para comparar: sem acento, minúsculo, sem espaço sobrando.
   * "  Compra   Mensal " -> "compra mensal";  "Mercadinho" -> "mercadinho".
   */
  function nomeComparavel(t) {
    if (t == null) return "";
    return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  /**
   * Quais ids de categoria contam como "Compra mensal" ou "Mercadinho" (seção 8.1):
   *   - se o ajuste tem o id (categoria_compra_mensal_id / categoria_mercadinho_id), vale esse id;
   *   - se não tem, procura categoria VIVA e ativa (ativo !== false) com o nome, sem diferenciar
   *     maiúsculas e acentos. Se houver mais de uma com o mesmo nome, todas contam.
   * Devolve um objeto {id: true}. Vazio = categoria não encontrada (soma fica 0).
   */
  function idsCategoria(idx, idNoAjuste, nomeProcurado) {
    var ids = {};
    if (idNoAjuste != null) { ids[idNoAjuste] = true; return ids; }
    var alvo = nomeComparavel(nomeProcurado);
    var cats = idx.tipo("categoria");
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].ativo === false) continue;
      if (nomeComparavel(cats[i].nome) === alvo && cats[i].id != null) ids[cats[i].id] = true;
    }
    return ids;
  }

  /**
   * Quantas ocorrências PREVISTAS a fonte tem no mês, para a BASE do orçamento.
   *   - fonte precisa valer no mês (valeNoPeriodo: inicio, fim e ativo);
   *   - "avulso" nunca entra (não tem previsto);
   *   - uma ocorrência por dia válido em `dias` (quinzenal [15,30] = 2);
   *   - "mensal" com `dias` vazio ou só com dia null conta como 1 ocorrência
   *     (decisão do encarregado: o salário existe, só o dia não foi informado).
   */
  function ocorrenciasNaBase(fonte, mes) {
    if (fonte.periodicidade === "avulso") return 0;
    if (!valeNoPeriodo(fonte, mes)) return 0;
    var dias = Array.isArray(fonte.dias) ? fonte.dias.filter(function (d) { return ehInteiro(d) && d >= 1 && d <= 31; }) : [];
    if (dias.length > 0) return dias.length;
    return fonte.periodicidade === "mensal" ? 1 : 0;
  }

  /**
   * A fonte pode ser base do orçamento? Viva, NÃO extra (seção 8.1: extra nunca entra na base),
   * não avulsa e com valor_previsto informado (sem previsto não se inventa salário).
   */
  function fontePodeSerBase(fonte) {
    return !!fonte && fonte.extra !== true && fonte.periodicidade !== "avulso" && ehInteiro(fonte.valor_previsto);
  }

  /**
   * Base do orçamento no mês: {base: centavos|null, origem:[{fonte_id, nome}]}.
   *   - ajuste.fonte_salario_id aponta para fonte viva que pode ser base -> só ela.
   *     (Se essa fonte não vale no mês — ainda não começou, acabou, desativada — não há
   *     salário no mês: base null. Não se troca por outra fonte.)
   *   - ausente, ou aponta para fonte inexistente/apagada (ou extra/avulsa, que nunca podem ser
   *     base) -> soma de TODAS as fontes que podem ser base e valem no mês.
   *   - nenhuma fonte contribuiu -> base null ("NÃO INFORMADO").
   */
  function baseDoOrcamento(idx, ajuste, mes) {
    var escolhida = ajuste && ajuste.fonte_salario_id != null ? buscar(idx, ajuste.fonte_salario_id, "fonte") : null;
    var candidatas = fontePodeSerBase(escolhida) ? [escolhida] : idx.tipo("fonte").filter(fontePodeSerBase);
    var base = 0, origem = [];
    for (var i = 0; i < candidatas.length; i++) {
      var fo = candidatas[i];
      var n = ocorrenciasNaBase(fo, mes);
      if (n === 0) continue;
      base += fo.valor_previsto * n;
      origem.push({ fonte_id: fo.id, nome: fo.nome != null ? fo.nome : null });
    }
    return { base: origem.length ? base : null, origem: origem };
  }

  /**
   * Regras.resumoOrcamento(registros, mes, hoje) -> objeto do orçamento do mês "AAAA-MM" (R9)
   *
   *   regra        "70/20/10" (padrão) ou "60/30/10", do ajuste:casal.regra_orcamento
   *   pcts         {fixas, livre, investir} da regra
   *   base         centavos previstos do salário no mês (ver baseDoOrcamento) ou null
   *   baseOrigem   [{fonte_id, nome}] fontes que formaram a base
   *   fixas        {usado, alvo, contas, parcelas}
   *                contas = contas fixas do mês (mesma conta do R3: real se confirmada, senão previsto)
   *                parcelas = parcelas de compras do CASAL com competência no mês
   *                usado = contas + parcelas
   *   livre        {usado, alvo}  usado = compras do CASAL únicas com data_compra no mês
   *   investir     {sobra, alvo}  sobra = base − fixas.usado − livre.usado (pode ser negativa; base null -> null)
   *   sobraSalario = investir.sobra
   *   mercado      {compraMensal, mercadinho, idasMercadinho, referencia, nivel}
   *                compraMensal/mercadinho = compras do casal da categoria (únicas no mês + parcelas
   *                com competência no mês); idasMercadinho = quantas compras ÚNICAS de Mercadinho;
   *                referencia = ajuste.referencia_mercadinho (inteiro > 0) ou 50000;
   *                nivel: "passou" ≥ 100%, "alto" ≥ 80%, "metade" ≥ 50%, senão "ok" (da referência)
   *   extras       {recebido, aReceber, itens:[{fonte_id, nome, recebido|null, previsto|null, data|null}]}
   *                ocorrências das fontes extra:true (confirmadas = recebido; não confirmadas com
   *                previsto = a receber) + receitas avulsas do mês ligadas a fonte extra (recebido).
   *                Itens em ordem de data (recebida ou prevista), mais antiga primeiro.
   *   metas        [{reserva_id, nome, guardado|null, meta, pct}] reservas com meta (inteiro > 0),
   *                meta crescente; pct = guardado/meta com 1 casa (null se guardado ausente)
   *
   * alvo = round(base × pct / 100); base null -> todos os alvos null.
   * Garantia: fixas.usado + livre.usado = resumoMes(...).gastou (mesma regra, só separada).
   * Compra de terceiro nunca entra. resumoMes não muda. Mês inválido -> null.
   */
  function resumoOrcamento(registros, mes, hoje) {
    if (!lerMes(mes)) return null;
    var idx = indexar(registros);
    var ajuste = buscar(idx, "ajuste:casal", "ajuste") || {};

    // --- regra e porcentagens ---
    var regra = REGRAS_ORCAMENTO[ajuste.regra_orcamento] ? ajuste.regra_orcamento : REGRA_PADRAO;
    var p = REGRAS_ORCAMENTO[regra];
    var pcts = { fixas: p.fixas, livre: p.livre, investir: p.investir };

    // --- base (salário previsto) ---
    var b = baseDoOrcamento(idx, ajuste, mes);
    var base = b.base;
    function alvo(pc) { return base == null ? null : Math.round(base * pc / 100); }

    // --- categorias do mercado ---
    var catCompra = idsCategoria(idx, ajuste.categoria_compra_mensal_id, "Compra mensal");
    var catMercadinho = idsCategoria(idx, ajuste.categoria_mercadinho_id, "Mercadinho");
    var compraMensal = 0, mercadinho = 0, idasMercadinho = 0;

    // --- compras do casal: únicas (livre) e parcelas (fixas) — mesma separação do resumoMes ---
    var livreUsado = 0, parcelasMes = 0;
    var lancs = idx.tipo("lancamento");
    for (var i = 0; i < lancs.length; i++) {
      var l = lancs[i];
      if (l.de_quem !== "casal") continue; // compra de terceiro nunca entra (R3)
      var parcelas = parcelasComIndice(l, idx, hoje);
      for (var k = 0; k < parcelas.length; k++) {
        var pc = parcelas[k];
        if (pc.competencia !== mes) continue;
        var valor = pc.valor || 0;
        var ehParcela = pc.n > 1; // igual ao resumoMes: n = 1 é compra única
        if (ehParcela) parcelasMes += valor;
        else livreUsado += valor;
        if (l.categoria_id != null && catCompra[l.categoria_id]) compraMensal += valor;
        if (l.categoria_id != null && catMercadinho[l.categoria_id]) {
          mercadinho += valor;
          if (!ehParcela) idasMercadinho++;
        }
      }
    }

    // --- contas fixas do mês (R3, inclusive confirmações de contas na lixeira) ---
    var contasMes = 0;
    var ocs = ocorrenciasFixas(idx, mes);
    for (var c = 0; c < ocs.length; c++) contasMes += ocs[c].valor || 0;

    var fixasUsado = contasMes + parcelasMes;
    var sobra = base == null ? null : base - fixasUsado - livreUsado;

    // --- nível do mercadinho (conta em inteiros: sem número quebrado) ---
    var referencia = ehInteiro(ajuste.referencia_mercadinho) && ajuste.referencia_mercadinho > 0
      ? ajuste.referencia_mercadinho : REFERENCIA_MERCADINHO_PADRAO;
    var nivel = "ok";
    if (mercadinho * 100 >= referencia * 100) nivel = "passou";
    else if (mercadinho * 100 >= referencia * 80) nivel = "alto";
    else if (mercadinho * 100 >= referencia * 50) nivel = "metade";

    // --- extras (fora do orçamento) ---
    var extrasItens = [], recebidoExtra = 0, aReceberExtra = 0;
    var confUsadas = {};
    var fontes = idx.tipo("fonte");
    for (var f = 0; f < fontes.length; f++) {
      var fo = fontes[f];
      if (fo.extra !== true) continue;
      // mesmas ocorrências que o resumoMes mostra (um por dia válido), para a tela poder confirmar
      var dias = Array.isArray(fo.dias) ? fo.dias.filter(function (d) { return ehInteiro(d) && d >= 1 && d <= 31; }) : [];
      dias = dias.slice().sort(function (a, z) { return a - z; });
      for (var o = 0; o < dias.length; o++) {
        var conf = acharConfirmacaoReceita(idx, fo, mes, o + 1);
        if (!conf && !valeNoPeriodo(fo, mes)) continue;
        var prev = ehInteiro(fo.valor_previsto) ? fo.valor_previsto : null;
        if (conf) {
          confUsadas[conf.id] = true;
          var rc = ehInteiro(conf.valor_recebido) ? conf.valor_recebido : null;
          recebidoExtra += rc || 0;
          extrasItens.push({ fonte_id: fo.id, nome: fo.nome != null ? fo.nome : null, recebido: rc, previsto: prev,
            data: conf.data_recebimento != null ? conf.data_recebimento : null, _ordem: conf.data_recebimento || dataDoMes(mes, dias[o]) });
        } else if (prev != null) {
          aReceberExtra += prev;
          extrasItens.push({ fonte_id: fo.id, nome: fo.nome != null ? fo.nome : null, recebido: null, previsto: prev,
            data: null, _ordem: dataDoMes(mes, dias[o]) });
        }
      }
    }
    // confirmação de fonte extra que saiu do plano (fonte na lixeira ou dias mudados): conta como
    // recebido, igual ao "Entrou" do resumoMes
    var confsR = idx.tipo("receita_confirmada");
    for (var q = 0; q < confsR.length; q++) {
      var cr = confsR[q];
      if (cr.mes !== mes || confUsadas[cr.id]) continue;
      var foT = buscarTodos(idx, cr.fonte_id, "fonte");
      if (!foT || foT.extra !== true) continue;
      confUsadas[cr.id] = true;
      var rcb = ehInteiro(cr.valor_recebido) ? cr.valor_recebido : null;
      recebidoExtra += rcb || 0;
      extrasItens.push({ fonte_id: cr.fonte_id, nome: foT.nome != null ? foT.nome : null, recebido: rcb, previsto: null,
        data: cr.data_recebimento != null ? cr.data_recebimento : null, _ordem: cr.data_recebimento || "" });
    }
    // receitas avulsas do mês ligadas a fonte extra
    var avs = idx.tipo("receita_avulsa");
    for (var r = 0; r < avs.length; r++) {
      var av = avs[r];
      if (mesDe(av.data_recebimento) !== mes) continue;
      var foA = buscarTodos(idx, av.fonte_id, "fonte");
      if (!foA || foA.extra !== true) continue;
      var vr = ehInteiro(av.valor_recebido) ? av.valor_recebido : null;
      recebidoExtra += vr || 0;
      extrasItens.push({ fonte_id: av.fonte_id, nome: foA.nome != null ? foA.nome : null, recebido: vr, previsto: null,
        data: av.data_recebimento, _ordem: av.data_recebimento });
    }
    extrasItens.sort(function (a, z) { var x = a._ordem || "", y = z._ordem || ""; return x < y ? -1 : x > y ? 1 : 0; });
    for (var e = 0; e < extrasItens.length; e++) delete extrasItens[e]._ordem;

    // --- metas (reservas com meta), meta crescente ---
    var metas = idx.tipo("reserva").filter(function (rs) { return ehInteiro(rs.meta) && rs.meta > 0; })
      .map(function (rs) {
        var guardado = ehInteiro(rs.valor_guardado) ? rs.valor_guardado : null;
        return { reserva_id: rs.id, nome: rs.nome != null ? rs.nome : null, guardado: guardado, meta: rs.meta,
          pct: guardado == null ? null : pct(guardado, rs.meta) };
      })
      .sort(function (a, z) {
        if (a.meta !== z.meta) return a.meta - z.meta;
        return String(a.nome) < String(z.nome) ? -1 : String(a.nome) > String(z.nome) ? 1 : 0;
      });

    return {
      mes: mes,
      regra: regra,
      pcts: pcts,
      base: base,
      baseOrigem: b.origem,
      fixas: { usado: fixasUsado, alvo: alvo(pcts.fixas), contas: contasMes, parcelas: parcelasMes },
      livre: { usado: livreUsado, alvo: alvo(pcts.livre) },
      investir: { sobra: sobra, alvo: alvo(pcts.investir) },
      sobraSalario: sobra,
      mercado: { compraMensal: compraMensal, mercadinho: mercadinho, idasMercadinho: idasMercadinho,
        referencia: referencia, nivel: nivel },
      extras: { recebido: recebidoExtra, aReceber: aReceberExtra, itens: extrasItens },
      metas: metas
    };
  }

  // ===================================================================================
  // 11. O QUE FICA DISPONÍVEL PARA O RESTO DO APP
  // ===================================================================================

  var Regras = {
    // seção 5 do contrato
    centavos: centavos,
    dinheiro: dinheiro,
    dataBR: dataBR,
    mesExtenso: mesExtenso,
    somaMes: somaMes,
    dividirParcelas: dividirParcelas,
    fatura: fatura,
    parcelasDe: parcelasDe,
    resumoMes: resumoMes,
    faturasDoMes: faturasDoMes,
    parcelasEmAndamento: parcelasEmAndamento,
    resumoPessoa: resumoPessoa,
    resumoParentes: resumoParentes,
    textoWhatsApp: textoWhatsApp,
    linkWhatsApp: linkWhatsApp,
    paraCSV: paraCSV,
    // seção 8 do contrato (R9)
    resumoOrcamento: resumoOrcamento,
    // ajudantes extras (úteis para a tela; não estão na seção 5)
    NAO_INFORMADO: NAO_INFORMADO,
    dataCurta: dataCurta,   // "2026-09-19" -> "19/09"
    mesDe: mesDe,           // "2026-09-19" -> "2026-09"
    dataDoMes: dataDoMes,   // ("2026-02", 31) -> "2026-02-28"
    ultimoDia: ultimoDia,   // (2026, 2) -> 28
    dataValida: function (t) { return lerData(t) != null; },
    mesValido: function (t) { return lerMes(t) != null; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Regras;
  if (raiz) raiz.Regras = Regras;
})(typeof window !== "undefined" ? window : null);
