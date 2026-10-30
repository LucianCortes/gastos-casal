/*
 * testes/orcamento.test.js — testes da regra R9 (Regras.resumoOrcamento), CONTRATO.md seção 8.
 * Rodar: node testes/orcamento.test.js   (só usa o `assert` do Node, sem dependências)
 */
"use strict";
var assert = require("assert");
var path = require("path");
var Regras = require(path.join(__dirname, "..", "regras.js"));

var MES = "2026-10";
var HOJE = "2026-10-30";
var passou = 0, falhou = 0;

function teste(nome, fn) {
  try { fn(); passou++; console.log("ok   - " + nome); }
  catch (e) { falhou++; console.log("FALHA - " + nome + "\n       " + (e && e.message)); }
}

// --- ajudantes para montar registros ---
function ajuste(campos) {
  var a = { id: "ajuste:casal", tipo: "ajuste", nomes: ["Lucian", "Luciana"] };
  for (var k in campos) a[k] = campos[k];
  return a;
}
function fonte(id, campos) {
  var f = { id: id, tipo: "fonte", nome: id, periodicidade: "mensal", dias: [5], valor_previsto: 0, inicio: "2026-01", ativo: true };
  for (var k in campos) f[k] = campos[k];
  return f;
}
function cat(id, nome, campos) {
  var c = { id: id, tipo: "categoria", nome: nome, ativo: true };
  for (var k in campos) c[k] = campos[k];
  return c;
}
function compra(id, valor, data, campos) {
  var l = { id: id, tipo: "lancamento", descricao: id, data_compra: data, valor: valor, repeticao: "unico",
    categoria_id: null, meio: "pix", de_quem: "casal", lancado_por: "Lucian" };
  for (var k in campos) l[k] = campos[k];
  return l;
}
var PIX = { id: "pix", tipo: "meio", nome: "Pix", ativo: true };
var SALARIO = fonte("salario", { valor_previsto: 500000 });

// =====================================================================================
// Cenário completo: fixas.usado + livre.usado == resumoMes().gastou
// =====================================================================================
var cenario = [
  ajuste({}),
  PIX,
  { id: "cartao1", tipo: "cartao", nome: "Cartão 1", dia_fechamento: 28, dia_vencimento: 5, ativo: true },
  SALARIO,
  cat("cat-luz", "Luz"),
  cat("cat-merc", "Mercadinho"),
  // contas fixas: aluguel confirmado com valor diferente; luz prevista; internet com dia null
  { id: "cf-aluguel", tipo: "conta_fixa", nome: "Aluguel", valor_previsto: 150000, dia: 10, categoria_id: null, meio: "pix", inicio: "2026-01", fim: null, ativo: true, lancado_por: "Lucian" },
  { id: "cf:cf-aluguel:2026-10", tipo: "fixa_confirmada", conta_fixa_id: "cf-aluguel", mes: "2026-10", valor_real: 155000, data_pagamento: "2026-10-10" },
  { id: "cf-luz", tipo: "conta_fixa", nome: "Luz", valor_previsto: 20000, dia: 15, categoria_id: "cat-luz", meio: "pix", inicio: "2026-01", fim: null, ativo: true },
  { id: "cf-net", tipo: "conta_fixa", nome: "Internet", valor_previsto: 10000, dia: null, categoria_id: null, meio: "pix", inicio: "2026-01", fim: null, ativo: true },
  // compra única do casal
  compra("u1", 12345, "2026-10-03", { categoria_id: "cat-merc" }),
  // compra parcelada do casal: 1000,00 em 3x no cartão, comprada em setembro -> parcela 2 em outubro
  compra("p1", 33333, "2026-09-19", { repeticao: "parcelado", parcelas: 3, valor_total: 100000, meio: "cartao1" }),
  // compra de terceiro (nunca entra)
  compra("t1", 50000, "2026-10-04", { de_quem: "terceiro", pessoa_id: "pes1" }),
  compra("t2", 20000, "2026-09-04", { de_quem: "terceiro", pessoa_id: "pes1", repeticao: "parcelado", parcelas: 2, valor_total: 40000 })
];

teste("fixas.usado + livre.usado == resumoMes().gastou (cenário com fixas, única, parcelada, terceiro)", function () {
  var o = Regras.resumoOrcamento(cenario, MES, HOJE);
  var m = Regras.resumoMes(cenario, MES, HOJE);
  assert.strictEqual(o.fixas.usado + o.livre.usado, m.gastou);
  // conferência dos números: 155000 (aluguel real) + 20000 (luz) + 10000 (internet dia null)
  assert.strictEqual(o.fixas.contas, 185000);
  assert.strictEqual(o.fixas.parcelas, 33333); // parcela 2/3 de 100000 (33334 + 33333 + 33333)
  assert.strictEqual(o.fixas.usado, 218333);
  assert.strictEqual(o.livre.usado, 12345);
  assert.strictEqual(m.gastou, 230678);
});

teste("o mesmo vale em outros meses (setembro e novembro)", function () {
  ["2026-09", "2026-11", "2026-12"].forEach(function (mm) {
    var o = Regras.resumoOrcamento(cenario, mm, HOJE);
    assert.strictEqual(o.fixas.usado + o.livre.usado, Regras.resumoMes(cenario, mm, HOJE).gastou, mm);
  });
});

teste("regra padrão 70/20/10: alvos, sobra e sobraSalario", function () {
  var o = Regras.resumoOrcamento(cenario, MES, HOJE);
  assert.strictEqual(o.regra, "70/20/10");
  assert.deepStrictEqual(o.pcts, { fixas: 70, livre: 20, investir: 10 });
  assert.strictEqual(o.base, 500000);
  assert.deepStrictEqual(o.baseOrigem, [{ fonte_id: "salario", nome: "salario" }]);
  assert.strictEqual(o.fixas.alvo, 350000);
  assert.strictEqual(o.livre.alvo, 100000);
  assert.strictEqual(o.investir.alvo, 50000);
  assert.strictEqual(o.investir.sobra, 500000 - 218333 - 12345);
  assert.strictEqual(o.sobraSalario, o.investir.sobra);
});

teste("regra 60/30/10 e arredondamento do alvo", function () {
  var regs = [ajuste({ regra_orcamento: "60/30/10" }), fonte("s", { valor_previsto: 123457 })];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.strictEqual(o.regra, "60/30/10");
  assert.deepStrictEqual(o.pcts, { fixas: 60, livre: 30, investir: 10 });
  assert.strictEqual(o.fixas.alvo, Math.round(123457 * 60 / 100)); // 74074
  assert.strictEqual(o.livre.alvo, Math.round(123457 * 30 / 100)); // 37037
  assert.strictEqual(o.investir.alvo, Math.round(123457 * 10 / 100)); // 12346
});

teste("regra desconhecida no ajuste vira 70/20/10", function () {
  var o = Regras.resumoOrcamento([ajuste({ regra_orcamento: "50/30/20" }), SALARIO], MES, HOJE);
  assert.strictEqual(o.regra, "70/20/10");
});

teste("sobra pode ser negativa", function () {
  var regs = [fonte("s", { valor_previsto: 10000 }), PIX, compra("x", 30000, "2026-10-01")];
  assert.strictEqual(Regras.resumoOrcamento(regs, MES, HOJE).sobraSalario, -20000);
});

// =====================================================================================
// Base do orçamento
// =====================================================================================
teste("sem nenhuma fonte: base null e todos os alvos null", function () {
  var o = Regras.resumoOrcamento([ajuste({}), PIX, compra("x", 1000, "2026-10-01")], MES, HOJE);
  assert.strictEqual(o.base, null);
  assert.deepStrictEqual(o.baseOrigem, []);
  assert.strictEqual(o.fixas.alvo, null);
  assert.strictEqual(o.livre.alvo, null);
  assert.strictEqual(o.investir.alvo, null);
  assert.strictEqual(o.investir.sobra, null);
  assert.strictEqual(o.sobraSalario, null);
  assert.strictEqual(o.livre.usado, 1000); // o gasto continua sendo contado
});

teste("quinzenal soma as duas ocorrências", function () {
  var o = Regras.resumoOrcamento([fonte("q", { periodicidade: "quinzenal", dias: [15, 30], valor_previsto: 200000 })], MES, HOJE);
  assert.strictEqual(o.base, 400000);
});

teste("mensal com dias vazio ou com dia null conta 1 ocorrência", function () {
  assert.strictEqual(Regras.resumoOrcamento([fonte("a", { dias: [], valor_previsto: 300000 })], MES, HOJE).base, 300000);
  assert.strictEqual(Regras.resumoOrcamento([fonte("b", { dias: [null], valor_previsto: 300000 })], MES, HOJE).base, 300000);
  assert.strictEqual(Regras.resumoOrcamento([fonte("c", { dias: null, valor_previsto: 300000 })], MES, HOJE).base, 300000);
});

teste("fonte avulso não entra na base", function () {
  var o = Regras.resumoOrcamento([fonte("av", { periodicidade: "avulso", dias: [], valor_previsto: 90000 })], MES, HOJE);
  assert.strictEqual(o.base, null);
});

teste("inicio/fim/ativo respeitados na base", function () {
  var regs = [
    fonte("ok", { valor_previsto: 100000 }),
    fonte("futura", { valor_previsto: 1, inicio: "2026-11" }),
    fonte("acabou", { valor_previsto: 2, fim: "2026-09" }),
    fonte("desligada", { valor_previsto: 4, ativo: false }),
    fonte("desligadaComFim", { valor_previsto: 8, ativo: false, fim: "2026-12" })
  ];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.strictEqual(o.base, 100008);
  assert.deepStrictEqual(o.baseOrigem.map(function (x) { return x.fonte_id; }), ["ok", "desligadaComFim"]);
});

teste("fonte_salario_id escolhe só aquela fonte", function () {
  var regs = [ajuste({ fonte_salario_id: "s2" }), fonte("s1", { valor_previsto: 100000 }), fonte("s2", { valor_previsto: 250000 })];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.strictEqual(o.base, 250000);
  assert.deepStrictEqual(o.baseOrigem, [{ fonte_id: "s2", nome: "s2" }]);
});

teste("fonte_salario_id inexistente ou apagada: soma de todas as fontes não extra", function () {
  var fontes = [fonte("s1", { valor_previsto: 100000 }), fonte("s2", { valor_previsto: 250000 }),
    fonte("x", { extra: true, valor_previsto: 999 })];
  var o1 = Regras.resumoOrcamento([ajuste({ fonte_salario_id: "nao-existe" })].concat(fontes), MES, HOJE);
  assert.strictEqual(o1.base, 350000);
  var apagada = fonte("s3", { valor_previsto: 777, apagado: true });
  var o2 = Regras.resumoOrcamento([ajuste({ fonte_salario_id: "s3" }), apagada].concat(fontes), MES, HOJE);
  assert.strictEqual(o2.base, 350000);
});

teste("fonte_salario_id que não vale no mês: base null (não troca por outra fonte)", function () {
  var regs = [ajuste({ fonte_salario_id: "s2" }), fonte("s1", { valor_previsto: 100000 }), fonte("s2", { valor_previsto: 250000, inicio: "2026-11" })];
  assert.strictEqual(Regras.resumoOrcamento(regs, MES, HOJE).base, null);
});

// =====================================================================================
// Extras
// =====================================================================================
teste("extras: confirmada, não confirmada e avulsa ligada a fonte extra; nada disso na base", function () {
  var regs = [
    SALARIO,
    fonte("ras", { nome: "RAS", extra: true, dias: [10], valor_previsto: 80000 }),
    { id: "rc:ras:2026-10:1", tipo: "receita_confirmada", fonte_id: "ras", mes: "2026-10", ocorrencia: 1, valor_recebido: 82000, data_recebimento: "2026-10-11" },
    fonte("proeis", { nome: "PROEIS", extra: true, dias: [20], valor_previsto: 60000 }),
    fonte("seg", { nome: "Segurança", extra: true, periodicidade: "avulso", dias: [], valor_previsto: null }),
    { id: "av1", tipo: "receita_avulsa", fonte_id: "seg", descricao: "evento", valor_recebido: 30000, data_recebimento: "2026-10-02" },
    { id: "av2", tipo: "receita_avulsa", fonte_id: null, descricao: "venda", valor_recebido: 5000, data_recebimento: "2026-10-03" },
    { id: "av3", tipo: "receita_avulsa", fonte_id: "seg", descricao: "outro mês", valor_recebido: 1, data_recebimento: "2026-09-30" }
  ];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.strictEqual(o.base, 500000);
  assert.deepStrictEqual(o.baseOrigem.map(function (x) { return x.fonte_id; }), ["salario"]);
  assert.strictEqual(o.extras.recebido, 82000 + 30000);
  assert.strictEqual(o.extras.aReceber, 60000);
  assert.deepStrictEqual(o.extras.itens, [
    { fonte_id: "seg", nome: "Segurança", recebido: 30000, previsto: null, data: "2026-10-02" },
    { fonte_id: "ras", nome: "RAS", recebido: 82000, previsto: 80000, data: "2026-10-11" },
    { fonte_id: "proeis", nome: "PROEIS", recebido: null, previsto: 60000, data: null }
  ]);
  // resumoMes continua somando tudo no Entrou (inclusive extra)
  assert.strictEqual(Regras.resumoMes(regs, MES, HOJE).entrou, 82000 + 30000 + 5000);
});

teste("só fontes extra e nenhuma outra: base null", function () {
  var o = Regras.resumoOrcamento([fonte("ras", { extra: true, valor_previsto: 80000 })], MES, HOJE);
  assert.strictEqual(o.base, null);
  assert.strictEqual(o.extras.aReceber, 80000);
});

teste("fonte_salario_id apontando para fonte extra não a usa como base", function () {
  var regs = [ajuste({ fonte_salario_id: "ras" }), SALARIO, fonte("ras", { extra: true, valor_previsto: 80000 })];
  assert.strictEqual(Regras.resumoOrcamento(regs, MES, HOJE).base, 500000);
});

// =====================================================================================
// Mercado
// =====================================================================================
function mercado(valorMercadinho, ajusteCampos) {
  var regs = [ajuste(ajusteCampos || {}), PIX, cat("m", "Mercadinho")];
  if (valorMercadinho > 0) regs.push(compra("c", valorMercadinho, "2026-10-05", { categoria_id: "m" }));
  return Regras.resumoOrcamento(regs, MES, HOJE).mercado;
}

teste("referência padrão 50000", function () {
  assert.strictEqual(mercado(0).referencia, 50000);
  assert.strictEqual(mercado(0, { referencia_mercadinho: 0 }).referencia, 50000);
  assert.strictEqual(mercado(0, { referencia_mercadinho: 80000 }).referencia, 80000);
});

teste("níveis do mercadinho nos limites exatos", function () {
  assert.strictEqual(mercado(0).nivel, "ok");
  assert.strictEqual(mercado(24999).nivel, "ok");
  assert.strictEqual(mercado(25000).nivel, "metade");
  assert.strictEqual(mercado(39999).nivel, "metade");
  assert.strictEqual(mercado(40000).nivel, "alto");
  assert.strictEqual(mercado(49999).nivel, "alto");
  assert.strictEqual(mercado(50000).nivel, "passou");
  assert.strictEqual(mercado(70000).nivel, "passou");
});

teste("categoria achada pelo nome sem acento/maiúscula; idas = compras únicas; parcela conta no valor", function () {
  var regs = [ajuste({}), PIX,
    cat("cm", "Compra Mensal"), cat("mk", "mercadinho"), cat("velha", "Mercadinho", { ativo: false }),
    compra("a", 60000, "2026-10-01", { categoria_id: "cm" }),
    compra("b", 5000, "2026-10-02", { categoria_id: "mk" }),
    compra("c", 7000, "2026-10-09", { categoria_id: "mk" }),
    compra("d", 1000, "2026-09-30", { categoria_id: "mk" }), // outro mês
    compra("e", 2000, "2026-10-12", { categoria_id: "velha" }), // categoria inativa: não conta
    compra("f", 3000, "2026-10-12", { categoria_id: "mk", de_quem: "terceiro", pessoa_id: "p" }), // terceiro
    compra("g", 9000, "2026-09-15", { categoria_id: "mk", repeticao: "parcelado", parcelas: 3, valor_total: 9000 }) // parcela 2/3 = 3000
  ];
  var mm = Regras.resumoOrcamento(regs, MES, HOJE).mercado;
  assert.strictEqual(mm.compraMensal, 60000);
  assert.strictEqual(mm.mercadinho, 5000 + 7000 + 3000);
  assert.strictEqual(mm.idasMercadinho, 2);
});

teste("nome com acento também é achado (\"Compra mênsal\" ~ \"compra mensal\")", function () {
  var regs = [PIX, cat("cm", "  Compra   Mênsal "), compra("a", 100, "2026-10-01", { categoria_id: "cm" })];
  assert.strictEqual(Regras.resumoOrcamento(regs, MES, HOJE).mercado.compraMensal, 100);
});

teste("categoria pelo id no ajuste (vale mesmo com outro nome)", function () {
  var regs = [ajuste({ categoria_compra_mensal_id: "x1", categoria_mercadinho_id: "x2" }), PIX,
    cat("x1", "Atacadão"), cat("x2", "Padaria"), cat("mk", "Mercadinho"),
    compra("a", 40000, "2026-10-01", { categoria_id: "x1" }),
    compra("b", 1500, "2026-10-02", { categoria_id: "x2" }),
    compra("c", 9999, "2026-10-03", { categoria_id: "mk" })];
  var mm = Regras.resumoOrcamento(regs, MES, HOJE).mercado;
  assert.strictEqual(mm.compraMensal, 40000);
  assert.strictEqual(mm.mercadinho, 1500);
  assert.strictEqual(mm.idasMercadinho, 1);
});

// =====================================================================================
// Metas
// =====================================================================================
teste("metas: só reservas com meta, ordem de meta crescente, pct com 1 casa", function () {
  var regs = [
    { id: "r1", tipo: "reserva", nome: "Viver de renda", valor_guardado: 100000, meta: 60000000 },
    { id: "r2", tipo: "reserva", nome: "Emergência", valor_guardado: 1000000, meta: 3000000 },
    { id: "r3", tipo: "reserva", nome: "Sem meta", valor_guardado: 5000, meta: null },
    { id: "r4", tipo: "reserva", nome: "Sem guardado", valor_guardado: null, meta: 10000000 }
  ];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.deepStrictEqual(o.metas, [
    { reserva_id: "r2", nome: "Emergência", guardado: 1000000, meta: 3000000, pct: 33.3 },
    { reserva_id: "r4", nome: "Sem guardado", guardado: null, meta: 10000000, pct: null },
    { reserva_id: "r1", nome: "Viver de renda", guardado: 100000, meta: 60000000, pct: 0.2 }
  ]);
});

// =====================================================================================
// Robustez
// =====================================================================================
teste("conta fixa com dia null não quebra e entra nas fixas", function () {
  var regs = [SALARIO, { id: "cf", tipo: "conta_fixa", nome: "Net", valor_previsto: 9900, dia: null, inicio: "2026-01", fim: null, ativo: true }];
  var o = Regras.resumoOrcamento(regs, MES, HOJE);
  assert.strictEqual(o.fixas.contas, 9900);
  assert.strictEqual(o.fixas.usado, Regras.resumoMes(regs, MES, HOJE).gastou);
});

teste("mês inválido devolve null; lista vazia funciona", function () {
  assert.strictEqual(Regras.resumoOrcamento([], "2026-13", HOJE), null);
  var o = Regras.resumoOrcamento([], MES, HOJE);
  assert.strictEqual(o.base, null);
  assert.strictEqual(o.fixas.usado, 0);
  assert.strictEqual(o.livre.usado, 0);
  assert.strictEqual(o.mercado.nivel, "ok");
  assert.deepStrictEqual(o.extras, { recebido: 0, aReceber: 0, itens: [] });
  assert.deepStrictEqual(o.metas, []);
});

teste("registros apagados são ignorados", function () {
  var regs = [SALARIO, PIX, compra("x", 1000, "2026-10-01", { apagado: true })];
  assert.strictEqual(Regras.resumoOrcamento(regs, MES, HOJE).livre.usado, 0);
});

console.log("\n" + passou + " passaram, " + falhou + " falharam");
if (falhou) process.exit(1);
