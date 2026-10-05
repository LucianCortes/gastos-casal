# Gastos do Casal — contrato entre as partes do sistema

Escrito pelo encarregado (Claude) em 05/10/2026. Todo agente lê este arquivo inteiro antes
de escrever qualquer linha. Se algo aqui estiver errado ou faltando, o agente PARA e
relata ao encarregado — não inventa uma regra nova por conta própria.

O usuário (Lucian) não é programador. O código precisa ter comentários em português
explicando cada parte, para que outra IA consiga assumir depois. Nomes de funções e
variáveis em português, sem acento (ex.: `calcularFatura`).

Escopo aprovado: ver seção "Escopo" no fim deste arquivo. Nada fora dele.

---

## 1. Arquivos

Todos na raiz da pasta `gastos-casal/`. HTML/JS puro, sem build, sem framework,
sem biblioteca externa (nem do Supabase: falamos com ele por `fetch`).
Fonte: IBM Plex Sans / IBM Plex Mono do Google Fonts (licença OFL, uso comercial permitido),
com fonte do sistema como reserva quando estiver sem internet.

| Arquivo | Dono | O que é |
|---|---|---|
| `index.html` | Agente Interface | Telas, estilos, estrutura. Carrega os scripts na ordem abaixo |
| `config.js` | Encarregado | Endereço e chave pública do Supabase + valores iniciais (categorias, meios de pagamento). ÚNICO lugar com dado de configuração |
| `regras.js` | Agente Regras | Cálculos puros: fatura, parcelas, mês, contas fixas, receitas, parentes. Sem tocar em tela nem em armazenamento |
| `dados.js` | Agente Nuvem | Armazenamento no aparelho, fila de pendências, sincronização com o Supabase, histórico, lixeira, backup |
| `app.js` | Agente Interface | Liga as telas aos dados e às regras |
| `sw.js`, `manifest.json`, `icone.svg`, `icone-192.png`, `icone-512.png` | Encarregado | Faz virar aplicativo e abrir sem internet |
| `supabase-criar.sql` | Agente Nuvem | Script que cria o banco no Supabase |
| `testes/` | cada agente o seu | Testes em Node (`node testes/regras.test.js`, etc.) |

Ordem de carga no `index.html`: `config.js`, `regras.js`, `dados.js`, `app.js`.
Cada arquivo expõe UM objeto global: `window.CONFIG`, `window.Regras`, `window.Dados`.
`regras.js` também precisa funcionar no Node (`module.exports = Regras` quando existir `module`).

---

## 2. Datas e dinheiro

- Datas guardadas como texto `"AAAA-MM-DD"`. Mês como `"AAAA-MM"`. Momentos (criado/alterado) como ISO completo com fuso (`new Date().toISOString()`).
- Nunca usar `new Date("AAAA-MM-DD")` (vira UTC e erra o dia no Brasil). Montar com `new Date(ano, mes-1, dia)`.
- Dinheiro guardado em **centavos, número inteiro** (`3890` = R$ 38,90). Nunca float. Exibição com `toLocaleString('pt-BR', {style:'currency', currency:'BRL'})`.
- Parcelas: divisão de total em n parcelas usa centavos; a sobra dos centavos vai na **primeira** parcela (ex.: 100,00 em 3x = 33,34 + 33,33 + 33,33).
- Dia que não existe no mês (dia 31 em fevereiro) vira o último dia do mês.

---

## 3. Registros

Tudo é um registro com estes campos comuns:

```
id              texto único. Gerado: tipo-curto + "-" + tempo base36 + 4 letras aleatórias
                (ex.: "lan-lx3k2a-q8zt"). Exceção: confirmações mensais têm id DETERMINÍSTICO (ver abaixo)
tipo            um dos tipos da tabela
criado_em       ISO
alterado_em     ISO — atualizado a cada gravação. É o que decide qual versão vence na sincronização
lancado_por     nome de quem registrou ("Lucian" / "Luciana") — vem da escolha feita no aparelho
apagado         true quando foi para a lixeira (nunca se apaga de verdade)
versao_formato  1
```

Campo ausente ou desconhecido: `null`. Na tela aparece "NÃO INFORMADO". Nunca preencher por suposição.

| tipo | campos próprios |
|---|---|
| `lancamento` | `descricao`, `data_compra`, `valor` (centavos — da parcela, ou o valor único), `valor_total` (centavos, só parcelado), `parcelas` (n, só parcelado, ≥2), `repeticao` ("unico" \| "parcelado"), `categoria_id`, `meio` (id de cartão OU id de meio de pagamento), `de_quem` ("casal" \| "terceiro"), `pessoa_id` (se terceiro) |
| `cartao` | `nome`, `dia_fechamento` (1–31 ou null = NÃO INFORMADO), `dia_vencimento` (1–31 ou null), `ativo` (bool) |
| `meio` | `nome` (Pix, Dinheiro, Débito…), `ativo` |
| `categoria` | `nome`, `ativo`, `ordem` |
| `pessoa` | `nome`, `whatsapp` (só dígitos, com DDD, sem 55 — ou null), `observacao` |
| `emprestimo` | `pessoa_id`, `valor` (centavos), `data`, `descricao` — dinheiro emprestado a parente, sem juros |
| `pagamento` | `pessoa_id`, `valor`, `data`, `ref_id` (id do lancamento-terceiro ou emprestimo que está sendo pago; null = abate do total da pessoa), `observacao` |
| `conta_fixa` | `nome`, `valor_previsto`, `dia` (1–31), `categoria_id`, `meio`, `inicio` ("AAAA-MM"), `fim` ("AAAA-MM" ou null), `ativo` |
| `fixa_confirmada` | id = `"cf:" + conta_fixa_id + ":" + "AAAA-MM"`. Campos: `conta_fixa_id`, `mes`, `valor_real`, `data_pagamento` |
| `fonte` | `nome`, `periodicidade` ("mensal" \| "quinzenal" \| "avulso"), `dias` (lista: [5] mensal, [15,30] quinzenal, [] avulso), `valor_previsto` (por ocorrência), `de` ("Lucian"/"Luciana"/null), `inicio` ("AAAA-MM"), `ativo` |
| `receita_confirmada` | id = `"rc:" + fonte_id + ":" + "AAAA-MM" + ":" + n` (n = 1ª ou 2ª ocorrência). Campos: `fonte_id`, `mes`, `ocorrencia`, `valor_recebido`, `data_recebimento` |
| `receita_avulsa` | `fonte_id` (ou null), `descricao`, `valor_recebido`, `data_recebimento` |
| `reserva` | `nome`, `valor_guardado`, `meta` (ou null) |
| `historico` | `alvo_tipo`, `alvo_id`, `acao` ("criou" \| "alterou" \| "apagou" \| "restaurou"), `antes` (objeto ou null), `depois` (objeto ou null). Nunca é apagado nem alterado |
| `ajuste` | id fixo `"ajuste:casal"`. Campos: `nomes` (lista com os dois nomes do casal, ex.: ["Lucian","Luciana"]) |

Por que confirmações têm id determinístico: os dois celulares podem confirmar a mesma conta
do mesmo mês sem internet. Com o mesmo id, a sincronização trata como o MESMO registro
(vence o mais recente) em vez de duplicar.

---

## 4. Regras de negócio (implementadas em `regras.js`)

Todas as funções recebem a lista de registros (já sem os `apagado: true`, a não ser quando
dito) e devolvem dados prontos para a tela. Nenhuma lê relógio por conta própria: quem chama
passa `hoje` ("AAAA-MM-DD").

**R1. Fatura de uma compra no cartão.** Cartão com `dia_fechamento` F e `dia_vencimento` V.
Compra no dia D do mês M:
- se D < F → a fatura fecha no dia F do mês M; se D ≥ F → fecha no dia F do mês M+1.
  (compra feita no próprio dia do fechamento já cai na fatura seguinte)
- vencimento: se V > F → dia V do mesmo mês do fechamento; se V ≤ F → dia V do mês seguinte ao fechamento.
- A "fatura" de uma compra é identificada pelo mês do vencimento ("AAAA-MM") e a data do vencimento.
- Exemplos que DEVEM passar nos testes: fecha 28 / vence 05, compra 19/09/2026 → vence 05/10/2026.
  Fecha 12 / vence 20, compra 16/04/2026 → vence 20/05/2026. Fecha 12 / vence 20, compra 12/04 →
  fecha 12/05 → vence 20/05. Compra 11/04 → fecha 12/04 → vence 20/04. Fecha 31, compra 10/02 →
  fecha 28/02 (último dia) → vence conforme V.
- Cartão sem `dia_fechamento` ou sem `dia_vencimento`: fatura = null ("NÃO INFORMADO"). A compra entra
  no gasto do mês normalmente, mas fica FORA do total das faturas, listada à parte.
- Meio que não é cartão (Pix, dinheiro, débito): não tem fatura.

**R2. Parcelas.** Lançamento parcelado em n vezes:
- parcela k (1..n) pesa no gasto do mês `mes(data_compra) + (k-1)`.
- parcela k cai na fatura `fatura(data_compra) + (k-1) meses` (mesmo dia de vencimento).
- valor de cada parcela: R2 da seção 2 (sobra na primeira). `valor` guarda a parcela "normal"; `valor_total` manda.
- uma parcela está "vencida" quando a data de vencimento da fatura dela ≤ hoje. Sem fatura conhecida
  (cartão sem datas, ou meio que não é cartão): usar o mês de competência, parcela vencida quando o mês já começou.
- Para compras do casal: pagas = vencidas; faltam = n − pagas; próxima = primeira não vencida.

**R3. Gasto do mês ("Gastou").** Soma, para o mês "AAAA-MM", de:
- lançamentos `de_quem: "casal"` únicos com `data_compra` no mês;
- parcelas de lançamentos `casal` parcelados cuja competência é o mês;
- contas fixas ativas no mês (inicio ≤ mês ≤ fim): `valor_real` da confirmação se existir, senão `valor_previsto`.
Compras de terceiro NUNCA entram no Gastou. Quebrar por categoria e por `lancado_por`.
(conta fixa: `lancado_por` = quem criou a conta fixa; confirmação não muda isso.)

**R4. Receita do mês.** Para cada fonte ativa no mês: uma ocorrência por dia em `dias`.
Ocorrência confirmada (existe `receita_confirmada` com aquele id) → entra no "Entrou" com `valor_recebido`.
Não confirmada → entra só no "A receber" com `valor_previsto`. Somar `receita_avulsa` do mês no "Entrou".
"Previsto do mês" = soma dos previstos das ocorrências + avulsas recebidas.

**R5. Sobrou** = Entrou − Gastou (pode ser negativo; a tela mostra em vermelho).

**R6. Faturas de um mês de vencimento.** Para cada cartão: soma de compras únicas + parcelas cujo
vencimento cai naquele mês, separando casal e terceiro (terceiro listado por pessoa, parcela k de n).
Cartões sem datas: "fora do cálculo", com a soma das compras/parcelas de competência no mês.

**R7. Parentes.** Para cada pessoa:
- compras de terceiro dela: total, parcelas vencidas, a vencer, próxima.
- pago de cada compra: soma dos `pagamento` com `ref_id` = id da compra. "Parcelas pagas pelo parente" =
  floor(pago / valor da parcela), limitado a n.
- empréstimos de dinheiro e o que já foi pago deles (pagamentos com ref_id do empréstimo).
- pagamentos com `ref_id: null` abatem do total geral da pessoa.
- deve = Σ totais das compras + Σ empréstimos − Σ todos os pagamentos dela (nunca abaixo de 0; se pagou
  a mais, mostrar "crédito de R$ X" em vez de esconder).
- texto do WhatsApp (função `textoWhatsApp(pessoa, registros, hoje)`), no formato do protótipo:
  ```
  Oi, Márcia! Resumo até 19/09/2026:
  Tênis — R$ 2.400,00 em 12x de R$ 200,00
  Pagas: 5 (R$ 1.000,00)
  Faltam: 7 (R$ 1.400,00)
  Próxima parcela: 20/10/2026
  Dinheiro emprestado: R$ 300,00
  Total em aberto: R$ 1.700,00
  ```
- link: `https://wa.me/55<whatsapp>?text=<encodeURIComponent(texto)>`. Sem whatsapp: link null.

**R8. Parcelas em andamento** (tela Parcelas): todas as compras parceladas com parcela a vencer, separadas
casal / terceiro; "ainda devendo" = soma das parcelas não vencidas; "cai no próximo mês" = parcelas casal
com competência no mês seguinte.

---

## 5. API de `regras.js` (Agente Regras implementa; Agente Interface só consome)

```
Regras.centavos(texto)                 -> int | null   ("38,90", "38.90", "1.234,56", "R$ 10" ...)
Regras.dinheiro(centavos)              -> "R$ 38,90"
Regras.dataBR("2026-09-19")            -> "19/09/2026"
Regras.mesExtenso("2026-09")           -> "setembro de 2026"
Regras.somaMes("2026-09", k)           -> "2026-10" (k pode ser negativo)
Regras.dividirParcelas(total, n)       -> [int,...]
Regras.fatura(cartao, dataCompra)      -> {mes:"2026-10", vencimento:"2026-10-05", fechamento:"2026-09-28"} | null
Regras.parcelasDe(lancamento, registros) -> [{k, n, valor, competencia, fatura|null, vencida(hoje)...}]
                                          (recebe hoje em parametro: parcelasDe(lanc, registros, hoje))
Regras.resumoMes(registros, mes, hoje) -> {entrou, aReceber, previsto, gastou, sobrou,
                                          porCategoria:[{categoria_id, nome, total}], porPessoa:[{nome,total,pct}],
                                          receitas:[{fonte_id, nome, ocorrencia, previsto, recebido|null, data|null, id_confirmacao}],
                                          fixas:[{conta_fixa_id, nome, dia, previsto, real|null, id_confirmacao}],
                                          itens:[{id, descricao, data, valor, categoria, meio, lancado_por, rotulo}] (ordem: mais recente primeiro)}
Regras.faturasDoMes(registros, mesVencimento, hoje) -> {total, totalTerceiros,
                                          cartoes:[{cartao, vencimento|null, total, casal, terceiros:[{pessoa, descricao, k, n, valor}], semDatas:bool}],
                                          foraDoCalculo:{total, cartoes:[...]}}
Regras.parcelasEmAndamento(registros, hoje) -> {casal:[...], terceiros:[...], aindaDevendo, proximoMes}
Regras.resumoPessoa(pessoa, registros, hoje) -> {deve, credito, compras:[...], emprestimos:[...], pagamentos:[...], proximaParcela|null}
Regras.resumoParentes(registros, hoje) -> {total, pessoas:[{pessoa, deve, rotulo, proxima}]}
Regras.textoWhatsApp(pessoa, registros, hoje) -> texto
Regras.linkWhatsApp(pessoa, texto)     -> url | null
Regras.paraCSV(registros, tipo)        -> texto CSV (separador ";" e vírgula decimal, para abrir direto no Excel brasileiro;
                                          BOM UTF-8 no início; uma coluna por campo; valores em reais "38,90"; datas DD/MM/AAAA)
```

Registros vêm todos juntos (uma lista); cada função filtra pelo `tipo`.

---

## 6. API de `dados.js` (Agente Nuvem implementa)

Armazenamento no aparelho: `localStorage`.
- `gc_registros_v1` → objeto `{id: registro}` com TODOS os registros (inclusive apagados e histórico)
- `gc_fila_v1` → lista de ids pendentes de envio
- `gc_aparelho_v1` → `{codigo, eu (nome), ultimaSync (ISO do servidor)}`
- `gc_copias_v1` → até 7 cópias automáticas diárias (backup no próprio aparelho)

Regra de ouro (herdada do APP Empréstimo): **ao salvar, a PRIMEIRA coisa é gravar no aparelho.**
Só depois tenta a nuvem. Se a internet cair em qualquer ponto, o lançamento sobrevive.

```
Dados.iniciar()                     -> carrega do aparelho; se tiver código, sincroniza em segundo plano
Dados.aparelho()                    -> {codigo|null, eu|null}
Dados.criarCasal(nomes)             -> Promise<codigo>   (gera "XXXX-XXXX" com letras/números sem ambíguos 0/O/1/I/L;
                                       cria na nuvem — exige internet; grava o registro "ajuste:casal" e cria
                                       os registros `categoria` e `meio` a partir de CONFIG.categoriasIniciais /
                                       CONFIG.meiosIniciais. Sem CONFIG.supabaseUrl: cria só no aparelho
                                       e avisa "nuvem não configurada")
Dados.entrarCasal(codigo)           -> Promise<{ok, motivo}>  (confere na nuvem; sem internet: aceita e confere depois)
Dados.definirEu(nome)
Dados.todos({incluirApagados})      -> lista de registros (sem histórico, a não ser que tipo seja pedido)
Dados.porTipo(tipo)                 -> lista
Dados.obter(id)
Dados.salvar(registro, {motivo})    -> registro gravado. Preenche id/criado_em/alterado_em/lancado_por/versao_formato.
                                       Grava histórico (antes/depois). Marca na fila. Agenda envio.
Dados.apagar(id)                    -> apagado:true + histórico (vai para a lixeira)
Dados.restaurar(id)                 -> apagado:false + histórico
Dados.lixeira()                     -> registros apagados (exceto histórico)
Dados.historico(alvoId?)            -> histórico, mais recente primeiro
Dados.sincronizar()                 -> Promise. Envia a fila, puxa o que mudou desde ultimaSync, mescla.
Dados.estado()                      -> {pendentes:n, online:bool, ultimaSync, sincronizando:bool, erro|null}
Dados.aoMudar(fn)                   -> chama fn() sempre que registros ou estado mudarem (inclusive após puxar da nuvem)
Dados.exportarBackup()              -> objeto {versao_formato:1, exportado_em, codigo_casal_parcial:"AB12-****", registros:[...]}
Dados.importarBackup(obj)           -> mescla (não apaga nada que não esteja no arquivo); devolve {novos, atualizados, ignorados}
Dados.copiasAutomaticas()           -> lista das cópias do aparelho
```

Mesclagem: para cada id, vence o registro com `alterado_em` maior. Empate: vence o da nuvem.
Pendente local mais novo que o da nuvem continua pendente (e é reenviado). Histórico nunca é sobrescrito
(id único por evento). Apagado nunca "ressuscita": apagado é só um campo, e vence quem é mais recente.

Sincronização automática: ao abrir, ao voltar a internet (`online`), ao voltar para a tela
(`visibilitychange`), a cada 20 s enquanto a tela está visível, e 2 s depois de cada `salvar`.
É assim que "os dois veem na hora" — atualiza em poucos segundos, sem precisar de tempo real.

### Nuvem (Supabase), por `fetch`, sem biblioteca

- Endereço e chave pública vêm de `CONFIG.supabaseUrl` e `CONFIG.supabaseChave`.
- Chamadas: `POST {url}/rest/v1/rpc/<funcao>` com cabeçalhos `apikey` e `Authorization: Bearer <chave>`.
- Tabela `gc_casais(codigo_hash text pk, criado_em)`; tabela `gc_registros(codigo_hash, id, tipo, dados jsonb,
  alterado_em timestamptz, recebido_em timestamptz default now(), pk(codigo_hash,id))`.
- RLS LIGADO nas duas tabelas e NENHUMA política: ninguém lê nem grava direto. Só pelas funções:
  - `gc_criar(p_codigo text)` → cria o casal (erro se já existir)
  - `gc_existe(p_codigo text)` → boolean
  - `gc_enviar(p_codigo text, p_registros jsonb)` → grava cada um só se `alterado_em` for maior que o guardado;
    devolve `now()` do servidor
  - `gc_puxar(p_codigo text, p_desde timestamptz)` → registros com `recebido_em > p_desde` (ou todos se null),
    + o `now()` do servidor para virar a próxima `ultimaSync`
  - todas `security definer`, `set search_path = public`, guardam o código como `encode(digest(p_codigo,'sha256'),'hex')`
    (extensão pgcrypto), e recusam código inexistente com erro `codigo_invalido`.
  - `grant execute` só dessas funções para `anon`.
- Usar `recebido_em` (relógio do servidor) para a puxada, NÃO `alterado_em` (relógio do celular pode estar errado).

O código do casal funciona como senha: quem tem o código vê os dados. Isso foi decidido
(sem login). A tela de configuração mostra o código escondido e permite revelar.

---

## 7. Telas (Agente Interface) — seguir o protótipo aprovado

`prototipo-aprovado.html` nesta pasta é a referência visual APROVADA pelo usuário.
Copiar o visual (cores, tipografia, componentes, abas de baixo, botão flutuante) e trocar dados
fictícios por dados reais. Telas: Início, Mês (+ Contas fixas), Lançar, Cartões, Parcelas,
Parentes (+ ficha da pessoa, registrar pagamento, novo empréstimo), Config (+ cadastros, lixeira,
histórico, exportar, backup). A tela "Estrutura dos dados" do protótipo NÃO entra no app.
O aviso "Protótipo — dados fictícios" sai.

Novas telas (não estavam no protótipo, manter o mesmo visual):
- Primeiro acesso: "Criar código do casal" (pede os dois nomes) ou "Já tenho o código"; depois "Quem está usando este celular?".
- Cadastros (Config): lista + formulário simples para cartão, meio, categoria, pessoa, conta fixa, fonte de renda, reserva.
- Editar/apagar um lançamento (toque no item da lista).
- Confirmar valor real de conta fixa; confirmar recebimento de receita; lançar receita avulsa.
- Lixeira (restaurar) e Histórico (quem, quando, antes → depois).
- Seletor de mês no topo (setas ← →) nas telas Início e Mês.
- Indicador de sincronização sempre visível no topo: "tudo sincronizado" / "N pendentes — sem internet" / "sincronizando…".

Estado vazio (app começa do zero): cada tela explica o que fazer em uma linha e leva ao cadastro.
Ex.: Cartões sem nenhum cartão → "Cadastre seus cartões em Config" + botão.

Formulário de lançamento: valor primeiro, em destaque, teclado numérico (`inputmode="decimal"`),
foco automático. Mostrar a dica da fatura calculada ("O Cartão 1 fecha dia 28, então esta compra
cai na fatura que vence em 05/10/2026"). "Todo mês" no formulário cria uma `conta_fixa` em vez de lançamento.

Celular primeiro: largura 360–420px; tudo clicável com no mínimo 44px de altura; nada de rolagem horizontal.
Tema claro e escuro (como no protótipo). Acessível: rótulos nos campos, contraste ok.

Sem `alert()`/`confirm()`/`prompt()` nativos: usar avisos e confirmações dentro da página.

---

## Escopo (aprovado por Lucian em 05/10/2026)

Dentro: o descrito acima. Fora: loja de aplicativos; cadastro de usuários, login com senha, planos,
cobrança, painel de administração; ligação com banco ou leitura automática de fatura; gráficos de anos
anteriores; juros sobre empréstimo a parentes. Dado de demonstração nunca entra no app real.

---

## Ajustes registrados após a construção (05/10/2026)

- `gc_enviar(p_codigo, p_registros)` devolve `{servidor_agora, aceitos, recusados, invalidos}`.
- `gc_puxar(p_codigo, p_desde, p_depois_id default null, p_limite default 1000)` devolve
  `{servidor_agora, registros, tem_mais, cursor:{recebido_em, id}}` — paginação por (recebido_em, id).
- Envio e puxada travam o casal (exclusiva / compartilhada) para uma puxada nunca "pular" um envio em andamento.
- `search_path = public, extensions, pg_temp` (no Supabase o pgcrypto fica em `extensions`).
- `estado()` ganhou `aviso` e `nuvemConfigurada`. Sem nuvem, a tela mostra "só neste celular".
- Próxima parcela de parente = a seguinte às que ele já pagou (`proximaAPagar`), não a primeira pelas datas.
- Parcelado no formulário: o valor grande é o TOTAL; o valor da parcela é calculado (editável).
