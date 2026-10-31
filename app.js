/*
 * app.js — liga as telas aos dados (dados.js) e às regras (regras.js).
 *
 * Gastos do Casal · Agente Interface
 *
 * Como este arquivo está organizado (de cima para baixo):
 *   1. Utilidades: datas, montagem de elementos na página, componentes visuais
 *   2. Aviso rápido, confirmação dentro da página, download de arquivos
 *   3. Navegação entre telas (abas de baixo + botão voltar do Android)
 *   4. Indicador de sincronização no topo
 *   5. Uma função por tela (primeiro acesso, Início, Mês, Lançar, Cartões, ...)
 *   6. Partida: Dados.iniciar() e primeira tela
 *
 * Regras que este arquivo segue:
 *   - Não calcula nada de negócio: todo total vem de window.Regras.
 *   - Não guarda nada direto: tudo passa por window.Dados (salvar / apagar / restaurar).
 *   - Texto digitado pelo usuário entra na página só por textContent (função h),
 *     então um nome com "<" ou "&" nunca quebra a tela.
 *   - Dinheiro entra com Regras.centavos() e aparece com Regras.dinheiro().
 *   - Campo sem valor aparece "NÃO INFORMADO".
 */
(function () {
  "use strict";

  /* =====================================================================
   * 1. UTILIDADES
   * ===================================================================== */

  var NI = "NÃO INFORMADO";

  // Completa com zero à esquerda: 5 -> "05"
  function dois(n) { return (n < 10 ? "0" : "") + n; }

  // Data de hoje no relógio do celular, como "AAAA-MM-DD" (nunca em UTC)
  function hoje() {
    var d = new Date();
    return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate());
  }
  function mesDe(data) { return data ? String(data).slice(0, 7) : null; }
  function mesAtual() { return mesDe(hoje()); }

  // "2026-09-19" -> "19/09"
  function diaMes(data) { return data ? data.slice(8, 10) + "/" + data.slice(5, 7) : NI; }
  function dataBR(data) { return data ? Regras.dataBR(data) : NI; }
  function dinheiro(c) { return (c === null || c === undefined) ? NI : Regras.dinheiro(c); }
  // Primeira letra maiúscula: "setembro de 2026" -> "Setembro de 2026"
  function maiuscula(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function mesExtenso(m) { return Regras.mesExtenso(m); }
  // Só o nome do mês: "2026-10" -> "outubro"
  function nomeMes(m) { return mesExtenso(m).split(" de ")[0]; }

  // Data e hora de um momento ISO, no fuso do celular: "19/09/2026 14:05"
  function momentoBR(iso) {
    if (!iso) return NI;
    var d = new Date(iso);
    if (isNaN(d)) return NI;
    return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear() + " " + dois(d.getHours()) + ":" + dois(d.getMinutes());
  }

  /*
   * h(tag, propriedades, ...filhos) — monta um elemento da página.
   * Filhos de texto viram nós de texto (seguro contra HTML digitado).
   * Ex.: h("div", {class:"linha", onclick: fn}, "texto", outroElemento)
   */
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") e.className = v;
        else if (k === "style") e.setAttribute("style", v);
        else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
        else if (k === "value") e.value = v;
        else if (k === "checked") e.checked = !!v;
        else if (k === "hidden") e.hidden = !!v;
        else if (k === "disabled") e.disabled = !!v;
        else if (k === "selected") e.selected = !!v;
        else e.setAttribute(k, v === true ? "" : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) anexar(e, arguments[i]);
    return e;
  }
  function anexar(pai, f) {
    if (f === null || f === undefined || f === false) return;
    if (Array.isArray(f)) { f.forEach(function (x) { anexar(pai, x); }); return; }
    pai.appendChild(f instanceof Node ? f : document.createTextNode(String(f)));
  }

  // Texto ou "NÃO INFORMADO" em vermelho, quando o valor está vazio
  function ouNI(v) {
    if (v === null || v === undefined || v === "") return h("span", { class: "naoinf" }, NI);
    return String(v);
  }

  /* ---------- componentes visuais (iguais aos do protótipo) ---------- */

  // Título de seção + conteúdo
  function secao(titulo) {
    var filhos = Array.prototype.slice.call(arguments, 1);
    return h("div", { class: "grupo" }, h("h2", { class: "sec" }, titulo), filhos);
  }
  function cartao() { return h("div", { class: "cartao" }, Array.prototype.slice.call(arguments)); }

  /*
   * Linha de lista. opcoes: {det, dir, corDir, aoTocar, rotulo (aria-label), nomeExtra}
   * Se tiver aoTocar, vira botão (alvo de toque de 44px).
   */
  function linha(nome, op) {
    op = op || {};
    var esq = h("div", { class: "esq" },
      nome !== null ? h("span", { class: "nome", style: op.estiloNome }, nome, op.nomeExtra ? [" ", op.nomeExtra] : null) : null,
      op.det !== undefined && op.det !== null ? h("span", { class: "det" }, op.det) : null);
    var dir = op.dir !== undefined && op.dir !== null
      ? h("span", { class: "dir" + (op.num === false ? "" : " num"), style: op.corDir ? "color:" + op.corDir : null }, op.dir)
      : null;
    if (op.aoTocar) {
      return h("button", { type: "button", class: "linha" + (op.classe ? " " + op.classe : ""), onclick: op.aoTocar, "aria-label": op.rotulo || null }, esq, dir);
    }
    return h("div", { class: "linha" + (op.classe ? " " + op.classe : "") }, esq, dir);
  }

  function tile(rot, val, sub, classe) {
    return h("div", { class: "tile" + (classe ? " " + classe : "") },
      h("div", { class: "rot" }, rot), h("span", { class: "val num" }, val), sub ? h("div", { class: "sub" }, sub) : null);
  }

  // Barra horizontal (categorias, quem lançou, progresso)
  function barra(nome, direita, pct, classe) {
    return h("div", { class: "barra" },
      h("div", { class: "cab" }, h("b", null, nome), h("span", { class: "num" }, direita)),
      trilha(pct, classe));
  }
  function trilha(pct, classe, estilo) {
    var p = Math.max(0, Math.min(100, pct || 0));
    return h("div", { class: "trilha", style: estilo || null, role: "presentation" },
      h("div", { class: "preenche" + (classe ? " " + classe : ""), style: "width:" + p.toFixed(1) + "%" }));
  }
  function selo(texto, classe) { return h("span", { class: "selo " + classe }, texto); }

  function botao(texto, aoTocar, classe, extra) {
    var p = { type: "button", class: "botao" + (classe ? " " + classe : ""), onclick: aoTocar };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return h("button", p, texto);
  }
  // Atalho: botão largo com texto, detalhe e seta/valor à direita
  function atalho(texto, det, direita, aoTocar) {
    return h("button", { type: "button", class: "atalho", onclick: aoTocar },
      h("span", null, texto, det ? h("span", { class: "det" }, det) : null),
      direita ? h("span", { class: "num", style: "font-weight:600" }, direita) : h("span", { class: "seta", "aria-hidden": "true" }, "→"));
  }
  // Estado vazio: uma linha explicando o que fazer + botão que leva lá
  function vazio(texto, rotuloBotao, acao) {
    return h("div", { class: "vazio" }, h("p", null, texto), rotuloBotao ? botao(rotuloBotao, acao, "fraco mini") : null);
  }
  function voltaBotao(texto) {
    return h("button", { type: "button", class: "volta", onclick: voltar }, "← " + texto);
  }

  /*
   * Grupo de chips (escolha única). opcoes: [{valor, rotulo}]
   * Devolve {el, valor()} — valor() lê o escolhido na hora.
   */
  function chips(rotuloGrupo, opcoes, inicial, aoMudar) {
    var atual = inicial;
    var el = h("div", { class: "chips", role: "group", "aria-label": rotuloGrupo });
    opcoes.forEach(function (o) {
      var b = h("button", { type: "button", class: "chip", "aria-pressed": o.valor === atual ? "true" : "false" }, o.rotulo);
      b.addEventListener("click", function () {
        atual = o.valor;
        Array.prototype.forEach.call(el.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
        if (aoMudar) aoMudar(atual);
      });
      el.appendChild(b);
    });
    return { el: el, valor: function () { return atual; } };
  }

  // Campo com rótulo. O id liga o <label> ao <input> (acessibilidade).
  var contadorId = 0;
  function campo(rotulo, entrada, ajuda) {
    var id = entrada.id || ("c" + (++contadorId));
    entrada.id = id;
    return h("div", { class: "campo" }, h("label", { for: id }, rotulo), entrada, ajuda ? h("div", { class: "ajuda" }, ajuda) : null);
  }
  // Campo de dinheiro: teclado numérico com vírgula
  function entradaDinheiro(centavosIniciais, placeholder) {
    return h("input", {
      type: "text", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done",
      placeholder: placeholder || "0,00",
      value: centavosIniciais !== null && centavosIniciais !== undefined ? centavosParaTexto(centavosIniciais) : ""
    });
  }
  // 3890 -> "38,90" (para preencher campo em edição)
  function centavosParaTexto(c) {
    var neg = c < 0; c = Math.abs(c);
    var r = Math.floor(c / 100), cc = c % 100;
    return (neg ? "-" : "") + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dois(cc);
  }
  function entradaTexto(valor, extra) {
    var p = { type: "text", value: valor || "", autocomplete: "off" };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return h("input", p);
  }
  function entradaDia(valor) {
    return h("input", { type: "number", inputmode: "numeric", min: "1", max: "31", step: "1", value: valor === null || valor === undefined ? "" : String(valor), placeholder: "1 a 31" });
  }
  function entradaData(valor) { return h("input", { type: "date", value: valor || "" }); }
  function entradaMes(valor) { return h("input", { type: "month", value: valor || "", placeholder: "AAAA-MM" }); }
  function selecao(opcoes, atual) {
    var s = h("select", null);
    opcoes.forEach(function (o) { s.appendChild(h("option", { value: o.valor, selected: o.valor === atual }, o.rotulo)); });
    if (atual !== undefined && atual !== null) s.value = atual;
    return s;
  }
  function marca(rotulo, marcado) {
    var inp = h("input", { type: "checkbox", checked: marcado });
    return { el: h("label", { class: "marca" }, inp, rotulo), entrada: inp };
  }
  // Lê "1 a 31" de um campo; vazio -> null; inválido -> NaN
  function lerDia(inp) {
    var t = String(inp.value || "").trim();
    if (!t) return null;
    var n = parseInt(t, 10);
    return (n >= 1 && n <= 31 && String(n) === t.replace(/^0+(?=\d)/, "")) ? n : NaN;
  }
  // Mensagem de erro do formulário (fica acima do botão salvar)
  function caixaErro() { return h("div", { class: "erro", role: "alert", hidden: true }); }
  function mostrarErro(caixa, texto) {
    caixa.textContent = texto; caixa.hidden = false;
    caixa.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  // Rodapé do formulário com o botão Salvar sempre à vista
  function rodapeForm(textoBotao, aoSalvar, nota) {
    var b = botao(textoBotao, null, "", { "data-acao": "salvar" });
    b.addEventListener("click", umaVez(b, aoSalvar));
    return h("div", { class: "rodape-form" }, b, nota ? h("div", { class: "nota centro" }, nota) : null);
  }

  /*
   * TRAVA CONTRA TOQUE DUPLO
   * umaVez(botao, fn): devolve o tratador de clique do botão Salvar. Enquanto fn roda o
   * botão fica desabilitado; se fn gravou (chamou concluir), o botão continua travado até
   * a tela sair. Assim um toque duplo nunca grava duas vezes nem volta duas telas.
   * concluir(): o "voltar" depois de gravar — só acontece uma vez por abertura da tela.
   */
  var telaConcluida = false;
  function concluir() {
    if (telaConcluida) return;
    telaConcluida = true;
    voltar();
  }
  function umaVez(botao, fn) {
    return function (ev) {
      if (ev) ev.preventDefault();
      if (botao.disabled || telaConcluida) return;
      botao.disabled = true;
      var destravar = function () { if (!telaConcluida) botao.disabled = false; };
      var r;
      try { r = fn(); }
      catch (e) { console.warn(e); avisar("Não consegui gravar: " + (e && e.message ? e.message : "erro")); }
      // fn pode devolver uma Promise (criar/entrar no casal): espera ela terminar
      if (r && typeof r.then === "function") r.then(destravar, destravar);
      else destravar();
    };
  }

  // Seletor ← mês → (Início, Mês e Cartões)
  function seletorMes(mes, aoMudar, legenda) {
    return h("div", { class: "seletor-mes" },
      h("button", { type: "button", "aria-label": "Mês anterior", onclick: function () { aoMudar(Regras.somaMes(mes, -1)); } }, "←"),
      h("div", { class: "rotulo", "aria-live": "polite" }, maiuscula(mesExtenso(mes)), legenda ? h("small", null, legenda) : null),
      h("button", { type: "button", "aria-label": "Próximo mês", onclick: function () { aoMudar(Regras.somaMes(mes, 1)); } }, "→"));
  }

  /* ---------- acesso aos registros ---------- */

  // Todos os registros válidos (sem lixeira e sem histórico), prontos para Regras.*
  function registros() {
    return (Dados.todos() || []).filter(function (r) { return r && !r.apagado && r.tipo !== "historico"; });
  }
  // Para o Regras: TODOS os registros, inclusive lixeira. O Regras ignora os apagados nos
  // cálculos, mas usa os da lixeira para achar o nome de um cartão/pessoa que foi apagado.
  function paraRegras() {
    return (Dados.todos({ incluirApagados: true }) || []).filter(function (r) { return r && r.tipo !== "historico"; });
  }
  function doTipo(tipo, regs) { return (regs || registros()).filter(function (r) { return r.tipo === tipo; }); }
  function porId(id, regs) {
    if (!id) return null;
    var lista = regs || registros();
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }
  // Nomes do casal (registro "ajuste:casal"), ex.: ["Lucian","Luciana"]
  function nomesCasal() {
    var a = Dados.obter("ajuste:casal");
    return a && Array.isArray(a.nomes) ? a.nomes.filter(Boolean) : [];
  }
  function categoriasAtivas(regs) {
    return doTipo("categoria", regs).filter(function (c) { return c.ativo !== false; })
      .sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome)); });
  }
  function cartoesTodos(regs) { return doTipo("cartao", regs).sort(porNome); }
  function porNome(a, b) { return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"); }
  // Nome de um meio de pagamento (cartão ou Pix/Dinheiro/...) pelo id
  function nomeMeio(id, regs) { var r = porId(id, regs); return r ? r.nome : null; }
  function nomeCategoria(id, regs) { var r = porId(id, regs); return r ? r.nome : null; }

  // Uma linha legível que descreve qualquer registro (lixeira, histórico)
  var NOMES_TIPO = {
    lancamento: "Lançamento", cartao: "Cartão", meio: "Meio de pagamento", categoria: "Categoria",
    pessoa: "Pessoa", emprestimo: "Empréstimo", pagamento: "Pagamento de parente", conta_fixa: "Conta fixa",
    fixa_confirmada: "Conta fixa confirmada", fonte: "Fonte de renda", receita_confirmada: "Receita confirmada",
    receita_avulsa: "Receita avulsa", reserva: "Reserva", ajuste: "Ajuste do casal", historico: "Histórico"
  };
  function descreverRegistro(r) {
    if (!r) return NI;
    var regs = Dados.todos({ incluirApagados: true }) || [];
    var p;
    switch (r.tipo) {
      case "lancamento": return (r.descricao || NI) + " — " + dinheiro(r.repeticao === "parcelado" ? r.valor_total : r.valor);
      case "pagamento": p = porId(r.pessoa_id, regs); return (p ? p.nome : NI) + " pagou " + dinheiro(r.valor);
      case "emprestimo": p = porId(r.pessoa_id, regs); return "Emprestado a " + (p ? p.nome : NI) + " — " + dinheiro(r.valor);
      case "fixa_confirmada": p = porId(r.conta_fixa_id, regs); return (p ? p.nome : NI) + " de " + (r.mes ? mesExtenso(r.mes) : NI) + " — " + dinheiro(r.valor_real);
      case "receita_confirmada": p = porId(r.fonte_id, regs); return (p ? p.nome : NI) + " (" + (r.ocorrencia || "?") + "ª de " + (r.mes ? mesExtenso(r.mes) : NI) + ") — " + dinheiro(r.valor_recebido);
      case "receita_avulsa": return (r.descricao || NI) + " — " + dinheiro(r.valor_recebido);
      case "ajuste": return "Nomes do casal e orçamento";
      default: return r.nome || r.descricao || r.id;
    }
  }

  /* =====================================================================
   * 2. AVISO RÁPIDO, CONFIRMAÇÃO, DOWNLOAD
   * ===================================================================== */

  var timerToast = null;
  // Mostra uma mensagem curta no rodapé por alguns segundos
  function avisar(texto) {
    var t = document.getElementById("toast");
    t.textContent = texto; t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /*
   * Confirmação dentro da página (substitui o confirm() do navegador).
   * Devolve uma Promise que resolve true (confirmou) ou false (cancelou).
   */
  function confirmar(texto, rotuloSim, subtexto, perigo) {
    return new Promise(function (resolve) {
      var fundo = document.getElementById("modal");
      var anterior = document.activeElement;
      function fechar(r) {
        fundo.hidden = true; fundo.textContent = "";
        document.removeEventListener("keydown", tecla);
        if (anterior && anterior.focus) try { anterior.focus(); } catch (e) { /* elemento pode ter saído da tela */ }
        resolve(r);
      }
      function tecla(ev) { if (ev.key === "Escape") fechar(false); }
      var sim = botao(rotuloSim || "Confirmar", function () { fechar(true); }, perigo ? "perigo" : "");
      var nao = botao("Cancelar", function () { fechar(false); }, "fraco");
      fundo.textContent = "";
      fundo.appendChild(h("div", { class: "modal", role: "alertdialog", "aria-modal": "true", "aria-label": texto },
        h("p", null, texto), subtexto ? h("p", { class: "sub" }, subtexto) : null,
        h("div", { class: "botoes" }, nao, sim)));
      fundo.onclick = function (ev) { if (ev.target === fundo) fechar(false); };
      fundo.hidden = false;
      document.addEventListener("keydown", tecla);
      sim.focus();
    });
  }

  // Baixa um arquivo gerado na hora (CSV ou JSON) usando Blob + link "download"
  function baixar(nomeArquivo, conteudo, tipoMime) {
    var blob = new Blob([conteudo], { type: tipoMime });
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: nomeArquivo, style: "display:none" });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  // Copia texto para a área de transferência (com plano B para celulares antigos)
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return copiarAntigo(texto); });
    }
    return Promise.resolve(copiarAntigo(texto));
  }
  function copiarAntigo(texto) {
    var ta = h("textarea", { style: "position:fixed;opacity:0;top:0;left:0" });
    ta.value = texto; document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /*
   * Executa uma gravação (Dados.salvar/apagar/restaurar) com tratamento de erro.
   * Se der erro, avisa na tela em vez de travar.
   */
  function gravar(fn, mensagemOk) {
    try {
      var r = fn();
      if (mensagemOk) avisar(mensagemOk);
      return r === undefined ? true : r;
    } catch (e) {
      console.warn("Falha ao gravar:", e);
      avisar("Não consegui gravar: " + (e && e.message ? e.message : "erro desconhecido"));
      return null;
    }
  }

  // Confirma e manda um registro para a lixeira; depois volta à tela anterior
  function apagarComConfirmacao(id, texto, depois) {
    confirmar(texto || "Apagar este registro?", "Apagar", "Ele vai para a lixeira, em Config. Dá para restaurar.", true).then(function (ok) {
      if (!ok) return;
      if (gravar(function () { return Dados.apagar(id); }, "Foi para a lixeira.") !== null) {
        if (depois) depois(); else concluir();
      }
    });
  }

  /* =====================================================================
   * 3. NAVEGAÇÃO
   *
   * Cada tela tem um nome (ex.: "mes", "pessoa") e parâmetros (ex.: {id}).
   * As abas de baixo trocam a tela "raiz" (sem empilhar). Telas internas
   * (ficha, formulário) são empilhadas no histórico do navegador, então o
   * botão voltar do Android volta para a tela anterior.
   * ===================================================================== */

  var ABAS = ["inicio", "mes", "cartoes", "parcelas", "parentes", "config"];
  // Qual aba fica acesa em cada tela interna
  var ABA_DA_TELA = {
    inicio: "inicio", mes: "mes", fixas: "mes", fixa: "mes", receita: "mes", avulsa: "mes",
    cartoes: "cartoes", parcelas: "parcelas", parentes: "parentes", pessoa: "parentes",
    pagamento: "parentes", emprestimo: "parentes", config: "config", cadastros: "config",
    cadastro: "config", lixeira: "config", historico: "config", copias: "config", codigo: "config", quem: "config"
  };

  // Estado da interface que não vai para o histórico (mês escolhido etc.)
  // (mesFatura é preenchido em iniciar(), depois de conferir que o Regras carregou)
  var ui = { mes: mesAtual(), mesFatura: null, verTodosItens: false };
  var atual = { tela: "inicio", p: {} };
  var abaPendente = null;

  function profundidade() { return (history.state && history.state.prof) || 0; }

  // Abre uma tela interna (empilha no histórico)
  function ir(tela, p) {
    var estado = { tela: tela, p: p || {}, prof: profundidade() + 1 };
    history.pushState(estado, "");
    atual = { tela: tela, p: p || {} };
    desenhar(true);
  }
  // Troca a tela atual sem empilhar (ex.: depois do primeiro acesso)
  function substituir(tela, p) {
    history.replaceState({ tela: tela, p: p || {}, prof: profundidade() }, "");
    atual = { tela: tela, p: p || {} };
    desenhar(true);
  }
  // Toque numa aba: volta tudo que estava empilhado e mostra a aba
  function trocarAba(tela) {
    var prof = profundidade();
    if (prof > 0) { abaPendente = tela; history.go(-prof); return; }
    history.replaceState({ tela: tela, p: {}, prof: 0 }, "");
    atual = { tela: tela, p: {} };
    desenhar(true);
  }
  // Volta uma tela (igual ao botão voltar do Android)
  function voltar() {
    if (profundidade() > 0) history.back();
    else trocarAba("inicio");
  }
  window.addEventListener("popstate", function (ev) {
    var s = ev.state || { tela: "inicio", p: {}, prof: 0 };
    if (abaPendente) {
      var t = abaPendente; abaPendente = null;
      history.replaceState({ tela: t, p: {}, prof: 0 }, "");
      atual = { tela: t, p: {} };
    } else {
      atual = { tela: s.tela, p: s.p || {} };
    }
    document.getElementById("modal").hidden = true;
    desenhar(true);
  });

  /*
   * desenhar(novaTela) — redesenha a tela atual a partir dos dados.
   * novaTela=true: volta a rolagem para o topo e põe o foco no conteúdo.
   */
  function desenhar(novaTela) {
    var corpo = document.getElementById("corpo");
    var ap = Dados.aparelho() || {};
    // Sem código do casal ou sem saber quem usa: só as telas de primeiro acesso
    var telasAcesso = { acesso: 1, criar: 1, entrar: 1, quem: 1 };
    if (!ap.codigo && !(atual.tela in telasAcesso && atual.tela !== "quem")) atual = { tela: "acesso", p: {} };
    else if (ap.codigo && !ap.eu && atual.tela !== "quem") atual = { tela: "quem", p: { primeiro: true } };

    var fn = TELAS[atual.tela] || TELAS.inicio;
    var rolagem = corpo.scrollTop;
    var r;
    try {
      r = fn(atual.p || {});
    } catch (e) {
      console.error(e);
      r = { titulo: "Ops", conteudo: [vazio("Algo deu errado ao montar esta tela: " + (e && e.message ? e.message : e), "Voltar ao início", function () { trocarAba("inicio"); })] };
    }
    document.getElementById("tituloTela").textContent = r.titulo || "";
    document.getElementById("subTela").textContent = r.sub || "";
    document.title = (r.titulo ? r.titulo + " · " : "") + "Gastos do Casal";
    corpo.className = "corpo" + (r.form ? " form" : "") + (r.semAbas ? " semabas" : "");
    corpo.textContent = "";
    anexar(corpo, h("section", { "aria-label": r.titulo || "" }, r.conteudo));

    var aba = ABA_DA_TELA[atual.tela] || null;
    var abas = document.getElementById("abas");
    abas.hidden = !!r.semAbas;
    Array.prototype.forEach.call(abas.querySelectorAll(".aba"), function (a) {
      a.setAttribute("aria-selected", a.dataset.tela === aba ? "true" : "false");
    });
    document.getElementById("btnLancar").hidden = !!(r.semAbas || r.form || atual.tela === "lancar");
    atualizarQuem();
    atualizarSinc();

    if (novaTela) {
      telaConcluida = false;
      corpo.scrollTop = 0;
      if (r.focar) { setTimeout(function () { try { r.focar.focus(); } catch (e) { /* ignora */ } }, 60); }
    } else {
      corpo.scrollTop = rolagem;
    }
    telaEhFormulario = !!r.form;
    conferirDigitando();
    setTimeout(conferirDigitando, 120);
  }
  var telaEhFormulario = false;

  // Liga/desliga o modo "teclado aberto" conforme o elemento com foco.
  // Também é chamado depois de cada desenho: se o campo com foco sumiu da tela,
  // o navegador não avisa (focusout), e as abas ficariam escondidas.
  var SELETOR_DIGITAVEL = "input:not([type=checkbox]):not([type=file]), select, textarea";
  function conferirDigitando() {
    var a = document.activeElement;
    var digitando = !!(a && a.matches && a.matches(SELETOR_DIGITAVEL) && document.body.contains(a));
    document.body.classList.toggle("digitando", digitando);
    // terminou de digitar e os dados mudaram nesse meio-tempo: redesenha agora
    if (!digitando && redesenhoAdiado) { redesenhoAdiado = false; aoMudarDados(); }
  }

  // Quando os dados mudam (salvou, puxou da nuvem): redesenha, exceto em formulário
  // (para não apagar o que a pessoa está digitando). O indicador sempre atualiza.
  // Fora de formulário (ex.: Config > Orçamento) também não redesenha enquanto um campo está
  // com o foco: o redesenho fica adiado até a pessoa sair do campo (ver conferirDigitando).
  var redesenhoAgendado = false, redesenhoAdiado = false;
  function aoMudarDados() {
    atualizarSinc();
    if (telaEhFormulario || redesenhoAgendado) return;
    if (document.body.classList.contains("digitando")) { redesenhoAdiado = true; return; }
    if (!document.getElementById("modal").hidden) return;
    redesenhoAgendado = true;
    requestAnimationFrame(function () { redesenhoAgendado = false; desenhar(false); });
  }

  /* =====================================================================
   * 4. TOPO: quem está usando + indicador de sincronização
   * ===================================================================== */

  function atualizarQuem() {
    var ap = Dados.aparelho() || {};
    var q = document.getElementById("quem");
    q.hidden = !ap.eu;
    document.getElementById("quemNome").textContent = ap.eu || "";
    var nomes = nomesCasal();
    q.className = "quem" + (ap.eu && nomes.length > 1 && ap.eu === nomes[1] ? " ela" : "");
  }

  function atualizarSinc() {
    var el = document.getElementById("sinc");
    var txt = document.getElementById("sincTexto");
    var ap = Dados.aparelho() || {};
    var e = (Dados.estado && Dados.estado()) || {};
    var classe = "", t;
    var semNuvem = e.nuvemConfigurada === false || !(window.CONFIG && CONFIG.supabaseUrl);
    var n = e.pendentes || 0;
    if (!ap.codigo) { t = "sem casal configurado"; classe = "local"; }
    else if (semNuvem) { t = "só neste celular"; classe = "local"; }
    else if (e.sincronizando) { t = "sincronizando…"; classe = "girando"; }
    else if (n > 0 && e.online === false) { t = n + (n === 1 ? " pendente" : " pendentes") + " — sem internet"; classe = "offline"; }
    else if (e.online === false) { t = "sem internet"; classe = "offline"; }
    else if (e.erro) { t = (n ? n + " pendentes — " : "") + "erro ao sincronizar"; classe = "erro"; }
    else if (n > 0) { t = n + (n === 1 ? " pendente" : " pendentes"); classe = "pendente"; }
    else { t = "tudo sincronizado"; }
    el.className = "sinc" + (classe ? " " + classe : "");
    txt.textContent = t;
    el.title = e.ultimaSync ? "Última sincronização: " + momentoBR(e.ultimaSync) : "";
  }

  /* =====================================================================
   * 5. TELAS
   * Cada função recebe os parâmetros e devolve:
   *   {titulo, sub, conteudo:[elementos], form:bool, semAbas:bool, focar:elemento}
   * ===================================================================== */

  var TELAS = {};

  /* ---------------- 5.1 Primeiro acesso ---------------- */

  TELAS.acesso = function () {
    return {
      titulo: "Gastos do Casal", sub: "primeiro acesso", semAbas: true,
      conteudo: [
        h("div", { class: "boasvindas" },
          h("h2", null, "Bem-vindos"),
          h("p", null, "Os dois celulares usam o mesmo código do casal. Quem abrir primeiro cria o código; o outro digita o mesmo código.")),
        botao("Criar código do casal", function () { ir("criar"); }, "grande"),
        botao("Já tenho o código", function () { ir("entrar"); }, "fraco"),
        h("div", { class: "cartao plano texto-plano" },
          "O código funciona como senha: quem tem o código vê os lançamentos. Guarde e só passe para quem deve ver.")
      ]
    };
  };

  TELAS.criar = function () {
    var n1 = entradaTexto("", { autocomplete: "given-name", enterkeyhint: "next", maxlength: "40" });
    var n2 = entradaTexto("", { autocomplete: "off", enterkeyhint: "done", maxlength: "40" });
    var erro = caixaErro();
    var salvando = false;
    function criar() {
      if (salvando) return;
      var a = n1.value.trim(), b = n2.value.trim();
      if (!a || !b) return mostrarErro(erro, "Escreva o nome dos dois.");
      if (a.toLowerCase() === b.toLowerCase()) return mostrarErro(erro, "Os dois nomes precisam ser diferentes.");
      salvando = true; erro.hidden = true;
      var bt = document.querySelector('[data-acao="salvar"]');
      if (bt) { bt.disabled = true; bt.textContent = "Criando…"; }
      return Promise.resolve().then(function () { return Dados.criarCasal([a, b]); }).then(function (codigo) {
        substituir("quem", { primeiro: true, novoCodigo: codigo || (Dados.aparelho() || {}).codigo });
      }).catch(function (e) {
        salvando = false;
        if (bt) { bt.disabled = false; bt.textContent = "Criar código"; }
        mostrarErro(erro, "Não deu para criar: " + (e && e.message ? e.message : "verifique a internet e tente de novo."));
      });
    }
    return {
      titulo: "Criar código do casal", semAbas: true, form: true, focar: n1,
      conteudo: [
        voltaBotao("Voltar"),
        h("p", { class: "texto-plano", style: "margin:0" }, "Escreva o nome de cada um como quer que apareça no app (em \"quem lançou\")."),
        campo("Nome de um", n1), campo("Nome do outro", n2),
        h("div", { class: "nota" }, window.CONFIG && CONFIG.supabaseUrl ? "Criar o código precisa de internet." : "A nuvem ainda não está configurada: o casal será criado só neste celular."),
        erro,
        rodapeForm("Criar código", criar)
      ]
    };
  };

  TELAS.entrar = function () {
    var cod = entradaTexto("", { autocapitalize: "characters", autocomplete: "off", spellcheck: "false", placeholder: "XXXX-XXXX", maxlength: "9", class: "num", style: "letter-spacing:.1em; text-transform:uppercase" });
    var erro = caixaErro();
    var enviando = false;
    // Formata enquanto digita: "ab12cd34" -> "AB12-CD34"
    cod.addEventListener("input", function () {
      var limpo = cod.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      cod.value = limpo.length > 4 ? limpo.slice(0, 4) + "-" + limpo.slice(4) : limpo;
    });
    function entrar() {
      if (enviando) return;
      var c = cod.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return mostrarErro(erro, "O código tem 8 letras/números, no formato XXXX-XXXX.");
      enviando = true; erro.hidden = true;
      var bt = document.querySelector('[data-acao="salvar"]');
      if (bt) { bt.disabled = true; bt.textContent = "Conferindo…"; }
      return Promise.resolve().then(function () { return Dados.entrarCasal(c); }).then(function (res) {
        if (res && res.ok === false) throw new Error(res.motivo || "código não encontrado");
        substituir("quem", { primeiro: true });
        // puxa os dados da nuvem em segundo plano (nomes do casal, cadastros)
        try { var p = Dados.sincronizar(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* segue offline */ }
      }).catch(function (e) {
        enviando = false;
        if (bt) { bt.disabled = false; bt.textContent = "Entrar"; }
        mostrarErro(erro, "Não deu para entrar: " + (e && e.message ? e.message : "confira o código."));
      });
    }
    return {
      titulo: "Já tenho o código", semAbas: true, form: true, focar: cod,
      conteudo: [
        voltaBotao("Voltar"),
        h("p", { class: "texto-plano", style: "margin:0" }, "Digite o código que aparece em Config, no outro celular."),
        campo("Código do casal", cod),
        erro,
        rodapeForm("Entrar", entrar, "Sem internet o app aceita o código e confere depois.")
      ]
    };
  };

  // "Quem está usando este celular?" — no primeiro acesso e em Config
  TELAS.quem = function (p) {
    var nomes = nomesCasal();
    var ap = Dados.aparelho() || {};
    function escolher(nome) {
      if (telaConcluida) return; // toque duplo
      gravar(function () { return Dados.definirEu(nome); });
      if (p.primeiro) { telaConcluida = true; substituir("inicio"); } else concluir();
      avisar("Este celular agora é de " + nome + ".");
    }
    var outro = entradaTexto("", { maxlength: "40" });
    var conteudo = [];
    if (!p.primeiro) conteudo.push(voltaBotao("Configuração"));
    if (p.novoCodigo) {
      conteudo.push(h("div", { class: "cartao", style: "text-align:center" },
        h("div", { class: "nota" }, "Código do casal criado. Anote e use no outro celular (ele fica em Config):"),
        h("div", { class: "codigo num" }, p.novoCodigo)));
    }
    conteudo.push(h("div", { class: "boasvindas" }, h("h2", null, "Quem está usando este celular?"),
      h("p", null, "Os lançamentos feitos aqui saem com esse nome.")));
    nomes.forEach(function (n) {
      conteudo.push(botao(n, function () { escolher(n); }, n === ap.eu ? "grande" : "grande fraco"));
    });
    if (!nomes.length) {
      // Pode acontecer ao entrar sem internet: os nomes ainda não chegaram da nuvem
      var erro = caixaErro();
      conteudo.push(h("div", { class: "nota" }, "Os nomes do casal ainda não chegaram da nuvem. Escreva o seu nome:"),
        campo("Seu nome", outro), erro,
        botao("Continuar", function () {
          var n = outro.value.trim();
          if (!n) return mostrarErro(erro, "Escreva o seu nome.");
          escolher(n);
        }));
    }
    return { titulo: "Quem é você", semAbas: !!p.primeiro, conteudo: conteudo };
  };

  /* ---------------- 5.2 Início ---------------- */

  TELAS.inicio = function () {
    var regs = registros(), hj = hoje();
    var r = Regras.resumoMes(paraRegras(), ui.mes, hj);
    var mesFat = Regras.somaMes(ui.mes, 1);
    var f = Regras.faturasDoMes(paraRegras(), mesFat, hj);
    var conteudo = [seletorMes(ui.mes, function (m) { ui.mes = m; desenhar(false); })];

    // Orçamento do salário (R9): base, faixas, mercado, extras e metas
    var orc = Regras.resumoOrcamento(paraRegras(), ui.mes, hj);
    var temBase = !!orc && orc.base !== null && orc.base !== undefined;

    conteudo.push(h("div", { class: "par" },
      tile("Entrou", dinheiro(r.entrou), "a receber ainda: " + dinheiro(r.aReceber), "entrou"),
      tile("Gastou", dinheiro(r.gastou), "só gasto de vocês dois", "saiu")));
    if (temBase) {
      // Herói novo: quanto sobra do SALÁRIO (renda extra não entra nessa conta)
      var gastosOrc = orc.fixas.usado + orc.livre.usado;
      conteudo.push(h("div", { class: "heroi" },
        h("div", { class: "rot" }, "Sobra do salário no mês"),
        h("div", { class: "v num", style: "color:var(" + (orc.sobraSalario < 0 ? "--alerta" : "--accent") + ")" }, dinheiro(orc.sobraSalario)),
        h("div", { class: "sub" }, "Salário " + dinheiro(orc.base) + " − gastos " + dinheiro(gastosOrc))));
    } else {
      // Sem salário cadastrado: continua o herói antigo (Entrou − Gastou)
      conteudo.push(h("div", { class: "heroi" },
        h("div", { class: "rot" }, "Sobrou"),
        h("div", { class: "v num", style: "color:var(" + (r.sobrou < 0 ? "--alerta" : "--accent") + ")" }, dinheiro(r.sobrou)),
        h("div", { class: "sub" }, r.sobrou < 0 ? "gastou mais do que entrou de verdade" : "do que já entrou de verdade")));
    }
    conteudo.push(h("button", { type: "button", class: "botao grande", onclick: function () { ir("lancar"); } }, "+  Lançar um gasto"));

    // Começando do zero: mostra o caminho dos cadastros
    var semCadastros = !doTipo("fonte", regs).length && !doTipo("cartao", regs).length && !doTipo("lancamento", regs).length;
    if (semCadastros) {
      conteudo.push(h("div", { class: "vazio" },
        h("p", null, "Ainda não tem nada aqui. Comece cadastrando de onde vem o dinheiro e os cartões de vocês."),
        h("div", { class: "botoes", style: "width:100%" },
          botao("Fontes de renda", function () { ir("cadastros", { tipo: "fonte" }); }, "fraco mini"),
          botao("Cartões", function () { ir("cadastros", { tipo: "cartao" }); }, "fraco mini"))));
    }

    // Orçamento do salário: aviso do mercadinho e os cards (CONTRATO seção 8.3)
    if (orc) {
      var aviso = avisoMercadinho(orc.mercado);
      if (aviso) conteudo.splice(conteudo.length - (semCadastros ? 1 : 0), 0, aviso); // logo abaixo do botão Lançar
      conteudo.push(cardOrcamento(orc, temBase));
      conteudo.push(cardMercado(orc.mercado));
      var temFonteExtra = doTipo("fonte", regs).some(function (fo) { return fo.extra === true; });
      if (temFonteExtra || (orc.extras.itens || []).length) conteudo.push(cardExtra(orc.extras));
      if ((orc.metas || []).length) conteudo.push(cardMetas(orc.metas, orc.base));
    }

    conteudo.push(atalho("Ver o mês em detalhe", "receitas, categorias e todos os lançamentos", null, function () { trocarAba("mes"); }));
    conteudo.push(atalho("Faturas a pagar em " + nomeMes(mesFat),
      f.totalTerceiros > 0 ? dinheiro(f.totalTerceiros) + " disso é de parentes" : (doTipo("cartao", regs).length ? "nenhuma compra de parente" : "nenhum cartão cadastrado"),
      dinheiro(f.total), function () { ui.mesFatura = mesFat; trocarAba("cartoes"); }));
    return { titulo: "Início", sub: maiuscula(mesExtenso(ui.mes)), conteudo: conteudo };
  };

  /* ---------- 5.2.1 Orçamento do salário no Início (CONTRATO seção 8.3) ---------- */

  // Reais sem centavos, para caber nas faixas: 548237 -> "R$ 5.482"; sem "R$": "5.482"
  function reaisCurto(c, semSimbolo) {
    if (c === null || c === undefined) return NI;
    var r = Math.round(Math.abs(c) / 100);
    var t = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (c < 0 && r > 0 ? "−" : "") + (semSimbolo ? "" : "R$ ") + t;
  }
  // Porcentagem com vírgula: 4.2 -> "4,2%"
  function pctBR(p) { return (Math.round(p * 10) / 10).toString().replace(".", ",") + "%"; }

  // Cor da barra de uma faixa: normal; "quase" a partir de 80% do alvo; "estourou" acima de 100%
  function classeFaixa(usado, alvo) {
    if (alvo === null || alvo === undefined) return "";
    if (alvo <= 0) return usado > 0 ? "estourou" : "";
    if (usado > alvo) return "estourou";
    if (usado >= alvo * 0.8) return "quase";
    return "";
  }

  // Uma faixa: título e "R$ X de R$ Y" em cima, barra no meio, rodapé embaixo
  function faixa(titulo, direita, pct, classe, rodape) {
    return h("div", { class: "faixa" },
      h("div", { class: "cab" }, h("b", null, titulo), h("span", { class: "num" }, direita)),
      trilha(pct, classe),
      rodape ? h("div", { class: "rodape" }, rodape) : null);
  }

  /*
   * Aviso do mercadinho (só quando o nível não é "ok"). Textos exatos do contrato:
   *   metade -> "Já foi metade do mercadinho do mês."
   *   alto   -> "Ô, irmão, o mercadinho já tá alto, segura aí."
   *   passou -> "Mercadinho passou da referência." + quanto passou
   */
  function avisoMercadinho(m) {
    if (!m || !m.nivel || m.nivel === "ok") return null;
    var titulo, resto, classe = "dica alerta";
    if (m.nivel === "passou") {
      titulo = "Mercadinho passou da referência.";
      resto = " Já foi " + dinheiro(m.mercadinho) + ", " + dinheiro(m.mercadinho - m.referencia) + " acima dos " + dinheiro(m.referencia) + ".";
    } else if (m.nivel === "alto") {
      titulo = "Ô, irmão, o mercadinho já tá alto, segura aí.";
      resto = " " + dinheiro(m.mercadinho) + " de " + dinheiro(m.referencia) + ".";
    } else {
      titulo = "Já foi metade do mercadinho do mês.";
      resto = " " + dinheiro(m.mercadinho) + " de " + dinheiro(m.referencia) + ".";
      classe = "dica";
    }
    return h("div", { class: classe, role: "status" }, h("b", null, titulo), resto);
  }

  // Card "Orçamento do salário · regra X": fixas e parcelas / livre / investir
  function cardOrcamento(o, temBase) {
    var titulo = "Orçamento do salário · regra " + o.regra;
    if (!temBase) {
      return secao(titulo, vazio("Sem salário cadastrado, não dá para montar o orçamento. Cadastre o salário em Config > Fontes de renda.",
        "Cadastrar o salário", function () { ir("cadastros", { tipo: "fonte" }); }));
    }
    var p = o.pcts;
    // texto "sobram R$ X" ou "passou R$ X" de uma faixa
    function sobraOuPassou(usado, alvo) {
      return usado > alvo ? "passou " + reaisCurto(usado - alvo) : "sobram " + reaisCurto(alvo - usado);
    }
    var fx = o.fixas, lv = o.livre, inv = o.investir;
    var rodInvestir;
    if (inv.sobra < 0) rodInvestir = "O salário não cobriu os gastos: faltam " + reaisCurto(-inv.sobra) + " para fechar o mês";
    else if (inv.sobra >= inv.alvo) rodInvestir = "É o que sobra do salário. Já dá os " + p.investir + "%";
    else rodInvestir = "É o que sobra do salário. Faltam " + reaisCurto(inv.alvo - inv.sobra) + " para os " + p.investir + "%";
    var origem = (o.baseOrigem || []).map(function (b) { return b.nome || NI; }).join(" + ");
    return secao(titulo,
      h("div", { class: "cartao barras" },
        faixa("Fixas e parcelas · " + p.fixas + "%", reaisCurto(fx.usado) + " de " + reaisCurto(fx.alvo),
          fx.alvo > 0 ? fx.usado / fx.alvo * 100 : (fx.usado > 0 ? 100 : 0), classeFaixa(fx.usado, fx.alvo),
          "Contas fixas " + reaisCurto(fx.contas) + " + parcelas " + reaisCurto(fx.parcelas) + " · " + sobraOuPassou(fx.usado, fx.alvo)),
        faixa("Livre · " + p.livre + "%", reaisCurto(lv.usado) + " de " + reaisCurto(lv.alvo),
          lv.alvo > 0 ? lv.usado / lv.alvo * 100 : (lv.usado > 0 ? 100 : 0), classeFaixa(lv.usado, lv.alvo),
          "Mercado, posto, lazer e o resto · " + sobraOuPassou(lv.usado, lv.alvo)),
        faixa("Investir · " + p.investir + "%", reaisCurto(inv.sobra) + " de " + reaisCurto(inv.alvo),
          inv.alvo > 0 ? inv.sobra / inv.alvo * 100 : 0, inv.sobra < 0 ? "estourou" : "meta", rodInvestir)),
      h("div", { class: "nota" }, "Salário previsto: " + dinheiro(o.base) + (origem ? " (" + origem + ")" : "") + ". A regra e o salário mudam em Config."));
  }

  // Card "Mercado": compra mensal, mercadinho e a régua 50% / 80% / 100% da referência
  function cardMercado(m) {
    var ref = m.referencia;
    var pct = ref > 0 ? m.mercadinho / ref * 100 : 0;
    var classe = m.nivel === "passou" ? "estourou" : m.nivel === "alto" ? "quase" : "";
    var idas = m.idasMercadinho || 0;
    var barraMarcos = h("div", { class: "trilha marco", role: "presentation" },
      h("div", { class: "preenche" + (classe ? " " + classe : ""), style: "width:" + Math.max(0, Math.min(100, pct)).toFixed(1) + "%" }),
      h("i", { style: "left:50%" }), h("i", { style: "left:80%" }));
    var regua = h("div", { class: "regua", "aria-hidden": "true" },
      h("span", { style: "left:0" }, "R$ 0"),
      h("span", { style: "left:50%" }, reaisCurto(Math.round(ref * 0.5), true)),
      h("span", { style: "left:80%" }, reaisCurto(Math.round(ref * 0.8), true)),
      h("span", { style: "left:100%" }, reaisCurto(ref, true)));
    return secao("Mercado", h("div", { class: "cartao" },
      linha("Compra mensal", { det: "a compra grande do mês", dir: dinheiro(m.compraMensal) }),
      linha("Mercadinho", { det: idas + (idas === 1 ? " ida" : " idas") + " · referência " + reaisCurto(ref), dir: dinheiro(m.mercadinho), corDir: m.nivel === "passou" ? "var(--alerta)" : null }),
      h("div", { style: "margin-top:10px", role: "img", "aria-label": "Mercadinho em " + pctBR(pct) + " da referência" }, barraMarcos, regua)));
  }

  // Card "Extra · fora do orçamento": o que entrou de RAS, PROEIS, segurança...
  function cardExtra(ex) {
    var itens = ex.itens || [];
    var linhas = itens.map(function (it) {
      var recebido = it.recebido !== null && it.recebido !== undefined;
      return linha(it.nome || NI, {
        det: recebido ? "recebido " + diaMes(it.data) : "a receber",
        dir: dinheiro(recebido ? it.recebido : it.previsto), corDir: recebido ? null : "var(--ink-3)"
      });
    });
    if (!linhas.length) linhas.push(h("div", { class: "nota", style: "padding-bottom:9px" }, "Nada de extra em " + nomeMes(ui.mes) + ". Lance o que entrar em Mês › Receita avulsa, escolhendo a fonte."));
    linhas.push(linha("Entrou de extra", {
      det: (ex.aReceber > 0 ? "a receber ainda: " + dinheiro(ex.aReceber) + ". " : "") + "Não paga conta. Vai para dívida ou reserva.",
      dir: dinheiro(ex.recebido), classe: "total"
    }));
    var card = h("div", { class: "cartao extra" }, linhas);
    // o valor total fica na cor da caixa extra
    var tot = card.querySelector(".linha.total .dir");
    if (tot) tot.classList.add("v");
    return secao("Extra · fora do orçamento", card);
  }

  // Card "Metas": reservas com meta, com quantos salários a meta vale
  function cardMetas(metas, base) {
    var algumSemGuardado = false;
    var faixas = metas.map(function (mt) {
      var semGuardado = mt.guardado === null || mt.guardado === undefined;
      if (semGuardado) algumSemGuardado = true;
      var partes = [];
      if (base) {
        var salarios = Math.round(mt.meta / base * 10) / 10;
        partes.push(String(salarios).replace(".", ",") + (salarios === 1 ? " salário" : " salários"));
      }
      partes.push(semGuardado ? "guardado " + NI : pctBR(mt.pct || 0) + " guardado");
      return faixa(mt.nome || NI, (semGuardado ? NI : reaisCurto(mt.guardado)) + " de " + reaisCurto(mt.meta),
        semGuardado ? 0 : mt.pct, "meta", partes.join(" · "));
    });
    return secao("Metas", h("div", { class: "cartao barras" }, faixas),
      algumSemGuardado ? h("div", { class: "nota" }, "Atualize o valor guardado em Config › Reservas e metas.") : null);
  }

  /* ---------------- 5.3 Mês em detalhe ---------------- */

  // Abre o item tocado na lista de lançamentos do mês
  function abrirItem(item) {
    var id = item.id || "";
    var reg = Dados.obter(id);
    if (!reg && item.lancamento_id) reg = Dados.obter(item.lancamento_id);
    if (!reg && id.indexOf(":") > 0 && id.slice(0, 3) !== "cf:") reg = Dados.obter(id.split(":")[0]);
    if (!reg && item.conta_fixa_id) reg = Dados.obter(item.conta_fixa_id);
    if (!reg) { avisar("Não encontrei esse registro."); return; }
    if (reg.tipo === "lancamento") ir("lancar", { id: reg.id });
    else if (reg.tipo === "conta_fixa") ir("fixa", { conta_fixa_id: reg.id, mes: ui.mes }); // id do item de conta fixa = id da conta
    else if (reg.tipo === "fixa_confirmada") ir("fixa", { conta_fixa_id: reg.conta_fixa_id, mes: reg.mes });
    else avisar("Este item não pode ser editado aqui.");
  }

  TELAS.mes = function () {
    var regs = registros(), hj = hoje();
    var r = Regras.resumoMes(paraRegras(), ui.mes, hj);
    var nomes = nomesCasal();
    var conteudo = [seletorMes(ui.mes, function (m) { ui.mes = m; ui.verTodosItens = false; desenhar(false); })];

    // --- De onde veio o dinheiro ---
    var fontes = doTipo("fonte", regs);
    var linhasReceita = [];
    // r.receitas: uma linha por ocorrência (quinzenal = 2), com id_confirmacao pronto
    (r.receitas || []).forEach(function (rc) {
      var fonte = porId(rc.fonte_id, regs) || {};
      var nome = (rc.nome || NI) + (rc.totalOcorrencias > 1 ? " — " + rc.ocorrencia + "ª " + (fonte.periodicidade === "quinzenal" ? "quinzena" : "parte") : "");
      var confirmado = !!rc.confirmada;
      var det = confirmado
        ? "previsto " + dinheiro(rc.previsto) + " · recebido " + diaMes(rc.data)
        : [rc.dataPrevista ? "previsto para " + diaMes(rc.dataPrevista) + " · " : "", h("b", { style: "color:var(--alerta)" }, "ainda não confirmado")];
      linhasReceita.push(linha(nome, {
        det: det, dir: dinheiro(confirmado ? rc.recebido : rc.previsto), corDir: confirmado ? null : "var(--ink-3)",
        rotulo: (confirmado ? "Editar recebimento de " : "Confirmar recebimento de ") + nome,
        aoTocar: function () { ir("receita", { fonte_id: rc.fonte_id, mes: ui.mes, ocorrencia: rc.ocorrencia, id_confirmacao: rc.id_confirmacao, previsto: rc.previsto, nome: nome }); }
      }));
    });
    // r.avulsas: dinheiro extra lançado à mão neste mês
    (r.avulsas || []).forEach(function (a) {
      linhasReceita.push(linha(a.descricao || a.nome || NI, {
        det: "lançado à mão · recebido " + diaMes(a.data), dir: dinheiro(a.recebido),
        aoTocar: function () { ir("avulsa", { id: a.id }); }
      }));
    });
    var grupoReceita = [];
    if (!linhasReceita.length) {
      grupoReceita.push(fontes.length
        ? vazio("Nenhuma receita prevista para " + mesExtenso(ui.mes) + ".", null)
        : vazio("Cadastre de onde vem o dinheiro (salários, extras) em Config.", "Cadastrar fonte de renda", function () { ir("cadastro", { tipo: "fonte" }); }));
    } else {
      linhasReceita.push(linha(h("b", null, "Entrou de verdade"), { det: "previsto do mês: " + dinheiro(r.previsto), dir: dinheiro(r.entrou), corDir: "var(--accent)", classe: "total" }));
      grupoReceita.push(h("div", { class: "cartao" }, linhasReceita));
      grupoReceita.push(h("div", { class: "cartao plano texto-plano" },
        "Receita prevista não entra no \"Entrou\" até você confirmar. Toque numa receita para confirmar o recebimento."));
    }
    grupoReceita.push(botao("+ Receita avulsa (entrou um dinheiro extra)", function () { ir("avulsa", {}); }, "fraco"));
    conteudo.push(secao.apply(null, ["De onde veio o dinheiro"].concat(grupoReceita)));

    // --- Para onde foi (categorias) ---
    var cats = (r.porCategoria || []).filter(function (c) { return c.total; });
    if (cats.length) {
      var maior = Math.max.apply(null, cats.map(function (c) { return c.total; }));
      var deParcelas = r.totalParcelas || 0;
      conteudo.push(secao("Para onde foi", h("div", { class: "cartao" },
        h("div", { class: "barras" }, cats.map(function (c) { return barra(c.nome || NI, dinheiro(c.total), maior ? c.total / maior * 100 : 0); })),
        h("div", { class: "linha", style: "border-top:1px solid var(--line); margin-top:12px; padding-bottom:0; padding-top:9px" },
          h("div", { class: "esq" }, h("span", { class: "nome" }, h("b", null, "Total")),
            deParcelas ? h("span", { class: "det" }, "inclui " + dinheiro(deParcelas) + " de parcelas do mês") : null),
          h("span", { class: "dir num", style: "font-weight:600" }, dinheiro(r.gastou))))));
    }

    // --- Quem lançou ---
    // porPessoa já traz os dois nomes do casal (mesmo com zero) e pct com 1 casa (60.4)
    var pessoas = (r.porPessoa || []).filter(function (p) { return p.total || p.nome; });
    if (r.gastou > 0 && pessoas.length) {
      conteudo.push(secao("Quem lançou", h("div", { class: "cartao" },
        h("div", { class: "barras" }, pessoas.map(function (p) {
          var ela = nomes.length > 1 && p.nome === nomes[1];
          var pct = p.pct || 0;
          return barra(p.nome || NI, dinheiro(p.total) + " · " + pct.toFixed(1).replace(".", ",") + "%", pct, ela ? "ela" : "");
        })),
        nomes.length > 1 ? h("div", { class: "legenda" },
          h("span", null, h("i", { style: "background:var(--accent)" }), nomes[0]),
          h("span", null, h("i", { style: "background:var(--esposa)" }), nomes[1])) : null)));
    }

    // --- Reservas ---
    var reservas = doTipo("reserva", regs).sort(porNome);
    if (reservas.length) {
      conteudo.push(secao("Reservas", reservas.map(function (rv) {
        var temMeta = rv.meta !== null && rv.meta !== undefined && rv.meta > 0;
        return h("button", { type: "button", class: "cartao", onclick: function () { ir("cadastro", { tipo: "reserva", id: rv.id }); } },
          linha(rv.nome || NI, { det: temMeta ? "meta " + dinheiro(rv.meta) : "sem meta", dir: dinheiro(rv.valor_guardado) }),
          temMeta ? trilha((rv.valor_guardado || 0) / rv.meta * 100, "", "margin-top:10px") : null,
          temMeta ? h("div", { class: "nota", style: "margin-top:6px" }, rv.valor_guardado == null ? "Faltam: " + NI + " (informe quanto já tem guardado)" : rv.valor_guardado >= rv.meta ? "Meta alcançada" : "Faltam " + dinheiro(rv.meta - rv.valor_guardado)) : null);
      })));
    }

    // --- Contas fixas do mês ---
    var fixas = r.fixas || [];
    var tituloFixas = "Contas fixas de " + nomeMes(ui.mes);
    if (fixas.length) {
      var fr = r.fixasResumo || {};
      conteudo.push(secao(tituloFixas,
        h("div", { class: "par" },
          tile("Previsto", dinheiro(fr.previsto || 0), fixas.length + (fixas.length === 1 ? " conta" : " contas")),
          tile("Confirmado", dinheiro(fr.confirmado || 0), (fr.confirmadas || 0) + " de " + fixas.length, "entrou")),
        atalho(listaNomes(fixas.map(function (x) { return x.nome; })), "toque para confirmar o valor real", null, function () { ir("fixas"); })));
    } else {
      conteudo.push(secao(tituloFixas, vazio("Nenhuma conta fixa neste mês. Luz, internet, escola: cadastre uma vez e ela aparece todo mês.", "Cadastrar conta fixa", function () { ir("cadastro", { tipo: "conta_fixa" }); })));
    }

    // --- Todos os lançamentos do mês ---
    var itens = r.itens || [];
    var tituloItens = "Todos os lançamentos de " + nomeMes(ui.mes);
    if (!itens.length) {
      conteudo.push(secao(tituloItens, vazio("Nenhum gasto do casal neste mês.", "Lançar um gasto", function () { ir("lancar"); })));
    } else {
      var LIMITE = 30;
      var mostrar = ui.verTodosItens ? itens : itens.slice(0, LIMITE);
      // Como no protótipo: parcela ganha o selo "parcela 3/12" e mostra a data da compra;
      // conta fixa mostra "conta fixa confirmada/prevista" no detalhe
      var linhas = mostrar.map(function (it) {
        var seloItem = it.tipoItem === "parcela" ? selo("parcela " + it.k + "/" + it.n, "casal") : null;
        var partes = it.tipoItem === "parcela"
          ? ["comprada " + diaMes(it.data_compra), it.categoria || NI, it.meio || NI, it.lancado_por || NI]
          : it.tipoItem === "fixa"
            ? [diaMes(it.data), it.categoria || NI, it.meio || NI, it.rotulo]
            : [diaMes(it.data), it.categoria || NI, it.meio || NI, it.lancado_por || NI];
        return linha(it.descricao || NI, { nomeExtra: seloItem, det: partes.join(" · "), dir: dinheiro(it.valor), aoTocar: function () { abrirItem(it); }, rotulo: "Abrir " + (it.descricao || "lançamento") });
      });
      if (itens.length > LIMITE && !ui.verTodosItens) {
        linhas.push(linha(null, { det: h("span", { style: "color:var(--accent)" }, "+ " + (itens.length - LIMITE) + " lançamentos anteriores"), dir: "→", corDir: "var(--accent)", num: false,
          aoTocar: function () { ui.verTodosItens = true; desenhar(false); } }));
      }
      conteudo.push(secao(tituloItens, h("div", { class: "cartao" }, linhas)));
    }
    return { titulo: maiuscula(nomeMes(ui.mes)) + " em detalhe", sub: maiuscula(mesExtenso(ui.mes)), conteudo: conteudo };
  };

  // "Luz, internet e água"
  function listaNomes(lista) {
    var l = lista.filter(Boolean).map(function (x, i) { return i === 0 ? x : x.charAt(0).toLowerCase() === x.charAt(0) ? x : x; });
    if (l.length <= 1) return l[0] || NI;
    if (l.length > 4) return l.slice(0, 3).join(", ") + " e mais " + (l.length - 3);
    return l.slice(0, -1).join(", ") + " e " + l[l.length - 1];
  }

  /* ---------------- 5.4 Confirmar receita / receita avulsa ---------------- */

  TELAS.receita = function (p) {
    var existente = Dados.obter(p.id_confirmacao);
    var ativo = existente && !existente.apagado;
    var valor = entradaDinheiro(ativo ? existente.valor_recebido : p.previsto);
    var data = entradaData(ativo ? existente.data_recebimento : hoje());
    var erro = caixaErro();
    function salvar() {
      var v = Regras.centavos(valor.value);
      if (v === null || v < 0) return mostrarErro(erro, "Escreva o valor que entrou (ex.: 1.900,00).");
      if (!data.value) return mostrarErro(erro, "Escolha a data em que o dinheiro entrou.");
      var reg = Object.assign({}, existente || {}, {
        id: p.id_confirmacao, tipo: "receita_confirmada", fonte_id: p.fonte_id, mes: p.mes,
        ocorrencia: p.ocorrencia, valor_recebido: v, data_recebimento: data.value, apagado: false
      });
      if (gravar(function () { return Dados.salvar(reg, { motivo: "confirmou receita" }); }, "Recebimento confirmado.") !== null) concluir();
    }
    return {
      titulo: "Confirmar recebimento", sub: maiuscula(mesExtenso(p.mes)), form: true, focar: valor,
      conteudo: [
        voltaBotao("Mês"),
        h("div", { class: "cartao" }, linha(p.nome || NI, { det: "previsto " + dinheiro(p.previsto), dir: ativo ? "confirmada" : "a confirmar", num: false })),
        h("div", { class: "valorao" }, h("label", { for: "rc-valor" }, "Quanto entrou de verdade"),
          (valor.id = "rc-valor", valor), h("div", { class: "ajuda" }, "Se veio diferente do previsto, escreva o valor real.")),
        campo("Data em que entrou", data),
        erro,
        ativo ? botao("Desfazer confirmação", function () {
          apagarComConfirmacao(p.id_confirmacao, "Desfazer esta confirmação?");
        }, "perigo") : null,
        rodapeForm(ativo ? "Salvar alteração" : "Confirmar recebimento", salvar)
      ]
    };
  };

  TELAS.avulsa = function (p) {
    var regs = registros();
    var ex = p.id ? Dados.obter(p.id) : null;
    var desc = entradaTexto(ex ? ex.descricao : "", { maxlength: "80", placeholder: "ex.: RAS, venda, presente" });
    var valor = entradaDinheiro(ex ? ex.valor_recebido : null);
    var data = entradaData(ex ? ex.data_recebimento : hoje());
    var fontes = doTipo("fonte", regs).filter(function (f) { return f.ativo !== false || (ex && ex.fonte_id === f.id); }).sort(porNome);
    var fonte = selecao([{ valor: "", rotulo: "Nenhuma (só este valor)" }].concat(fontes.map(function (f) { return { valor: f.id, rotulo: f.nome }; })), ex ? ex.fonte_id || "" : "");
    var erro = caixaErro();
    valor.id = "av-valor";
    function salvar() {
      var v = Regras.centavos(valor.value);
      if (v === null || v <= 0) return mostrarErro(erro, "Escreva o valor que entrou.");
      if (!desc.value.trim() && !fonte.value) return mostrarErro(erro, "Escreva de onde veio o dinheiro.");
      if (!data.value) return mostrarErro(erro, "Escolha a data.");
      var reg = Object.assign({}, ex || {}, { tipo: "receita_avulsa", fonte_id: fonte.value || null, descricao: desc.value.trim() || null, valor_recebido: v, data_recebimento: data.value });
      if (gravar(function () { return Dados.salvar(reg, { motivo: ex ? "alterou receita avulsa" : "lançou receita avulsa" }); }, "Receita salva.") !== null) concluir();
    }
    return {
      titulo: ex ? "Editar receita avulsa" : "Receita avulsa", form: true, focar: valor,
      conteudo: [
        voltaBotao("Mês"),
        h("div", { class: "valorao" }, h("label", { for: "av-valor" }, "Valor que entrou"), valor),
        campo("De onde veio", desc), campo("Data em que entrou", data), campo("Ligar a uma fonte de renda (opcional)", fonte),
        erro,
        ex ? botao("Apagar esta receita", function () { apagarComConfirmacao(ex.id, "Apagar esta receita?"); }, "perigo") : null,
        rodapeForm("Salvar receita", salvar)
      ]
    };
  };

  /* ---------------- 5.5 Contas fixas do mês ---------------- */

  TELAS.fixas = function () {
    var regs = registros(), hj = hoje();
    var r = Regras.resumoMes(paraRegras(), ui.mes, hj);
    var fixas = r.fixas || [];
    var conteudo = [voltaBotao("Mês"), seletorMes(ui.mes, function (m) { ui.mes = m; desenhar(false); })];
    if (!fixas.length) {
      conteudo.push(vazio("Nenhuma conta fixa em " + mesExtenso(ui.mes) + ". Cadastre luz, internet, escola… uma vez só.", "Cadastrar conta fixa", function () { ir("cadastro", { tipo: "conta_fixa" }); }));
      return { titulo: "Contas fixas", sub: maiuscula(mesExtenso(ui.mes)), conteudo: conteudo };
    }
    var fr = r.fixasResumo || {};
    var conf = fixas.filter(function (x) { return x.confirmada && x.real !== null && x.previsto !== null; });
    conteudo.push(h("div", { class: "par" },
      tile(["Previsto", h("br"), "no começo do mês"], dinheiro(fr.previsto || 0), fixas.length + (fixas.length === 1 ? " conta fixa" : " contas fixas")),
      tile(["Confirmado", h("br"), "com o valor real"], dinheiro(fr.confirmado || 0), (fr.confirmadas || 0) + " de " + fixas.length + " confirmadas", "entrou")));
    // Diferenças entre previsto e real (ex.: "A luz veio R$ 16,42 acima do previsto")
    var difs = conf.filter(function (x) { return x.real !== x.previsto; }).map(function (x) {
      var d = x.real - x.previsto;
      return x.nome + " veio " + dinheiro(Math.abs(d)) + (d > 0 ? " acima" : " abaixo") + " do previsto.";
    });
    conteudo.push(h("div", { class: "cartao plano texto-plano" },
      (difs.length ? difs.join(" ") + " " : "") + "O previsto não é apagado: fica guardado ao lado do real."));
    var cfgPorId = {};
    doTipo("conta_fixa", regs).forEach(function (c) { cfgPorId[c.id] = c; });
    conteudo.push(secao("Contas", fixas.map(function (x) {
      var cf = cfgPorId[x.conta_fixa_id] || {};
      var confirmada = !!x.confirmada;
      return h("button", { type: "button", class: "cartao", onclick: function () { ir("fixa", { conta_fixa_id: x.conta_fixa_id, mes: ui.mes }); }, "aria-label": (confirmada ? "Editar " : "Confirmar ") + x.nome },
        linha(x.nome || NI, { det: "todo dia " + (x.dia || cf.dia || NI) + " · " + (nomeCategoria(cf.categoria_id, regs) || NI), dir: selo(confirmada ? "confirmada" : "a confirmar", confirmada ? "pago" : "aberto"), num: false }),
        linha(null, { det: confirmada ? "previsto " + dinheiro(x.previsto) + " → real " + dinheiro(x.real) : "lançada com o previsto de " + dinheiro(x.previsto), dir: dinheiro(confirmada ? x.real : x.previsto), corDir: confirmada ? null : "var(--ink-3)" }));
    }), botao("+ Nova conta fixa", function () { ir("cadastro", { tipo: "conta_fixa" }); }, "fraco")));
    return { titulo: "Contas fixas", sub: maiuscula(mesExtenso(ui.mes)), conteudo: conteudo };
  };

  // Confirmar o valor real de uma conta fixa num mês
  TELAS.fixa = function (p) {
    var regs = registros();
    var cf = porId(p.conta_fixa_id, regs) || Dados.obter(p.conta_fixa_id);
    if (!cf) return { titulo: "Conta fixa", conteudo: [voltaBotao("Voltar"), vazio("Esta conta fixa não existe mais (pode estar na lixeira).", null)] };
    var idConf = "cf:" + cf.id + ":" + p.mes;
    var ex = Dados.obter(idConf);
    var ativo = ex && !ex.apagado;
    var diaPadrao = Math.min(cf.dia || 1, 28);
    var valor = entradaDinheiro(ativo ? ex.valor_real : cf.valor_previsto);
    valor.id = "fx-valor";
    var data = entradaData(ativo ? ex.data_pagamento : (mesDe(hoje()) === p.mes ? hoje() : p.mes + "-" + dois(diaPadrao)));
    // aviso (não bloqueia): data de pagamento fora do mês que está sendo confirmado
    var avisoData = h("div", { class: "dica alerta", role: "status", hidden: true });
    function conferirData() {
      var fora = !!data.value && mesDe(data.value) !== p.mes;
      avisoData.hidden = !fora;
      avisoData.textContent = fora ? "Data fora de " + mesExtenso(p.mes) + ". Está certo?" : "";
    }
    data.addEventListener("input", conferirData);
    data.addEventListener("change", conferirData);
    setTimeout(conferirData, 0);
    var erro = caixaErro();
    function salvar() {
      var v = Regras.centavos(valor.value);
      if (v === null || v < 0) return mostrarErro(erro, "Escreva o valor que veio na conta.");
      var reg = Object.assign({}, ex || {}, { id: idConf, tipo: "fixa_confirmada", conta_fixa_id: cf.id, mes: p.mes, valor_real: v, data_pagamento: data.value || null, apagado: false });
      if (gravar(function () { return Dados.salvar(reg, { motivo: "confirmou conta fixa" }); }, "Valor real confirmado.") !== null) concluir();
    }
    return {
      titulo: "Confirmar " + (cf.nome || "conta"), sub: maiuscula(mesExtenso(p.mes)), form: true, focar: valor,
      conteudo: [
        voltaBotao("Voltar"),
        h("div", { class: "cartao" },
          linha(cf.nome || NI, { det: "todo dia " + (cf.dia || NI) + " · " + (nomeCategoria(cf.categoria_id, regs) || NI) + " · " + (nomeMeio(cf.meio, regs) || NI), dir: dinheiro(cf.valor_previsto) }),
          linha(null, { det: "valor previsto" })),
        h("div", { class: "valorao" }, h("label", { for: "fx-valor" }, "Valor real de " + nomeMes(p.mes)), valor),
        campo("Data do pagamento", data),
        avisoData,
        erro,
        ativo ? botao("Desfazer confirmação", function () { apagarComConfirmacao(idConf, "Desfazer esta confirmação? O mês volta a usar o valor previsto."); }, "perigo") : null,
        botao("Editar a conta fixa (nome, valor previsto, dia)", function () { ir("cadastro", { tipo: "conta_fixa", id: cf.id }); }, "fraco"),
        rodapeForm(ativo ? "Salvar alteração" : "Confirmar valor real", salvar)
      ]
    };
  };

  /* ---------------- 5.6 Lançar (novo ou edição) ---------------- */

  TELAS.lancar = function (p) {
    var regs = registros();
    var ex = p.id ? Dados.obter(p.id) : null;
    if (p.id && (!ex || ex.apagado)) return { titulo: "Lançamento", conteudo: [voltaBotao("Voltar"), vazio("Este lançamento não existe mais (pode estar na lixeira, em Config).", null)] };
    var parcelado0 = ex && ex.repeticao === "parcelado";

    // valor grande: total da compra (parcelado) ou valor único
    var valor = entradaDinheiro(ex ? (parcelado0 ? ex.valor_total : ex.valor) : null);
    valor.id = "f-valor";
    valor.setAttribute("aria-describedby", "f-valor-ajuda");
    var rotValor = h("label", { for: "f-valor" }, "Valor");
    var ajudaValor = h("div", { class: "ajuda", id: "f-valor-ajuda" }, "");
    var desc = entradaTexto(ex ? ex.descricao : "", { maxlength: "80", placeholder: "ex.: Padaria, Mercado da esquina", enterkeyhint: "done" });
    var data = entradaData(ex ? ex.data_compra : hoje());

    // --- Se repete? ---
    var repOpc = [{ valor: "unico", rotulo: "Não repetir" }, { valor: "parcelado", rotulo: "Parcelado" }];
    if (!ex) repOpc.push({ valor: "fixo", rotulo: "Todo mês" });
    var rep = chips("Se repete?", repOpc, parcelado0 ? "parcelado" : "unico", atualizar);

    // texto (e não type=number) para conseguir recusar "2.5" com uma mensagem clara
    var nParc = h("input", { type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "4", value: parcelado0 ? String(ex.parcelas) : "", placeholder: "2 a 72" });
    // Lê o número de parcelas: inteiro de 2 a 72, senão null
    function lerParcelas() {
      var t = String(nParc.value || "").trim();
      if (!/^\d+$/.test(t)) return null;
      var n = parseInt(t, 10);
      return n >= 2 && n <= 72 ? n : null;
    }
    var vParc = entradaDinheiro(parcelado0 ? ex.valor : null);
    var blocoParc = h("div", { class: "cartao plano", hidden: true },
      h("div", { class: "par" }, campo("Em quantas vezes", nParc), campo("Valor da parcela", vParc)),
      h("div", { class: "dica", style: "margin-top:12px" }, "No gasto do mês entra só ", h("b", null, "a parcela"), ". O compromisso inteiro aparece na aba ", h("b", null, "Parcelas"), "."));
    var diaFixo = entradaDia(null);
    // "Todo dia" acompanha o dia da data da compra até a pessoa mexer no campo
    var diaEditado = false;
    diaFixo.addEventListener("input", function () { diaEditado = true; });
    var blocoFixo = h("div", { class: "cartao plano", hidden: true },
      campo("Todo dia", diaFixo, "o valor acima vira o valor previsto"),
      h("div", { class: "dica", style: "margin-top:12px" }, "Vira ", h("b", null, "conta fixa"), ": entra sozinha todo mês com o previsto, e você confirma o valor real depois (em Mês › Contas fixas)."));

    // Total ↔ parcela: quem a pessoa editou por último manda
    var editouParcela = false;
    valor.addEventListener("input", function () { editouParcela = false; atualizar(); });
    vParc.addEventListener("input", function () { editouParcela = true; atualizar(); });
    nParc.addEventListener("input", atualizar);
    data.addEventListener("change", atualizar);
    data.addEventListener("input", atualizar);

    // --- Categoria ---
    var cats = categoriasAtivas(regs);
    if (ex && ex.categoria_id && !cats.some(function (c) { return c.id === ex.categoria_id; })) {
      var cInat = porId(ex.categoria_id, regs); if (cInat) cats.push(cInat);
    }
    var cat = chips("Categoria", cats.map(function (c) { return { valor: c.id, rotulo: c.nome }; }), ex ? ex.categoria_id : null);

    // --- Como pagou (cartões ativos + meios ativos) ---
    var cartoes = cartoesTodos(regs).filter(function (c) { return c.ativo !== false || (ex && ex.meio === c.id); });
    var meios = doTipo("meio", regs).filter(function (m) { return m.ativo !== false || (ex && ex.meio === m.id); }).sort(porNome);
    var meio = chips("Como pagou", cartoes.concat(meios).map(function (m) { return { valor: m.id, rotulo: m.nome }; }), ex ? ex.meio : null, atualizar);
    var dica = h("div", { class: "dica", "aria-live": "polite", hidden: true });

    // --- De quem é a compra ---
    var dequem = chips("De quem é a compra", [{ valor: "casal", rotulo: "Gasto do casal" }, { valor: "terceiro", rotulo: "Compra de terceiro" }], ex ? ex.de_quem : "casal", atualizar);
    var pessoas = doTipo("pessoa", regs).filter(function (x) { return x.ativo !== false || (ex && ex.pessoa_id === x.id); }).sort(porNome);
    var selPessoa = selecao([{ valor: "", rotulo: "Escolha…" }].concat(pessoas.map(function (x) { return { valor: x.id, rotulo: x.nome }; })).concat([{ valor: "__nova", rotulo: "+ nova pessoa" }]), ex && ex.pessoa_id ? ex.pessoa_id : "");
    var novaPessoa = entradaTexto("", { maxlength: "40", placeholder: "nome do parente" });
    var campoNova = campo("Nome da nova pessoa", novaPessoa, "O WhatsApp dá para cadastrar depois, em Parentes.");
    campoNova.hidden = true;
    selPessoa.addEventListener("change", function () { campoNova.hidden = selPessoa.value !== "__nova"; if (!campoNova.hidden) novaPessoa.focus(); });
    var blocoTerceiro = h("div", { class: "cartao plano", hidden: true }, h("div", { style: "display:flex; flex-direction:column; gap:12px" }, campo("Quem fez a compra", selPessoa), campoNova));

    var erro = caixaErro();

    // Recalcula o que aparece conforme as escolhas (blocos, rótulos e a dica da fatura)
    function atualizar() {
      var tipo = rep.valor();
      blocoParc.hidden = tipo !== "parcelado";
      blocoFixo.hidden = tipo !== "fixo";
      blocoTerceiro.hidden = dequem.valor() !== "terceiro" || tipo === "fixo";
      dequemGrupo.hidden = tipo === "fixo";
      rotValor.textContent = tipo === "parcelado" ? "Valor total da compra" : tipo === "fixo" ? "Valor previsto por mês" : "Valor";
      if (tipo === "fixo" && !diaEditado && data.value) diaFixo.value = String(parseInt(data.value.slice(8, 10), 10));

      // parcelas: mantém total e parcela coerentes
      ajudaValor.textContent = "";
      var n = lerParcelas();
      if (tipo === "parcelado" && n) {
        if (editouParcela) {
          var vp = Regras.centavos(vParc.value);
          if (vp !== null && vp > 0) { valor.value = centavosParaTexto(vp * n); }
        } else {
          var tot = Regras.centavos(valor.value);
          if (tot !== null && tot > 0) {
            var partes = Regras.dividirParcelas(tot, n);
            if (document.activeElement !== vParc) vParc.value = centavosParaTexto(partes[partes.length - 1]);
            ajudaValor.textContent = n + "x de " + dinheiro(partes[partes.length - 1]) + (partes[0] !== partes[partes.length - 1] ? " (a 1ª parcela fica com " + dinheiro(partes[0]) + ")" : "");
          }
        }
      }
      atualizarDica();
    }

    // Dica: em qual fatura a compra cai (calculada pelo Regras.fatura, ao vivo)
    function atualizarDica() {
      var m = porId(meio.valor(), regs);
      dica.textContent = "";
      dica.className = "dica";
      var tipo = rep.valor();
      if (!m || !data.value) { dica.hidden = true; return; }
      dica.hidden = false;
      if (m.tipo !== "cartao") {
        anexar(dica, [m.nome + " não tem fatura: o gasto conta em ", h("b", null, mesExtenso(mesDe(data.value))), tipo === "fixo" ? ", e depois todo mês." : "."]);
        return;
      }
      if (tipo === "fixo") { anexar(dica, ["A conta fixa no ", h("b", null, m.nome), " entra todo mês no gasto do mês, no dia escolhido."]); return; }
      var fat = Regras.fatura(m, data.value);
      if (!fat) {
        dica.className = "dica alerta";
        var falta = [];
        if (m.dia_fechamento === null || m.dia_fechamento === undefined) falta.push("dia de fechamento");
        if (m.dia_vencimento === null || m.dia_vencimento === undefined) falta.push("dia de vencimento");
        anexar(dica, ["O ", h("b", null, m.nome), " está sem " + (falta.join(" e ") || "datas") + " (NÃO INFORMADO). A compra entra no gasto do mês, mas fica ", h("b", null, "fora do total das faturas"), ". Dá para completar em Config › Cartões."]);
        return;
      }
      var n = lerParcelas();
      anexar(dica, ["O ", h("b", null, m.nome), " fecha dia " + dois(m.dia_fechamento) + ", então uma compra de ", h("b", null, Regras.dataBR(data.value)), " cai na ",
        h("b", null, "fatura que vence em " + Regras.dataBR(fat.vencimento))]);
      if (tipo === "parcelado" && n) {
        var ultimo = Regras.somaMes(fat.mes, n - 1);
        var diaV = fat.vencimento.slice(8, 10);
        anexar(dica, [" (1ª parcela). A última parcela cai na fatura de ", h("b", null, mesExtenso(ultimo)), " (dia " + diaV + ")."]);
      } else {
        anexar(dica, ". Você não digita nada disso: o app calcula.");
      }
    }

    var dequemGrupo = secao("De quem é a compra", dequem.el, blocoTerceiro);

    // Grava: lançamento (único ou parcelado) ou conta fixa ("Todo mês")
    function salvar() {
      var tipo = rep.valor();
      var v = Regras.centavos(valor.value);
      erro.hidden = true;
      if (v === null || v <= 0) { valor.focus(); return mostrarErro(erro, "Escreva o valor (ex.: 38,90)."); }
      if (!data.value) return mostrarErro(erro, "Escolha a data da compra.");

      if (tipo === "fixo") {
        var dia = lerDia(diaFixo);
        if (!desc.value.trim()) { desc.focus(); return mostrarErro(erro, "Escreva o nome da conta (ex.: Luz)."); }
        if (dia === null || isNaN(dia)) return mostrarErro(erro, "Escreva o dia do mês (1 a 31).");
        var cf = { tipo: "conta_fixa", nome: desc.value.trim(), valor_previsto: v, dia: dia, categoria_id: cat.valor() || null, meio: meio.valor() || null, inicio: mesDe(data.value), fim: null, ativo: true };
        if (gravar(function () { return Dados.salvar(cf, { motivo: "criou conta fixa" }); }, "Conta fixa criada. Ela aparece todo mês.") !== null) concluir();
        return;
      }

      var reg = Object.assign({}, ex || {}, {
        tipo: "lancamento", descricao: desc.value.trim() || null, data_compra: data.value,
        categoria_id: cat.valor() || null, meio: meio.valor() || null, de_quem: dequem.valor() || "casal"
      });
      if (tipo === "parcelado") {
        var tParc = String(nParc.value || "").trim();
        if (!/^\d+$/.test(tParc)) { nParc.focus(); return mostrarErro(erro, "Use um número inteiro de parcelas."); }
        var n = lerParcelas();
        if (!n) { nParc.focus(); return mostrarErro(erro, "Use de 2 a 72 parcelas."); }
        var partes = Regras.dividirParcelas(v, n);
        reg.repeticao = "parcelado"; reg.parcelas = n; reg.valor_total = v; reg.valor = partes[partes.length - 1];
      } else {
        reg.repeticao = "unico"; reg.parcelas = null; reg.valor_total = null; reg.valor = v;
      }
      if (reg.de_quem === "terceiro") {
        var pid = selPessoa.value;
        if (pid === "__nova") {
          var nome = novaPessoa.value.trim();
          if (!nome) { novaPessoa.focus(); return mostrarErro(erro, "Escreva o nome da nova pessoa."); }
          var nova = gravar(function () { return Dados.salvar({ tipo: "pessoa", nome: nome, whatsapp: null, observacao: null }, { motivo: "cadastrou pessoa" }); });
          if (!nova) return;
          pid = nova.id;
        }
        if (!pid) return mostrarErro(erro, "Escolha quem fez a compra.");
        reg.pessoa_id = pid;
      } else {
        reg.pessoa_id = null;
      }
      if (gravar(function () { return Dados.salvar(reg, { motivo: ex ? "alterou lançamento" : "lançou" }); }, ex ? "Lançamento alterado." : "Lançamento salvo.") !== null) concluir();
    }

    var semCadastroMeio = !cartoes.length && !meios.length;
    var conteudo = [
      ex ? voltaBotao("Voltar") : null,
      h("div", { class: "valorao" }, rotValor,
        h("div", { class: "linhavalor" }, h("span", { class: "moeda", "aria-hidden": "true" }, "R$"), valor), ajudaValor),
      campo("O que foi", desc),
      campo("Data da compra", data),
      secao("Se repete?", rep.el),
      blocoParc, blocoFixo,
      secao("Categoria", cats.length ? cat.el : vazio("Nenhuma categoria cadastrada.", "Cadastrar categorias", function () { ir("cadastros", { tipo: "categoria" }); })),
      secao("Como pagou", semCadastroMeio ? vazio("Nenhum cartão ou meio de pagamento cadastrado.", "Cadastrar cartões", function () { ir("cadastros", { tipo: "cartao" }); }) : meio.el),
      dica,
      dequemGrupo,
      erro,
      ex ? botao("Apagar este lançamento", function () { apagarComConfirmacao(ex.id, "Apagar este lançamento? Ele vai para a lixeira."); }, "perigo") : null,
      ex ? h("div", { class: "nota centro" }, "Lançado por " + (ex.lancado_por || NI) + " em " + momentoBR(ex.criado_em)) : null,
      rodapeForm(ex ? "Salvar alteração" : "Salvar lançamento", salvar, "Sem internet o lançamento fica salvo no celular e sobe sozinho depois.")
    ];
    setTimeout(atualizar, 0);
    return { titulo: ex ? "Editar lançamento" : "Lançar gasto", form: true, focar: ex ? null : valor, conteudo: conteudo };
  };

  /* ---------------- 5.7 Cartões (faturas) ---------------- */

  function descDias(c) {
    var f = c.dia_fechamento, v = c.dia_vencimento;
    var semF = f === null || f === undefined, semV = v === null || v === undefined;
    if (semF && semV) return h("span", { class: "naoinf" }, "FECHAMENTO E VENCIMENTO NÃO INFORMADOS");
    if (semF) return [h("span", { class: "naoinf" }, "DIA DE FECHAMENTO NÃO INFORMADO"), " · vence dia " + dois(v)];
    if (semV) return ["fecha dia " + dois(f) + " · ", h("span", { class: "naoinf" }, "DIA DE VENCIMENTO NÃO INFORMADO")];
    return "fecha dia " + dois(f) + " · vence dia " + dois(v);
  }

  TELAS.cartoes = function () {
    var regs = registros(), hj = hoje();
    var cartoes = cartoesTodos(regs);
    var conteudo = [];
    // vazio só se não há cartão vivo nem cartão na lixeira com compras neste mês
    var fPrevia = Regras.faturasDoMes(paraRegras(), ui.mesFatura, hj);
    if (!cartoes.length && !(fPrevia && fPrevia.cartoes && fPrevia.cartoes.length)) {
      conteudo.push(vazio("Cadastre seus cartões em Config para ver as faturas aqui.", "Cadastrar cartões", function () { ir("cadastros", { tipo: "cartao" }); }));
      return { titulo: "Cartões", conteudo: conteudo };
    }
    conteudo.push(seletorMes(ui.mesFatura, function (m) { ui.mesFatura = m; desenhar(false); }, "mês do vencimento"));
    var f = fPrevia;
    var lista = f.cartoes || [];
    var comDatas = lista.filter(function (x) { return !x.semDatas; });
    var fora = f.foraDoCalculo || { total: 0, cartoes: [] };
    var foraCartoes = (fora.cartoes || []).map(function (x) { return x.cartao ? x.cartao : x; });

    conteudo.push(secao("Faturas a pagar em " + nomeMes(ui.mesFatura), h("div", { class: "cartao" },
      linha("Total dos cartões com data informada", { det: comDatas.length ? listaNomes(comDatas.map(function (x) { return x.cartao.nome; })) : "nenhum cartão com as duas datas", dir: dinheiro(f.total) }),
      linha("Sendo de parentes", { nomeExtra: selo("◆ terceiro", "terc"), det: "você paga, eles te devem", dir: dinheiro(f.totalTerceiros || 0), corDir: "var(--terceiro)" }),
      foraCartoes.length ? linha("Fora do cálculo", { det: listaNomes(foraCartoes.map(function (c) { return c.nome; })) + " — sem data informada", dir: dinheiro(fora.total), corDir: "var(--alerta)" }) : null)));

    var cards = lista.map(function (x) {
      var c = x.cartao || {};
      // cartão na lixeira (compras dele continuam valendo) ou desativado
      var seloC = x.apagado ? selo("na lixeira", "aberto") : c.ativo === false ? selo("desativado", "vago") : null;
      var filhos = [linha(c.nome || NI, { det: descDias(c), dir: dinheiro(x.total), corDir: x.total ? null : "var(--ink-3)", nomeExtra: seloC })];
      if (x.semDatas) {
        filhos.push(linha(null, { det: "sem as datas o app usa só a data da compra. Toque para completar.", dir: selo("a preencher", "vago"), num: false }));
      } else if (!x.total) {
        // sem compras nesta fatura: o "sem compras" vai no detalhe
      } else {
        if (x.casal) {
          var partesCasal = [];
          if (x.casalParcelas) partesCasal.push(dinheiro(x.casalParcelas) + " de parcelas");
          if (x.casalFixas) partesCasal.push(dinheiro(x.casalFixas) + " de contas fixas");
          filhos.push(linha(null, { det: "de vocês: " + dinheiro(x.casal) + (partesCasal.length ? " (inclui " + partesCasal.join(" e ") + ")" : ""), dir: selo("● casal", "casal"), num: false }));
        }
        // contas fixas pagas neste cartão (itens com fixa:true)
        (x.itens || []).filter(function (it) { return it.fixa; }).forEach(function (it) {
          filhos.push(linha(it.descricao || NI, { estiloNome: "font-size:13px", nomeExtra: selo("conta fixa", "casal"), det: "dia " + diaMes(it.data) + " · " + (it.confirmada ? "valor confirmado" : "valor previsto"), dir: dinheiro(it.valor) }));
        });
        // compras de parentes neste cartão: "Márcia — parcela 6 de 12"
        (x.terceiros || []).forEach(function (t) {
          filhos.push(linha((t.pessoa || NI) + (t.n > 1 ? " — parcela " + t.k + " de " + t.n : ""), { estiloNome: "font-size:13px", det: (t.descricao || NI) + " comprado em " + dataBR(t.data_compra), dir: dinheiro(t.valor), corDir: "var(--terceiro)" }));
        });
      }
      if (!x.semDatas && !x.total) filhos[0] = linha(c.nome || NI, { det: [descDias(c), " · sem compras"], dir: dinheiro(0), corDir: "var(--ink-3)" });
      return h("button", { type: "button", class: "cartao", onclick: function () { if (x.apagado) ir("lixeira"); else ir("cadastro", { tipo: "cartao", id: c.id }); }, "aria-label": (x.apagado ? "Ver na lixeira " : "Editar ") + (c.nome || "cartão") }, filhos);
    });
    conteudo.push(secao("Cartão por cartão", cards, h("div", { class: "nota" }, "Toque em um cartão para mudar nome ou datas.")));
    return { titulo: "Cartões", sub: "faturas por mês de vencimento", conteudo: conteudo };
  };

  /* ---------------- 5.8 Parcelas em andamento ---------------- */

  // Um cartão de compra parcelada (casal ou terceiro), com barra de progresso.
  // c = item de Regras.parcelasEmAndamento. Casal: contado pelas datas (parcela vencida = paga).
  // Terceiro: contado pelo que o parente já pagou (como no protótipo: "5 pagas · faltam 7").
  function cartaoParcelado(c, terceiro) {
    var pagas = terceiro ? c.pagasParente : c.pagas;
    var faltam = terceiro ? c.faltamParente : c.faltam;
    var restante = terceiro ? c.faltaParente : c.restante;
    var prox = terceiro ? c.proximaAPagar : c.proxima;
    var pct = terceiro ? (c.pctPagoParente || 0) : (c.pctPago || 0);
    var nome = terceiro ? (c.pessoa || NI) + " — " + (c.descricao || NI) : (c.descricao || NI);
    var det = [diaMes(c.data_compra), c.meio || NI, dinheiro(c.total) + " em " + c.n + "x de " + dinheiro(c.valorParcela)].join(" · ");
    var proxTxt = prox ? (prox.data ? "próxima " + diaMes(prox.data) : "próxima em " + mesExtenso(prox.competencia)) : "sem próxima";
    return h("button", { type: "button", class: "cartao", onclick: function () { ir("lancar", { id: c.id }); }, "aria-label": "Abrir " + nome },
      linha(nome, { nomeExtra: terceiro ? selo("◆ terceiro", "terc") : null, det: det, dir: dinheiro(restante), corDir: terceiro ? "var(--terceiro)" : null }),
      trilha(pct, terceiro ? "terc" : "", "margin:4px 0 6px"),
      h("div", { class: "linha", style: "padding:0; border-top:none" },
        h("div", { class: "esq" }, h("span", { class: "det" }, pagas + (pagas === 1 ? " paga" : " pagas") + " · faltam " + faltam + " · " + proxTxt)),
        h("span", { class: "dir" }, selo(pct + "% pago", terceiro ? "terc" : "casal"))));
  }

  TELAS.parcelas = function () {
    var regs = registros(), hj = hoje();
    var p = Regras.parcelasEmAndamento(paraRegras(), hj);
    var casal = p.casal || [], terc = p.terceiros || [];
    var prox = Regras.somaMes(mesDe(hj), 1);
    var conteudo = [h("div", { class: "par" },
      tile(["Ainda devendo", h("br"), "compras de vocês"], dinheiro(p.aindaDevendo || 0), casal.length + (casal.length === 1 ? " compra em andamento" : " compras em andamento"), "saiu"),
      tile(["Cai em " + nomeMes(prox), h("br"), "só as parcelas do mês"], dinheiro(p.proximoMes || 0), "de vocês dois"))];
    if (!casal.length && !terc.length) {
      conteudo.push(vazio("Nenhuma compra parcelada em andamento. Ao lançar um gasto, escolha \"Parcelado\".", "Lançar compra parcelada", function () { ir("lancar"); }));
      return { titulo: "Compras parceladas", conteudo: conteudo };
    }
    conteudo.push(secao("Compras de vocês dois", casal.length ? casal.map(function (c) { return cartaoParcelado(c, false); }) : h("div", { class: "cartao plano texto-plano" }, "Nenhuma compra parcelada do casal em andamento.")));
    conteudo.push(secao("Compras de parentes nos seus cartões",
      terc.length ? terc.map(function (c) { return cartaoParcelado(c, true); }) : h("div", { class: "cartao plano texto-plano" }, "Nenhuma compra parcelada de parente em andamento."),
      atalho("Ver fichas dos parentes", "com dinheiro emprestado e botão do WhatsApp", null, function () { trocarAba("parentes"); })));
    return { titulo: "Compras parceladas", conteudo: conteudo };
  };

  /* ---------------- 5.9 Parentes ---------------- */

  TELAS.parentes = function () {
    var regs = registros(), hj = hoje();
    var pessoas = doTipo("pessoa", regs);
    var rp0 = Regras.resumoParentes(paraRegras(), hj);
    if (!pessoas.length && !(rp0.pessoas || []).length) {
      return { titulo: "Parentes", conteudo: [vazio("Cadastre os parentes que compram nos seus cartões ou pegam dinheiro emprestado.", "Cadastrar pessoa", function () { ir("cadastro", { tipo: "pessoa" }); })] };
    }
    var rp = rp0;
    var lista = rp.pessoas || [];
    var comDivida = lista.filter(function (x) { return x.deve > 0; }).length;
    var conteudo = [h("div", { class: "heroi" },
      h("div", { class: "rot" }, "Total que te devem"),
      h("div", { class: "v num", style: "color:var(--terceiro)" }, dinheiro(rp.total || 0)),
      h("div", { class: "sub" }, comDivida + (comDivida === 1 ? " pessoa devendo" : " pessoas devendo") + " · cartão e dinheiro"))];
    conteudo.push(secao("Pessoas", lista.map(function (x) {
      var pes = x.pessoa || {};
      // selo: "7 parcelas a vencer" (como no protótipo), ou a situação da pessoa
      var seloEl = x.credito > 0 ? selo("crédito de " + dinheiro(x.credito), "pago")
        : x.parcelasAVencer > 0 && x.deve > 0 ? selo(x.parcelasAVencer + (x.parcelasAVencer === 1 ? " parcela a vencer" : " parcelas a vencer"), "aberto")
        : x.situacao === "em aberto" ? selo("em aberto", "aberto")
        : x.situacao === "parcialmente pago" ? selo("parcialmente pago", "pago")
        : selo(x.situacao || "sem pendências", x.situacao === "quitado" ? "pago" : "vago");
      // pessoa na lixeira (com dívida viva) ou desativada
      var seloP = pes.apagado ? selo("na lixeira", "aberto") : pes.ativo === false ? selo("desativado", "vago") : null;
      return h("button", { type: "button", class: "cartao", onclick: function () { ir("pessoa", { id: pes.id }); }, "aria-label": "Abrir ficha de " + (pes.nome || "pessoa") },
        linha(pes.nome || NI, { nomeExtra: seloP, det: x.rotulo || "sem pendências", dir: dinheiro(x.deve) }),
        linha(null, { det: x.proxima ? "próxima parcela vence " + diaMes(x.proxima) : (x.deve > 0 ? "dinheiro emprestado" : "nada a vencer"), dir: seloEl, num: false }));
    }), botao("+ Cadastrar pessoa", function () { ir("cadastro", { tipo: "pessoa" }); }, "fraco")));
    conteudo.push(h("div", { class: "nota" }, "Toque em uma pessoa para ver as parcelas e mandar o resumo."));
    return { titulo: "Parentes", conteudo: conteudo };
  };

  // Ficha de uma pessoa: compras, empréstimos, pagamentos e WhatsApp
  TELAS.pessoa = function (p) {
    var regs = registros(), hj = hoje();
    var pes = Dados.obter(p.id); // também na lixeira: dívida viva continua aparecendo
    if (!pes) return { titulo: "Parentes", conteudo: [voltaBotao("Parentes"), vazio("Esta pessoa não existe mais.", null)] };
    var rs = Regras.resumoPessoa(pes, paraRegras(), hj);
    var conteudo = [voltaBotao("Parentes")];
    if (pes.apagado) conteudo.push(h("div", { class: "dica alerta" }, h("b", null, "Na lixeira. "), "Esta pessoa foi apagada, mas ainda tem registros ligados. Dá para restaurar em Config › Lixeira."));
    else if (pes.ativo === false) conteudo.push(h("div", { class: "dica" }, "Pessoa desativada: não aparece na escolha de novos lançamentos."));
    // avisos do Regras (ex.: pagamento ligado a uma compra que foi para a lixeira)
    (rs.avisos || []).forEach(function (a) { conteudo.push(h("div", { class: "dica alerta", role: "status" }, a)); });
    conteudo.push(
      h("div", { class: "valorao" },
        h("div", { class: "rot" }, (pes.nome || NI) + " te deve"),
        h("div", { class: "v num", style: "color:var(--terceiro)" }, dinheiro(rs.deve || 0)),
        rs.credito > 0 ? h("div", { class: "ajuda" }, "Pagou a mais: crédito de " + dinheiro(rs.credito)) : null));

    // compras de terceiro (rs.compras): o que o parente pagou x o que já venceu no cartão
    (rs.compras || []).forEach(function (c) {
      var linhas = [linha((c.descricao || NI) + " — " + dataBR(c.data_compra),
        { det: c.parcelado ? dinheiro(c.total) + " em " + c.n + "x de " + dinheiro(c.valorParcela) : "compra à vista", dir: dinheiro(c.falta),
          aoTocar: function () { ir("lancar", { id: c.id }); }, rotulo: "Abrir compra " + (c.descricao || "") })];
      if (c.parcelado) {
        var datas = (c.datasPagas || []).filter(Boolean).map(diaMes);
        linhas.push(linha("Pagas", { estiloNome: "font-size:13px", det: c.pagasParente + (c.pagasParente === 1 ? " parcela" : " parcelas") + (datas.length ? " · baixas em " + listaNomes(datas) : ""), dir: dinheiro(c.pago), corDir: "var(--accent)" }));
        var pp = c.proximaAPagar;
        linhas.push(linha("Faltam", { estiloNome: "font-size:13px", det: c.faltamParente + (c.faltamParente === 1 ? " parcela" : " parcelas") + (pp ? " · a próxima é a " + pp.k + "ª, vence " + (pp.data ? diaMes(pp.data) : mesExtenso(pp.competencia)) : ""), dir: dinheiro(c.falta), corDir: "var(--alerta)" }));
        linhas.push(linha(null, { det: "no cartão: " + c.vencidas + " vencidas, " + c.aVencer + " a vencer" }));
      } else {
        linhas.push(linha("Já pagou", { estiloNome: "font-size:13px", det: c.pagoAMais ? "pagou " + dinheiro(c.pagoAMais) + " a mais" : null, dir: dinheiro(c.pago), corDir: "var(--accent)" }));
      }
      conteudo.push(secao("Compra " + (c.ehCartao ? "no seu " : "em ") + (c.meio || NI), h("div", { class: "cartao" }, linhas,
        trilha(c.pctPago || 0, "terc", "margin-top:12px"),
        h("div", { class: "nota", style: "margin-top:6px" }, c.parcelado ? c.pagasParente + " de " + c.n + " pagas" : (c.pctPago || 0) + "% pago"))));
    });

    // empréstimos de dinheiro
    var emps = rs.emprestimos || [];
    if (emps.length) {
      conteudo.push(secao("Dinheiro emprestado", h("div", { class: "cartao" }, emps.map(function (e) {
        return linha("Empréstimo de " + dataBR(e.data), {
          det: (e.descricao ? e.descricao + " · " : "") + (e.pago ? "de " + dinheiro(e.valor) + ", pagou " + dinheiro(e.pago) + " · " + e.situacao : e.situacao),
          dir: dinheiro(e.falta),
          aoTocar: function () { ir("emprestimo", { pessoa_id: pes.id, id: e.id }); }
        });
      }))));
    }

    // pagamentos recebidos (mais recente primeiro)
    var pags = rs.pagamentos || [];
    if (pags.length) {
      conteudo.push(secao("Pagamentos recebidos", h("div", { class: "cartao" }, pags.map(function (pg) {
        var ref = pg.ref_id ? Dados.obter(pg.ref_id) : null; // também na lixeira
        var refTxt = pg.ref_tipo === "compra" ? "compra: " + ((ref && ref.descricao) || NI)
          : pg.ref_tipo === "emprestimo" ? "empréstimo de " + dataBR(ref && ref.data)
          : pg.ref_tipo === "desconhecido" ? "ligado a um registro apagado" : "abateu do total";
        if (pg.ref_situacao === "lixeira") refTxt += " (na lixeira — abate do total)";
        return linha(dataBR(pg.data), { det: refTxt + (pg.observacao ? " · " + pg.observacao : ""), dir: dinheiro(pg.valor), corDir: "var(--accent)", aoTocar: function () { ir("pagamento", { pessoa_id: pes.id, id: pg.id }); } });
      }))));
    }
    if (!(rs.compras || []).length && !emps.length && !pags.length) {
      conteudo.push(vazio("Nada registrado para " + (pes.nome || "esta pessoa") + " ainda. Lance uma compra como \"Compra de terceiro\" ou registre um empréstimo.", null));
    }

    // WhatsApp
    var texto = Regras.textoWhatsApp(pes, paraRegras(), hj);
    var link = Regras.linkWhatsApp(pes, texto);
    conteudo.push(secao("Mensagem que vai para o WhatsApp",
      h("div", { class: "zapview" }, texto),
      link ? h("a", { class: "botao zap", href: link, target: "_blank", rel: "noopener" }, "Abrir WhatsApp de " + (pes.nome || "")) :
        h("div", { class: "cartao plano texto-plano" }, h("span", { class: "naoinf" }, "WHATSAPP NÃO INFORMADO"), " — cadastre o número para abrir a conversa com o texto pronto."),
      link ? h("div", { class: "nota centro" }, "Abre a conversa com o texto pronto. Você aperta enviar.") : null,
      botao("Copiar mensagem", function () { copiar(texto).then(function (ok) { avisar(ok ? "Mensagem copiada." : "Não consegui copiar."); }); }, "fraco")));

    if (pes.apagado) {
      conteudo.push(botao("Abrir a lixeira para restaurar", function () { ir("lixeira"); }, "fraco"));
    } else {
      conteudo.push(botao("Registrar pagamento recebido", function () { ir("pagamento", { pessoa_id: pes.id }); }));
      conteudo.push(botao("Novo empréstimo de dinheiro", function () { ir("emprestimo", { pessoa_id: pes.id }); }, "fraco"));
      conteudo.push(botao("Editar cadastro (nome, WhatsApp)", function () { ir("cadastro", { tipo: "pessoa", id: pes.id }); }, "fraco"));
    }
    return { titulo: pes.nome || "Pessoa", sub: "ficha do parente", conteudo: conteudo };
  };

  // Registrar (ou editar) um pagamento recebido de um parente
  TELAS.pagamento = function (p) {
    var regs = registros();
    var pes = porId(p.pessoa_id, regs);
    var ex = p.id ? Dados.obter(p.id) : null;
    var valor = entradaDinheiro(ex ? ex.valor : null); valor.id = "pg-valor";
    var data = entradaData(ex ? ex.data : hoje());
    var obs = entradaTexto(ex ? ex.observacao : "", { maxlength: "120", placeholder: "opcional" });
    // a que se refere: uma compra de terceiro, um empréstimo, ou abate do total
    var opcoes = [{ valor: "", rotulo: "Abater do total (sem ligar a uma compra)" }];
    doTipo("lancamento", regs).filter(function (l) { return l.de_quem === "terceiro" && l.pessoa_id === p.pessoa_id; })
      .sort(function (a, b) { return String(b.data_compra).localeCompare(String(a.data_compra)); })
      .forEach(function (l) { opcoes.push({ valor: l.id, rotulo: "Compra: " + (l.descricao || NI) + " (" + dataBR(l.data_compra) + ")" }); });
    doTipo("emprestimo", regs).filter(function (e) { return e.pessoa_id === p.pessoa_id; })
      .forEach(function (e) { opcoes.push({ valor: e.id, rotulo: "Empréstimo de " + dataBR(e.data) + " — " + dinheiro(e.valor) }); });
    var ref = selecao(opcoes, ex ? ex.ref_id || "" : (p.ref_id || (opcoes.length === 2 ? opcoes[1].valor : "")));
    var erro = caixaErro();
    function salvar() {
      var v = Regras.centavos(valor.value);
      if (v === null || v <= 0) return mostrarErro(erro, "Escreva o valor que a pessoa pagou.");
      if (!data.value) return mostrarErro(erro, "Escolha a data do pagamento.");
      var reg = Object.assign({}, ex || {}, { tipo: "pagamento", pessoa_id: p.pessoa_id, valor: v, data: data.value, ref_id: ref.value || null, observacao: obs.value.trim() || null });
      if (gravar(function () { return Dados.salvar(reg, { motivo: ex ? "alterou pagamento" : "registrou pagamento" }); }, "Pagamento registrado.") !== null) concluir();
    }
    return {
      titulo: ex ? "Editar pagamento" : "Pagamento recebido", sub: pes ? pes.nome : NI, form: true, focar: valor,
      conteudo: [
        voltaBotao(pes ? pes.nome : "Voltar"),
        h("div", { class: "valorao" }, h("label", { for: "pg-valor" }, "Quanto " + (pes ? pes.nome : "a pessoa") + " pagou"), valor),
        campo("Data do pagamento", data),
        campo("Referente a", ref, "Ligar a uma compra mostra quantas parcelas dela já foram pagas."),
        campo("Observação", obs),
        erro,
        ex ? botao("Apagar este pagamento", function () { apagarComConfirmacao(ex.id, "Apagar este pagamento?"); }, "perigo") : null,
        rodapeForm("Salvar pagamento", salvar)
      ]
    };
  };

  // Novo (ou editar) empréstimo de dinheiro para um parente — sem juros
  TELAS.emprestimo = function (p) {
    var regs = registros();
    var pes = porId(p.pessoa_id, regs);
    var ex = p.id ? Dados.obter(p.id) : null;
    var valor = entradaDinheiro(ex ? ex.valor : null); valor.id = "em-valor";
    var data = entradaData(ex ? ex.data : hoje());
    var desc = entradaTexto(ex ? ex.descricao : "", { maxlength: "80", placeholder: "opcional, ex.: para o aluguel" });
    var erro = caixaErro();
    function salvar() {
      var v = Regras.centavos(valor.value);
      if (v === null || v <= 0) return mostrarErro(erro, "Escreva o valor emprestado.");
      if (!data.value) return mostrarErro(erro, "Escolha a data.");
      var reg = Object.assign({}, ex || {}, { tipo: "emprestimo", pessoa_id: p.pessoa_id, valor: v, data: data.value, descricao: desc.value.trim() || null });
      if (gravar(function () { return Dados.salvar(reg, { motivo: ex ? "alterou empréstimo" : "registrou empréstimo" }); }, "Empréstimo registrado.") !== null) concluir();
    }
    return {
      titulo: ex ? "Editar empréstimo" : "Novo empréstimo", sub: pes ? pes.nome : NI, form: true, focar: valor,
      conteudo: [
        voltaBotao(pes ? pes.nome : "Voltar"),
        h("div", { class: "valorao" }, h("label", { for: "em-valor" }, "Quanto emprestou a " + (pes ? pes.nome : "")), valor),
        campo("Data", data), campo("Descrição", desc),
        h("div", { class: "nota" }, "Sem juros. Os pagamentos dela abatem deste valor."),
        erro,
        ex ? botao("Apagar este empréstimo", function () { apagarComConfirmacao(ex.id, "Apagar este empréstimo?"); }, "perigo") : null,
        rodapeForm("Salvar empréstimo", salvar)
      ]
    };
  };

  /* ---------------- 5.10 Configuração ---------------- */

  // Tipos de cadastro: título, frase de estado vazio e como descrever cada item
  var CADASTROS = {
    cartao: { titulo: "Cartões", um: "cartão", vazio: "Nenhum cartão. Cadastre o nome e os dias de fechamento e vencimento.",
      det: function (c) { return descDias(c); } },
    meio: { titulo: "Meios de pagamento", um: "meio de pagamento", vazio: "Nenhum meio de pagamento (Pix, Dinheiro, Débito…).", det: function () { return null; } },
    categoria: { titulo: "Categorias", um: "categoria", vazio: "Nenhuma categoria.", det: function (c) { return "ordem " + (c.ordem !== null && c.ordem !== undefined ? c.ordem : NI); } },
    pessoa: { titulo: "Pessoas", um: "pessoa", vazio: "Nenhuma pessoa. Cadastre os parentes que compram no seu cartão ou pegam dinheiro.",
      det: function (c) { return c.whatsapp ? "WhatsApp (" + c.whatsapp.slice(0, 2) + ") " + c.whatsapp.slice(2) : h("span", { class: "naoinf" }, "WHATSAPP NÃO INFORMADO"); } },
    conta_fixa: { titulo: "Contas fixas", um: "conta fixa", vazio: "Nenhuma conta fixa (luz, internet, escola…).",
      det: function (c) { return dinheiro(c.valor_previsto) + " · todo dia " + (c.dia || NI) + " · desde " + (c.inicio ? mesExtenso(c.inicio) : NI) + (c.fim ? " até " + mesExtenso(c.fim) : ""); } },
    fonte: { titulo: "Fontes de renda", um: "fonte de renda", vazio: "Nenhuma fonte de renda (salário, extras…).",
      det: function (c) { return ({ mensal: "mensal", quinzenal: "quinzenal", avulso: "avulso" }[c.periodicidade] || NI) + (c.dias && c.dias.length ? " · dia " + c.dias.join(" e ") : "") + " · " + dinheiro(c.valor_previsto) + (c.de ? " · " + c.de : "") + (c.extra === true ? " · extra" : ""); } },
    reserva: { titulo: "Reservas e metas", um: "reserva", vazio: "Nenhuma reserva (dinheiro guardado para algo).",
      det: function (c) { return "guardado " + dinheiro(c.valor_guardado) + (c.meta ? " · meta " + dinheiro(c.meta) : ""); } }
  };
  var ORDEM_CADASTROS = ["cartao", "fonte", "categoria", "conta_fixa", "pessoa", "meio", "reserva"];

  TELAS.config = function () {
    var regs = registros();
    var ap = Dados.aparelho() || {};
    var semNuvem = !(window.CONFIG && CONFIG.supabaseUrl);
    var instalado = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    var conteudo = [];

    // avisos do armazenamento (memória cheia, dados recuperados...) vêm do Dados.estado()
    var est = (Dados.estado && Dados.estado()) || {};
    if (est.aviso) conteudo.push(h("div", { class: "erro", role: "alert" }, est.aviso));
    if (est.erro && !semNuvem) conteudo.push(h("div", { class: "erro", role: "alert" }, "Sincronização: " + est.erro));
    conteudo.push(secaoOrcamento(regs));
    conteudo.push(secao("Este celular", h("div", { class: "cartao" },
      linha("Quem está usando", { dir: ap.eu || NI, num: false, aoTocar: function () { ir("quem", {}); }, rotulo: "Trocar quem está usando" }),
      linha("Código do casal", { det: "quem tem o código vê os lançamentos", dir: "••••-••••", aoTocar: function () { ir("codigo"); }, rotulo: "Ver código do casal" }),
      linha("Nuvem", { det: semNuvem ? "não configurada: os dados ficam só neste celular" : "os dois celulares veem os mesmos dados", dir: selo(semNuvem ? "só aparelho" : "ligada", semNuvem ? "vago" : "pago"), num: false }),
      linha("Atalho na tela inicial", { det: instalado ? "sem loja de aplicativos" : "no Chrome: menu ⋮ › Adicionar à tela inicial", dir: selo(instalado ? "instalado" : "não instalado", instalado ? "pago" : "vago"), num: false }))));

    conteudo.push(secao("Tudo que você troca sem mexer no sistema", h("div", { class: "cartao" }, ORDEM_CADASTROS.map(function (t) {
      var itens = doTipo(t, regs);
      var nomes = itens.filter(function (x) { return x.ativo !== false; }).sort(porNome).map(function (x) { return x.nome; });
      var det = nomes.length ? (nomes.slice(0, 4).join(", ") + (nomes.length > 4 ? "…" : "")) : "nenhum cadastrado";
      return linha(CADASTROS[t].titulo, { det: det, dir: String(itens.length), corDir: "var(--ink-3)", aoTocar: function () { ir("cadastros", { tipo: t }); }, rotulo: "Abrir " + CADASTROS[t].titulo });
    }))));

    // Exportar CSV por tipo
    var tiposCSV = [
      { valor: "lancamento", rotulo: "Lançamentos" }, { valor: "conta_fixa", rotulo: "Contas fixas" },
      { valor: "fixa_confirmada", rotulo: "Contas fixas confirmadas" }, { valor: "fonte", rotulo: "Fontes de renda" },
      { valor: "receita_confirmada", rotulo: "Receitas confirmadas" }, { valor: "receita_avulsa", rotulo: "Receitas avulsas" },
      { valor: "pessoa", rotulo: "Pessoas" }, { valor: "emprestimo", rotulo: "Empréstimos" }, { valor: "pagamento", rotulo: "Pagamentos de parentes" },
      { valor: "cartao", rotulo: "Cartões" }, { valor: "meio", rotulo: "Meios de pagamento" }, { valor: "categoria", rotulo: "Categorias" },
      { valor: "reserva", rotulo: "Reservas" }
    ];
    var selCSV = selecao(tiposCSV, "lancamento");
    var arquivo = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    arquivo.addEventListener("change", function () { importarArquivo(arquivo); });
    conteudo.push(secao("Seus dados",
      campo("Exportar em .csv (abre no Excel)", selCSV),
      botao("Exportar .csv", function () { exportarCSV(selCSV.value); }, "fraco"),
      h("div", { class: "nota" }, "Abre no Excel sem depender do app. É a garantia de que os dados sobrevivem."),
      botao("Baixar backup completo (.json)", baixarBackup, "fraco"),
      botao("Importar backup (.json)", function () { arquivo.click(); }, "fraco"), arquivo,
      botao("Cópias automáticas deste celular", function () { ir("copias"); }, "fraco"),
      botao("Lixeira (restaurar apagados)", function () { ir("lixeira"); }, "fraco"),
      botao("Ver histórico de alterações", function () { ir("historico"); }, "fraco")));
    return { titulo: "Configuração", conteudo: conteudo };
  };

  /*
   * Seção "Orçamento" da Config (CONTRATO seção 8.1 e 8.3).
   * Grava no registro fixo "ajuste:casal" na hora em que muda (igual aos chips do app):
   *   regra_orcamento        "70/20/10" | "60/30/10"
   *   fonte_salario_id       id da fonte base, ou null = todas as fontes que não são extra
   *   referencia_mercadinho  centavos (padrão 50000 = R$ 500,00)
   * Sempre parte do registro inteiro que já existe (nomes do casal etc.), então nenhum campo se perde.
   */
  var REFERENCIA_PADRAO = 50000;
  function gravarAjuste(mudancas, mensagem) {
    var atualAj = Dados.obter("ajuste:casal");
    // Sem o registro (entrou pelo código e os dados ainda não chegaram da nuvem): não cria um
    // novo, para não passar por cima dos nomes do casal quando a nuvem responder.
    if (!atualAj) { avisar("Os dados do casal ainda não chegaram da nuvem. Tente de novo daqui a pouco."); return null; }
    var novo = Object.assign({}, atualAj, mudancas, { tipo: "ajuste", id: "ajuste:casal" });
    return gravar(function () { return Dados.salvar(novo, { motivo: "alterou orçamento" }); }, mensagem || "Orçamento salvo.");
  }

  function secaoOrcamento(regs) {
    var aj = Dados.obter("ajuste:casal") || {};
    var semAjuste = !Dados.obter("ajuste:casal");

    // Regra: dois botões lado a lado
    var regraAtual = aj.regra_orcamento === "60/30/10" ? "60/30/10" : "70/20/10";
    var regra = chips("Regra do salário", [
      { valor: "70/20/10", rotulo: "70 / 20 / 10" },
      { valor: "60/30/10", rotulo: "60 / 30 / 10" }
    ], regraAtual, function (v) {
      // não gravou: redesenha para o botão aceso voltar a mostrar o que está salvo
      if (gravarAjuste({ regra_orcamento: v }, "Regra " + v + " salva.") === null) desenhar(false);
    });
    regra.el.className = "seg";
    var idRegra = "c" + (++contadorId);
    var campoRegra = h("div", { class: "campo" },
      h("span", { id: idRegra, style: "font-size:12px; color:var(--ink-2); font-weight:500" }, "Regra do salário"),
      regra.el, h("div", { class: "ajuda" }, "Fixas e parcelas / livre / investir"));
    regra.el.setAttribute("aria-labelledby", idRegra);

    // Salário base: fontes que não são extra (avulsa não tem previsto, então não serve de base)
    var fontesBase = doTipo("fonte", regs).filter(function (fo) {
      return fo.extra !== true && fo.periodicidade !== "avulso" && (fo.ativo !== false || fo.id === aj.fonte_salario_id);
    }).sort(porNome);
    var opcoes = [{ valor: "", rotulo: "Todas as fontes que não são extra" }].concat(fontesBase.map(function (fo) {
      return { valor: fo.id, rotulo: (fo.nome || NI) + " — " + dinheiro(fo.valor_previsto) + (fo.periodicidade === "quinzenal" ? " por quinzena" : "") + (fo.ativo === false ? " (desativada)" : "") };
    }));
    var escolhida = aj.fonte_salario_id && fontesBase.some(function (fo) { return fo.id === aj.fonte_salario_id; }) ? aj.fonte_salario_id : "";
    var selSalario = selecao(opcoes, escolhida);
    selSalario.addEventListener("change", function () {
      if (gravarAjuste({ fonte_salario_id: selSalario.value || null }, "Salário base salvo.") === null) selSalario.value = escolhida;
    });

    // Referência do mercadinho: grava ao sair do campo (ou Enter no teclado)
    var refAtual = typeof aj.referencia_mercadinho === "number" && aj.referencia_mercadinho > 0 ? aj.referencia_mercadinho : REFERENCIA_PADRAO;
    var inpRef = entradaDinheiro(refAtual);
    inpRef.addEventListener("keydown", function (ev) { if (ev.key === "Enter") inpRef.blur(); });
    inpRef.addEventListener("change", function () {
      var v = Regras.centavos(inpRef.value);
      if (v === null || v <= 0) { avisar("Escreva um valor maior que zero (ex.: 500,00)."); inpRef.value = centavosParaTexto(refAtual); return; }
      if (v === refAtual) { inpRef.value = centavosParaTexto(v); return; }
      if (gravarAjuste({ referencia_mercadinho: v }, "Referência do mercadinho salva.") !== null) refAtual = v;
      else inpRef.value = centavosParaTexto(refAtual);
    });

    var corpoCartao = [
      campoRegra,
      campo("Salário que manda no orçamento", selSalario, fontesBase.length
        ? "Fontes marcadas como \"extra\" nunca entram nessa conta"
        : "Nenhuma fonte de salário cadastrada. Cadastre em Fontes de renda, logo abaixo."),
      campo("Referência do mercadinho por mês", inpRef, "Não bloqueia nada. Avisa na metade, em 80% e quando passar.")
    ];
    if (semAjuste) corpoCartao.unshift(h("div", { class: "dica alerta" }, "Os dados do casal ainda não chegaram da nuvem. O orçamento pode ser ajustado assim que chegarem."));
    return secao("Orçamento", h("div", { class: "cartao", style: "display:flex; flex-direction:column; gap:14px" }, corpoCartao));
  }

  // Nome do arquivo CSV por tipo: gastos-lancamentos-2026-10-05.csv
  var PLURAL_CSV = { lancamento: "lancamentos", conta_fixa: "contas-fixas", fixa_confirmada: "contas-fixas-confirmadas", fonte: "fontes-de-renda",
    receita_confirmada: "receitas-confirmadas", receita_avulsa: "receitas-avulsas", pessoa: "pessoas", emprestimo: "emprestimos",
    pagamento: "pagamentos", cartao: "cartoes", meio: "meios", categoria: "categorias", reserva: "reservas" };
  function exportarCSV(tipo) {
    try {
      var texto = Regras.paraCSV(registros(), tipo);
      baixar("gastos-" + (PLURAL_CSV[tipo] || tipo) + "-" + hoje() + ".csv", texto, "text/csv;charset=utf-8");
      avisar("Arquivo .csv baixado.");
    } catch (e) { console.warn(e); avisar("Não consegui gerar o .csv."); }
  }
  function baixarBackup() {
    try {
      var obj = Dados.exportarBackup();
      baixar("gastos-backup-" + hoje() + ".json", JSON.stringify(obj, null, 1), "application/json");
      avisar("Backup baixado. Guarde em lugar seguro.");
    } catch (e) { console.warn(e); avisar("Não consegui gerar o backup."); }
  }
  /*
   * REAPROVEITAR CADASTROS AO IMPORTAR (CONTRATO seção 8.3, última regra)
   * Categoria, meio ou cartão do arquivo com o MESMO nome de um cadastro ATIVO que já existe
   * aqui (sem diferenciar maiúsculas, acentos e espaços sobrando) não é importado: ele sai do
   * arquivo e tudo no arquivo que apontava para ele passa a apontar para o cadastro que já existe:
   *   categoria_id e meio (lançamentos, contas fixas...) e, no ajuste, os campos categoria_*_id.
   * Trabalha numa CÓPIA do arquivo (o objeto lido não é mexido).
   * Devolve {obj: cópia pronta para Dados.importarBackup, reaproveitados: n}.
   */
  var TIPOS_REAPROVEITAR = { categoria: 1, meio: 1, cartao: 1 };
  function nomeComparavel(t) {
    if (t === null || t === undefined) return "";
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function reaproveitarCadastros(original) {
    var copia = JSON.parse(JSON.stringify(original));
    if (!copia || !Array.isArray(copia.registros)) return { obj: copia, reaproveitados: 0 };
    // cadastros ativos deste celular, por tipo + nome comparável
    var existentes = {};
    registros().forEach(function (r) {
      if (!TIPOS_REAPROVEITAR[r.tipo] || r.ativo === false) return;
      var chave = r.tipo + "|" + nomeComparavel(r.nome);
      if (nomeComparavel(r.nome) && !existentes[chave]) existentes[chave] = r.id;
    });
    // id do arquivo -> id que já existe aqui
    var troca = {};
    copia.registros.forEach(function (r) {
      if (!r || !TIPOS_REAPROVEITAR[r.tipo] || r.apagado === true || typeof r.id !== "string") return;
      var alvo = existentes[r.tipo + "|" + nomeComparavel(r.nome)];
      // mesmo id = é o próprio registro (backup deste casal): a mesclagem normal resolve
      if (alvo && alvo !== r.id) troca[r.id] = alvo;
    });
    var n = Object.keys(troca).length;
    if (!n) return { obj: copia, reaproveitados: 0 };
    copia.registros = copia.registros.filter(function (r) { return !(r && TIPOS_REAPROVEITAR[r.tipo] && troca[r.id]); });
    copia.registros.forEach(function (r) {
      if (!r || typeof r !== "object" || r.tipo === "historico") return;
      if (r.categoria_id && troca[r.categoria_id]) r.categoria_id = troca[r.categoria_id];
      if (r.meio && troca[r.meio]) r.meio = troca[r.meio];
      if (r.tipo === "ajuste") {
        Object.keys(r).forEach(function (k) {
          if (/^categoria_.+_id$/.test(k) && r[k] && troca[r[k]]) r[k] = troca[r[k]];
        });
      }
    });
    return { obj: copia, reaproveitados: n };
  }

  function importarArquivo(input) {
    var f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var obj;
      try { obj = JSON.parse(leitor.result); } catch (e) { avisar("Esse arquivo não é um backup válido."); return; }
      var n = obj && Array.isArray(obj.registros) ? obj.registros.length : 0;
      if (!n) { avisar("Esse arquivo não tem registros do Gastos do Casal."); return; }
      var prep = reaproveitarCadastros(obj);
      var sub = "Nada do que já está no app será apagado: o mais recente de cada registro vence.";
      if (prep.reaproveitados) sub += " " + prep.reaproveitados + (prep.reaproveitados === 1 ? " cadastro do arquivo já existe aqui com o mesmo nome e será reaproveitado." : " cadastros do arquivo já existem aqui com o mesmo nome e serão reaproveitados.");
      confirmar("Importar backup com " + n + " registros?", "Importar", sub).then(function (ok) {
        if (!ok) return;
        try {
          var r = Dados.importarBackup(prep.obj) || {};
          avisar("Importado: " + (r.novos || 0) + " novos, " + (r.atualizados || 0) + " atualizados, " + (r.ignorados || 0) + " ignorados, " + prep.reaproveitados + (prep.reaproveitados === 1 ? " cadastro reaproveitado." : " cadastros reaproveitados."));
        } catch (e) { console.warn(e); avisar("Não consegui importar: " + (e && e.message ? e.message : "erro")); }
      });
    };
    leitor.readAsText(f);
  }

  // Código do casal: escondido, com botão revelar e copiar
  TELAS.codigo = function () {
    var ap = Dados.aparelho() || {};
    var mostra = h("div", { class: "codigo num", "aria-live": "polite" }, "••••-••••");
    var revelado = false;
    var bRevelar = botao("Revelar", function () {
      revelado = !revelado;
      mostra.textContent = revelado ? (ap.codigo || NI) : "••••-••••";
      bRevelar.textContent = revelado ? "Esconder" : "Revelar";
    }, "fraco");
    return {
      titulo: "Código do casal",
      conteudo: [voltaBotao("Configuração"),
        h("div", { class: "cartao" }, mostra),
        h("div", { class: "botoes" }, bRevelar, botao("Copiar", function () {
          copiar(ap.codigo || "").then(function (ok) { avisar(ok ? "Código copiado." : "Não consegui copiar."); });
        }, "fraco")),
        h("div", { class: "cartao plano texto-plano" }, "No outro celular, abra o app e escolha \"Já tenho o código\". O código funciona como senha: quem tem vê os lançamentos.")]
    };
  };

  /*
   * Registros vivos que apontam para um cadastro (para não apagar cadastro em uso).
   * cartão/meio: lançamentos e contas fixas pagos com ele; categoria: lançamentos e contas
   * fixas; pessoa: compras, pagamentos e empréstimos; conta fixa: confirmações; fonte:
   * receitas confirmadas e avulsas.
   */
  var LIGACOES = {
    cartao: [["lancamento", "meio"], ["conta_fixa", "meio"]],
    meio: [["lancamento", "meio"], ["conta_fixa", "meio"]],
    categoria: [["lancamento", "categoria_id"], ["conta_fixa", "categoria_id"]],
    pessoa: [["lancamento", "pessoa_id"], ["pagamento", "pessoa_id"], ["emprestimo", "pessoa_id"]],
    conta_fixa: [["fixa_confirmada", "conta_fixa_id"]],
    fonte: [["receita_confirmada", "fonte_id"], ["receita_avulsa", "fonte_id"]]
  };
  function contarLigados(reg) {
    var regras = LIGACOES[reg.tipo];
    if (!regras) return 0;
    return registros().filter(function (r) {
      return regras.some(function (x) { return r.tipo === x[0] && r[x[1]] === reg.id; });
    }).length;
  }

  // Mês em que a conta fixa termina ao ser desativada: o mês anterior ao atual
  // (assim os meses passados continuam iguais e ela some daqui para frente)
  function fimAoDesativar(reg) {
    var anterior = Regras.somaMes(mesAtual(), -1);
    return reg.fim && reg.fim < anterior ? reg.fim : anterior;
  }
  // Desativa um cadastro (some das listas de escolha; o histórico continua)
  function desativar(reg) {
    var novo = Object.assign({}, reg, { ativo: false });
    if (reg.tipo === "conta_fixa" || reg.tipo === "fonte") novo.fim = fimAoDesativar(reg);
    return gravar(function () { return Dados.salvar(novo, { motivo: "desativou" }); }, "Desativado. Ele não aparece mais nas escolhas.");
  }
  function reativar(reg) {
    var novo = Object.assign({}, reg, { ativo: true });
    // conta fixa encerrada pela desativação volta a valer a partir deste mês
    if ((reg.tipo === "conta_fixa" || reg.tipo === "fonte") && reg.fim) novo.fim = null;
    return gravar(function () { return Dados.salvar(novo, { motivo: "reativou" }); }, "Reativado.");
  }

  // Apagar um cadastro: se tem registros ligados, oferece Desativar em vez de apagar
  function apagarCadastro(reg, um) {
    var n = contarLigados(reg);
    if (!n) { apagarComConfirmacao(reg.id, "Apagar \"" + (reg.nome || um) + "\"?"); return; }
    confirmar("Este cadastro já tem " + n + (n === 1 ? " registro ligado" : " registros ligados") + ". Apagar faria eles perderem a referência. Use Desativar: ele some das listas de escolha, mas o histórico continua.",
      "Desativar").then(function (ok) {
      if (!ok) return;
      if (desativar(reg) !== null) concluir();
    });
  }

  // Lista de um tipo de cadastro
  TELAS.cadastros = function (p) {
    var def = CADASTROS[p.tipo];
    if (!def) return { titulo: "Cadastro", conteudo: [voltaBotao("Configuração")] };
    var itens = doTipo(p.tipo).sort(p.tipo === "categoria" ? function (a, b) { return (a.ordem || 0) - (b.ordem || 0); } : porNome);
    var conteudo = [voltaBotao("Configuração")];
    if (!itens.length) conteudo.push(vazio(def.vazio, null));
    else conteudo.push(h("div", { class: "cartao" }, itens.map(function (c) {
      var editar = function () { ir("cadastro", { tipo: p.tipo, id: c.id }); };
      if (c.ativo === false) {
        // desativado: em cinza, com selo e botões Editar / Reativar
        return h("div", { class: "linha desativado", style: "align-items:center" },
          h("div", { class: "esq" }, h("span", { class: "nome" }, c.nome || NI, " ", selo("desativado", "vago")), h("span", { class: "det" }, def.det(c))),
          h("div", { class: "botoes", style: "flex:none" },
            botao("Editar", editar, "fraco mini", { "aria-label": "Editar " + (c.nome || def.um) }),
            botao("Reativar", function () { reativar(c); desenhar(false); }, "fraco mini", { "aria-label": "Reativar " + (c.nome || def.um) })));
      }
      return linha(c.nome || NI, { det: def.det(c), dir: "→", corDir: "var(--accent)", num: false, aoTocar: editar, rotulo: "Editar " + (c.nome || def.um) });
    })));
    conteudo.push(botao("+ Novo " + def.um.replace(/^(conta|fonte|categoria|pessoa|reserva)/, "$1"), function () { ir("cadastro", { tipo: p.tipo }); }));
    return { titulo: def.titulo, sub: itens.length + (itens.length === 1 ? " cadastrado" : " cadastrados"), conteudo: conteudo };
  };

  // Formulário de cadastro (novo ou edição) para qualquer tipo de CADASTROS
  TELAS.cadastro = function (p) {
    var def = CADASTROS[p.tipo];
    var regs = registros();
    var ex = p.id ? Dados.obter(p.id) : null;
    if (!def) return { titulo: "Cadastro", conteudo: [voltaBotao("Voltar")] };
    if (p.id && (!ex || ex.apagado)) return { titulo: def.titulo, conteudo: [voltaBotao("Voltar"), vazio("Este cadastro não existe mais (pode estar na lixeira).", null)] };
    var e = ex || {};
    var nome = entradaTexto(e.nome, { maxlength: "60", enterkeyhint: "next" });
    var erro = caixaErro();
    var campos = [campo("Nome", nome)];
    var ativo = marca("Ativo (aparece nas escolhas)", e.ativo !== false);
    var ler; // função que lê os campos próprios do tipo e devolve os dados (ou texto de erro)

    if (p.tipo === "cartao") {
      var fech = entradaDia(e.dia_fechamento), venc = entradaDia(e.dia_vencimento);
      campos.push(h("div", { class: "par" }, campo("Dia de fechamento", fech), campo("Dia de vencimento", venc)));
      campos.push(h("div", { class: "nota" }, "Não sabe o dia? Deixe em branco: aparece NÃO INFORMADO e as compras desse cartão ficam fora do total das faturas até você completar."));
      campos.push(ativo.el);
      ler = function () {
        var f = lerDia(fech), v = lerDia(venc);
        if (isNaN(f) || isNaN(v)) return "Os dias precisam ser de 1 a 31 (ou em branco).";
        return { dia_fechamento: f, dia_vencimento: v, ativo: ativo.entrada.checked };
      };
    } else if (p.tipo === "meio") {
      campos.push(ativo.el);
      ler = function () { return { ativo: ativo.entrada.checked }; };
    } else if (p.tipo === "categoria") {
      var maxOrdem = doTipo("categoria", regs).reduce(function (m, c) { return Math.max(m, c.ordem || 0); }, 0);
      var ordem = h("input", { type: "number", inputmode: "numeric", step: "1", value: String(e.ordem !== undefined && e.ordem !== null ? e.ordem : maxOrdem + 1) });
      campos.push(campo("Ordem (menor aparece primeiro)", ordem), ativo.el);
      ler = function () { var o = parseInt(ordem.value, 10); return { ordem: isNaN(o) ? null : o, ativo: ativo.entrada.checked }; };
    } else if (p.tipo === "pessoa") {
      var zap = entradaTexto(e.whatsapp ? "(" + e.whatsapp.slice(0, 2) + ") " + e.whatsapp.slice(2) : "", { type: "tel", inputmode: "tel", placeholder: "(21) 99999-9999", autocomplete: "off" });
      var obs = entradaTexto(e.observacao, { maxlength: "120", placeholder: "opcional" });
      campos.push(campo("WhatsApp (com DDD)", zap, "Sem o +55. Em branco = NÃO INFORMADO."), campo("Observação", obs), ativo.el);
      ler = function () {
        var d = zap.value.replace(/\D/g, "");
        if (d.length >= 12 && d.slice(0, 2) === "55") d = d.slice(2);
        if (d && (d.length < 10 || d.length > 11)) return "O WhatsApp precisa ter DDD + número (10 ou 11 dígitos).";
        return { whatsapp: d || null, observacao: obs.value.trim() || null, ativo: ativo.entrada.checked };
      };
    } else if (p.tipo === "conta_fixa") {
      var vprev = entradaDinheiro(e.valor_previsto), dia = entradaDia(e.dia);
      var catsCf = categoriasAtivas(regs);
      if (e.categoria_id && !catsCf.some(function (c) { return c.id === e.categoria_id; })) { var cIn = porId(e.categoria_id, regs); if (cIn) catsCf.push(cIn); }
      var catSel = selecao([{ valor: "", rotulo: NI }].concat(catsCf.map(function (c) { return { valor: c.id, rotulo: c.nome }; })), e.categoria_id || "");
      // aviso ao mudar o valor previsto de uma conta que já existe
      var avisoValor = h("div", { class: "dica alerta", hidden: true }, "Meses já passados que não foram confirmados vão usar o novo valor. Confirme os meses antigos antes, se quiser guardar o valor real.");
      if (ex) vprev.addEventListener("input", function () { avisoValor.hidden = Regras.centavos(vprev.value) === e.valor_previsto; });
      var meioSel = selecao([{ valor: "", rotulo: NI }].concat(cartoesTodos(regs).concat(doTipo("meio", regs).sort(porNome)).filter(function (m) { return m.ativo !== false || m.id === e.meio; }).map(function (m) { return { valor: m.id, rotulo: m.nome }; })), e.meio || "");
      var ini = entradaMes(e.inicio || mesAtual()), fim = entradaMes(e.fim || "");
      campos.push(h("div", { class: "par" }, campo("Valor previsto", vprev), campo("Todo dia", dia)),
        campo("Categoria", catSel), campo("Como paga", meioSel),
        h("div", { class: "par" }, campo("Começa em", ini), campo("Termina em", fim, "em branco = sem fim")), ativo.el,
        h("div", { class: "nota" }, "Desmarcar \"Ativo\" encerra a conta em " + mesExtenso(Regras.somaMes(mesAtual(), -1)) + ": os meses passados não mudam e ela some daqui para frente."));
      campos.splice(2, 0, avisoValor);
      ler = function () {
        var v = Regras.centavos(vprev.value), d = lerDia(dia);
        if (v === null || v < 0) return "Escreva o valor previsto.";
        if (d === null || isNaN(d)) return "Escreva o dia do mês (1 a 31).";
        if (!ini.value) return "Escolha o mês em que começa.";
        var desativando = e.ativo !== false && !ativo.entrada.checked && !!ex;
        if (!desativando && fim.value && fim.value < ini.value) return "O mês final não pode ser antes do inicial.";
        var dadosCf = { valor_previsto: v, dia: d, categoria_id: catSel.value || null, meio: meioSel.value || null, inicio: ini.value, fim: fim.value || null, ativo: ativo.entrada.checked };
        if (desativando) dadosCf.fim = fimAoDesativar({ fim: dadosCf.fim });
        return dadosCf;
      };
    } else if (p.tipo === "fonte") {
      var per = e.periodicidade || "mensal";
      var dias = e.dias || [];
      var d1 = entradaDia(dias[0]), d2 = entradaDia(dias[1]);
      var c1 = campo("Dia em que cai", d1), c2 = campo("Dia da 2ª quinzena", d2);
      var vpf = entradaDinheiro(e.valor_previsto);
      var nomes = nomesCasal();
      var deSel = selecao([{ valor: "", rotulo: "Do casal / " + NI }].concat(nomes.map(function (n) { return { valor: n, rotulo: n }; })), e.de || "");
      var iniF = entradaMes(e.inicio || mesAtual());
      // renda extra (RAS, PROEIS, segurança): fica fora do orçamento do salário (CONTRATO 8.1)
      var extra = marca("É extra (fora do orçamento)", e.extra === true);
      var ajustarDias = function (v) {
        c1.hidden = v === "avulso"; c2.hidden = v !== "quinzenal";
        c1.querySelector("label").textContent = v === "quinzenal" ? "Dia da 1ª quinzena" : "Dia em que cai";
        if (v === "quinzenal" && !d1.value && !d2.value) { d1.value = "15"; d2.value = "30"; }
      };
      var perChips = chips("Periodicidade", [{ valor: "mensal", rotulo: "Mensal" }, { valor: "quinzenal", rotulo: "Quinzenal" }, { valor: "avulso", rotulo: "Avulso" }], per, ajustarDias);
      campos.push(secao("De quanto em quanto tempo", perChips.el), h("div", { class: "par" }, c1, c2),
        campo(per === "quinzenal" ? "Valor previsto (cada quinzena)" : "Valor previsto (cada vez)", vpf),
        campo("De quem é", deSel), campo("Começa em", iniF),
        extra.el, h("div", { class: "nota" }, "Marque em RAS, PROEIS e Segurança. Fica só no salário a conta do mês."),
        ativo.el,
        h("div", { class: "nota" }, "Desmarcar \"Ativo\" encerra a fonte em " + mesExtenso(Regras.somaMes(mesAtual(), -1)) + ": os meses passados não mudam e ela some daqui para frente."),
        h("div", { class: "nota" }, "Avulso: não tem dia certo. Lance cada valor em Mês › Receita avulsa."));
      setTimeout(function () { ajustarDias(per); }, 0);
      ler = function () {
        var pv = perChips.valor();
        var v = Regras.centavos(vpf.value);
        var lista = [];
        if (pv === "mensal") { var a = lerDia(d1); if (a === null || isNaN(a)) return "Escreva o dia em que o dinheiro cai (1 a 31)."; lista = [a]; }
        if (pv === "quinzenal") { var x = lerDia(d1), y = lerDia(d2); if (x === null || y === null || isNaN(x) || isNaN(y)) return "Escreva os dois dias das quinzenas (ex.: 15 e 30)."; lista = [x, y].sort(function (m, n) { return m - n; }); }
        if (pv !== "avulso" && (v === null || v < 0)) return "Escreva o valor previsto.";
        var dadosF = { periodicidade: pv, dias: lista, valor_previsto: v, de: deSel.value || null, inicio: iniF.value || mesAtual(), ativo: ativo.entrada.checked, extra: extra.entrada.checked };
        // desativar grava fim = mês anterior (igual à conta fixa); reativar limpa o fim
        if (ex && e.ativo !== false && !dadosF.ativo) dadosF.fim = fimAoDesativar(e);
        else if (dadosF.ativo) dadosF.fim = null;
        return dadosF;
      };
    } else if (p.tipo === "reserva") {
      var guard = entradaDinheiro(e.valor_guardado), meta = entradaDinheiro(e.meta, "opcional");
      campos.push(campo("Valor guardado hoje", guard), campo("Meta", meta, "em branco = sem meta"));
      ler = function () {
        var g = Regras.centavos(guard.value), m = meta.value.trim() ? Regras.centavos(meta.value) : null;
        if (g === null) return "Escreva quanto está guardado (pode ser 0).";
        if (meta.value.trim() && m === null) return "A meta não é um valor válido.";
        return { valor_guardado: g, meta: m };
      };
    }

    function salvar() {
      erro.hidden = true;
      var n = nome.value.trim();
      if (!n) { nome.focus(); return mostrarErro(erro, "Escreva o nome."); }
      var dados = ler();
      if (typeof dados === "string") return mostrarErro(erro, dados);
      var reg = Object.assign({}, ex || {}, { tipo: p.tipo, nome: n }, dados);
      var salvo = gravar(function () { return Dados.salvar(reg, { motivo: ex ? "alterou " + def.um : "cadastrou " + def.um }); }, ex ? "Alteração salva." : "Cadastrado.");
      if (salvo !== null) concluir();
    }

    return {
      titulo: (ex ? "Editar " : "Novo ") + def.um, sub: def.titulo, form: true, focar: ex ? null : nome,
      conteudo: [voltaBotao(def.titulo), campos, erro,
        ex ? botao("Apagar este cadastro", function () { apagarCadastro(ex, def.um); }, "perigo") : null,
        rodapeForm("Salvar", salvar)]
    };
  };

  /* ---------------- 5.11 Lixeira, histórico, cópias ---------------- */

  TELAS.lixeira = function () {
    var itens = (Dados.lixeira() || []).slice().sort(function (a, b) { return String(b.alterado_em).localeCompare(String(a.alterado_em)); });
    var conteudo = [voltaBotao("Configuração")];
    if (!itens.length) conteudo.push(vazio("A lixeira está vazia. O que você apagar aparece aqui e pode ser restaurado.", null));
    else {
      conteudo.push(h("div", { class: "nota" }, "Nada é apagado de verdade. Restaurar devolve o registro do jeito que estava."));
      conteudo.push(h("div", { class: "cartao" }, itens.map(function (r) {
        return h("div", { class: "linha", style: "align-items:center" },
          h("div", { class: "esq" }, h("span", { class: "nome" }, descreverRegistro(r)),
            h("span", { class: "det" }, (NOMES_TIPO[r.tipo] || r.tipo) + " · apagado em " + momentoBR(r.alterado_em))),
          botao("Restaurar", function () {
            gravar(function () { return Dados.restaurar(r.id); }, "Restaurado.");
            desenhar(false);
          }, "fraco mini", { "aria-label": "Restaurar " + descreverRegistro(r) }));
      })));
    }
    return { titulo: "Lixeira", sub: itens.length + (itens.length === 1 ? " item" : " itens"), conteudo: conteudo };
  };

  // Mostra só o que mudou entre "antes" e "depois" (campos internos ficam de fora)
  var CAMPOS_INTERNOS = { id: 1, tipo: 1, criado_em: 1, alterado_em: 1, versao_formato: 1, lancado_por: 1 };
  function formatarCampo(k, v) {
    if (v === null || v === undefined || v === "") return NI;
    if (typeof v === "number" && /valor|meta|guardado|previsto|recebido|real|referencia/.test(k)) return Regras.dinheiro(v);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return Regras.dataBR(v);
    if (typeof v === "boolean") return v ? "sim" : "não";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "string" && /_id$|^meio$|^ref_id$/.test(k)) { var r = Dados.obter(v); if (r && r.nome) return r.nome; if (r && r.descricao) return r.descricao; }
    return String(v);
  }
  function diferencas(antes, depois) {
    var a = antes || {}, d = depois || {};
    var chaves = {};
    Object.keys(a).concat(Object.keys(d)).forEach(function (k) { if (!CAMPOS_INTERNOS[k]) chaves[k] = 1; });
    return Object.keys(chaves).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(d[k]); })
      .map(function (k) { return k.replace(/_/g, " ") + ": " + formatarCampo(k, a[k]) + " → " + formatarCampo(k, d[k]); });
  }

  TELAS.historico = function (p) {
    var lista = Dados.historico() || [];
    var limite = p.limite || 60;
    var conteudo = [voltaBotao("Configuração")];
    if (!lista.length) conteudo.push(vazio("Nenhuma alteração ainda. Cada lançamento, edição e exclusão fica registrado aqui.", null));
    else {
      var ACOES = { criou: "criou", alterou: "alterou", apagou: "apagou", restaurou: "restaurou" };
      conteudo.push(h("div", { class: "cartao" }, lista.slice(0, limite).map(function (ev) {
        var alvo = ev.depois || ev.antes;
        var difs = ev.acao === "alterou" ? diferencas(ev.antes, ev.depois) : [];
        return h("div", { class: "linha" },
          h("div", { class: "esq" },
            h("span", { class: "nome" }, (ev.lancado_por || NI) + " " + (ACOES[ev.acao] || ev.acao) + " " + (NOMES_TIPO[ev.alvo_tipo] || ev.alvo_tipo || "").toLowerCase()),
            h("span", { class: "det" }, alvo ? descreverRegistro(alvo) : (ev.alvo_id || NI)),
            difs.length ? h("span", { class: "det", style: "color:var(--ink-2)" }, difs.join(" · ")) : null),
          h("span", { class: "dir", style: "font-size:11.5px; color:var(--ink-3); font-weight:400" }, momentoBR(ev.criado_em)));
      })));
      if (lista.length > limite) conteudo.push(botao("Mostrar mais", function () { substituir("historico", { limite: limite + 60 }); }, "fraco"));
    }
    return { titulo: "Histórico", sub: lista.length + " alterações", conteudo: conteudo };
  };

  TELAS.copias = function () {
    var copias = (Dados.copiasAutomaticas() || []).slice();
    var conteudo = [voltaBotao("Configuração"),
      h("div", { class: "cartao plano texto-plano" }, "O app guarda sozinho, neste celular, uma cópia por dia dos últimos 7 dias. Se algo der errado, baixe uma e importe em Config › Importar backup.")];
    if (!copias.length) conteudo.push(vazio("Nenhuma cópia automática ainda. A primeira é feita hoje, ao usar o app.", null));
    else conteudo.push(h("div", { class: "cartao" }, copias.map(function (c) {
        // cada cópia é um backup completo + data_copia ("AAAA-MM-DD") e motivo ("diaria" | "antes_de_importar")
      var quando = c.data_copia || (c.exportado_em ? c.exportado_em.slice(0, 10) : null);
      var regsCopia = c.registros || [];
      var motivo = c.motivo === "antes_de_importar" ? "feita antes de importar um backup" : "cópia do dia";
      return h("div", { class: "linha", style: "align-items:center" },
        h("div", { class: "esq" }, h("span", { class: "nome" }, quando ? dataBR(quando) : NI), h("span", { class: "det" }, motivo + " · " + regsCopia.length + " registros")),
        botao("Baixar", function () {
          baixar("gastos-backup-" + (quando || hoje()) + ".json", JSON.stringify(c, null, 1), "application/json");
        }, "fraco mini", { "aria-label": "Baixar cópia de " + (quando ? dataBR(quando) : "") }));
    })));
    return { titulo: "Cópias automáticas", conteudo: conteudo };
  };

  /* =====================================================================
   * 6. PARTIDA
   * ===================================================================== */

  function iniciar() {
    // Confere se os outros arquivos carregaram (regras.js e dados.js)
    if (!window.Regras || !window.Dados) {
      var c = document.getElementById("corpo");
      c.textContent = "";
      c.appendChild(vazio("Não consegui carregar o app (faltam arquivos). Feche e abra de novo; se continuar, avise quem cuida do sistema.", null));
      return;
    }
    // Cartões abrem, por padrão, nas faturas que vencem no mês seguinte
    ui.mesFatura = Regras.somaMes(mesAtual(), 1);
    // Abas de baixo
    Array.prototype.forEach.call(document.querySelectorAll(".aba"), function (a) {
      a.addEventListener("click", function () { trocarAba(a.dataset.tela); });
    });
    document.getElementById("btnLancar").addEventListener("click", function () { ir("lancar"); });

    // Teclado aberto (campo com foco): esconde abas e botão + para o Salvar ficar à vista
    document.addEventListener("focusin", function (ev) {
      if (ev.target.matches && ev.target.matches(SELETOR_DIGITAVEL)) document.body.classList.add("digitando");
    });
    document.addEventListener("focusout", function () { setTimeout(conferirDigitando, 50); });

    try { Dados.iniciar(); } catch (e) { console.error("Dados.iniciar falhou:", e); }
    if (Dados.aoMudar) Dados.aoMudar(aoMudarDados);

    // Primeira tela: retoma a que estava no histórico (ao recarregar) ou o Início
    var s = history.state;
    if (s && s.tela) atual = { tela: s.tela, p: s.p || {} };
    else history.replaceState({ tela: "inicio", p: {}, prof: 0 }, "");
    document.getElementById("abas").hidden = false;
    desenhar(true);

    // O mês "de hoje" muda à meia-noite: ao voltar para o app, confere
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") atualizarSinc();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
