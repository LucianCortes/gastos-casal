/*
 * dados.js — Gastos do Casal
 * Dono: Agente Nuvem. Especificação: CONTRATO.md, seções 2, 3 e 6.
 *
 * O que este arquivo faz:
 *   1. Guarda TODOS os registros no próprio celular (localStorage).
 *   2. Mantém uma "fila" com o que ainda não foi enviado para a nuvem.
 *   3. Sincroniza com o Supabase (envia a fila, puxa o que o outro celular mandou).
 *   4. Grava o histórico de toda alteração (quem, quando, antes → depois).
 *   5. Lixeira (nada é apagado de verdade), backup (exportar/importar) e
 *      cópias automáticas diárias dentro do próprio celular.
 *
 * Regra número um: NUNCA perder um lançamento, mesmo sem internet.
 * Por isso tudo é gravado no celular ANTES de qualquer tentativa de nuvem,
 * e nada sai da fila sem a nuvem confirmar que recebeu.
 *
 * Expõe um único objeto global: window.Dados (no Node: module.exports).
 * Para testes no Node: Dados._novaInstancia({storage, fetch, agora, config, ...})
 * cria um "celular" independente com memória e rede falsas.
 */
(function (raiz) {
  'use strict';

  // ---------------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------------

  // Chaves do localStorage (contrato, seção 6). Não mudar: mudar = perder os dados já salvos.
  var CHAVES = {
    registros: 'gc_registros_v1',
    fila: 'gc_fila_v1',
    aparelho: 'gc_aparelho_v1',
    copias: 'gc_copias_v1',
    // usada só em emergência: se gc_registros_v1 estiver ilegível, o texto original vai para cá
    ilegivel: 'gc_registros_v1_ilegivel'
  };

  // Alfabeto do código do casal: sem 0, O, 1, I, L (fáceis de confundir). 31 caracteres.
  var ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  // Prefixo curto de cada tipo, usado para montar o id (ex.: "lan-lx3k2a-q8zt").
  var PREFIXOS = {
    lancamento: 'lan', cartao: 'car', meio: 'mei', categoria: 'cat', pessoa: 'pes',
    emprestimo: 'emp', pagamento: 'pag', conta_fixa: 'cfx', fonte: 'fon',
    receita_avulsa: 'rav', reserva: 'res', historico: 'his'
  };
  // Tipos com id determinístico (ver contrato seção 3): não usam prefixo.
  var TIPOS_ID_FIXO = { fixa_confirmada: true, receita_confirmada: true, ajuste: true };

  var VERSAO_FORMATO = 1;
  var TAMANHO_LOTE_ENVIO = 200;     // registros por chamada a gc_enviar
  var LIMITE_PUXADA = 1000;         // registros por chamada a gc_puxar
  var MAXIMO_COPIAS = 7;            // cópias automáticas guardadas no celular
  var ESPERA_APOS_SALVAR = 2000;    // ms entre salvar e enviar (junta vários salvamentos)
  var TEMPO_LIMITE_REDE = 30000;    // ms; depois disso a chamada à nuvem é abandonada

  // ---------------------------------------------------------------------
  // Utilidades sem estado
  // ---------------------------------------------------------------------

  // Cópia profunda (os registros são JSON puro). Evita que a tela altere a memória interna sem querer.
  function clonar(valor) {
    return valor == null ? valor : JSON.parse(JSON.stringify(valor));
  }

  // Texto JSON com as chaves em ordem alfabética: serve para comparar dois registros
  // sem se importar com a ordem dos campos.
  function textoEstavel(valor) {
    if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
    if (Array.isArray(valor)) return '[' + valor.map(textoEstavel).join(',') + ']';
    return '{' + Object.keys(valor).sort().filter(function (k) {
      return valor[k] !== undefined;
    }).map(function (k) {
      return JSON.stringify(k) + ':' + textoEstavel(valor[k]);
    }).join(',') + '}';
  }

  // Converte um momento ISO em milissegundos. Inválido => -Infinity (perde de qualquer válido).
  function tempo(iso) {
    var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return isNaN(t) ? -Infinity : t;
  }

  // Normaliza o código digitado: maiúsculas, aceita sem hífen e com espaços.
  // Devolve "XXXX-XXXX" ou null se não for um código válido.
  function normalizarCodigo(texto) {
    if (typeof texto !== 'string') return null;
    var s = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length !== 8) return null;
    for (var i = 0; i < 8; i++) {
      if (ALFABETO_CODIGO.indexOf(s.charAt(i)) < 0) return null;
    }
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  // Erro de nuvem com "tipo" para decidir o que fazer:
  //   'rede'             = sem internet / tempo esgotado (não é erro do usuário)
  //   'codigo_invalido'  = casal não existe na nuvem
  //   'codigo_ja_existe' = (só em criarCasal) sorteia outro código
  //   'servidor'         = a nuvem respondeu com erro ou com algo inesperado
  function erroNuvem(tipo, mensagem) {
    var e = new Error(mensagem || tipo);
    e.tipo = tipo;
    return e;
  }

  // ---------------------------------------------------------------------
  // Ambiente padrão (navegador). Nos testes, cada parte é substituída.
  // ---------------------------------------------------------------------
  function ambientePadrao() {
    var temJanela = typeof window !== 'undefined';
    var armazenamento = null;
    try { armazenamento = temJanela ? window.localStorage : null; } catch (e) { armazenamento = null; }
    var temCrypto = typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function';
    return {
      storage: armazenamento,
      fetch: typeof fetch === 'function' ? function (u, o) { return fetch(u, o); } : null,
      agora: function () { return new Date(); },
      config: null, // null = usa window.CONFIG
      janela: temJanela ? window : null,
      documento: typeof document !== 'undefined' ? document : null,
      navegador: typeof navigator !== 'undefined' ? navigator : null,
      // bytes aleatórios seguros (crypto.getRandomValues)
      aleatorio: temCrypto ? function (n) { return crypto.getRandomValues(new Uint8Array(n)); } : null,
      agendar: function (fn, ms) { return setTimeout(fn, ms); },
      cancelar: function (id) { clearTimeout(id); },
      repetir: function (fn, ms) { return setInterval(fn, ms); },
      pararRepetir: function (id) { clearInterval(id); }
    };
  }

  // ---------------------------------------------------------------------
  // montar(alvo, opcoes): cria um "celular" completo e coloca as funções
  // públicas dentro de "alvo". Todo o estado fica guardado aqui dentro.
  // ---------------------------------------------------------------------
  function montar(alvo, opcoes) {
    var amb = ambientePadrao();
    Object.keys(opcoes || {}).forEach(function (k) { amb[k] = opcoes[k]; });

    // ----- estado em memória -----
    var registros = {};                 // {id: registro} — espelho de gc_registros_v1
    var fila = [];                      // ids pendentes de envio — espelho de gc_fila_v1
    var aparelho = { codigo: null, eu: null, ultimaSync: null, criarNaNuvem: false };
    var online = !(amb.navegador && amb.navegador.onLine === false);
    var sincronizando = false;
    var promessaSync = null;            // sincronização em andamento (nunca duas ao mesmo tempo)
    var pedirDeNovo = false;            // alguém pediu sincronizar durante uma sincronização
    var erroArmazenamento = null;       // problema ao gravar/ler no celular (o mais grave)
    var erroDaNuvem = null;             // problema com a nuvem (não inclui "sem internet")
    var avisoCopias = null;             // cópias automáticas reduzidas por falta de espaço
    var avisoEspaco = null;             // cópias apagadas para caber os dados principais
    var avisoRecuperacao = null;        // dados recuperados de cópia ao abrir
    var ouvintes = [];
    var temporizadorEnvio = null;
    var temporizadorIntervalo = null;
    var automaticoLigado = false;

    // Configuração atual (lida sempre na hora, para refletir o config.js).
    function cfg() {
      return amb.config || raiz.CONFIG || {};
    }
    function nuvemConfigurada() {
      return !!cfg().supabaseUrl;
    }
    function podeUsarNuvem() {
      return nuvemConfigurada() && !!aparelho.codigo && typeof amb.fetch === 'function';
    }

    // Avisa a tela que algo mudou (registros ou estado). Um ouvinte com erro não derruba os outros.
    function avisar() {
      ouvintes.slice().forEach(function (fn) {
        try { fn(); } catch (e) { /* erro na tela não pode afetar os dados */ }
      });
    }

    // Bytes aleatórios: crypto.getRandomValues; reserva Math.random só para ids (nunca para o código).
    function bytesAleatorios(n, exigirSeguro) {
      if (amb.aleatorio) return amb.aleatorio(n);
      if (exigirSeguro) throw new Error('Este navegador não tem gerador seguro de números (crypto). Atualize o navegador.');
      var b = new Uint8Array(n);
      for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
      return b;
    }

    // -------------------------------------------------------------------
    // Armazenamento no celular (localStorage), sempre dentro de try/catch
    // -------------------------------------------------------------------

    // Lê o texto cru de uma chave. {ok:false} = o próprio localStorage falhou.
    function lerTexto(chave) {
      try {
        if (!amb.storage) return { ok: false };
        return { ok: true, texto: amb.storage.getItem(chave) };
      } catch (e) {
        return { ok: false };
      }
    }

    // Lê e interpreta JSON. {ok:false, texto} = existe mas está ilegível.
    function lerJson(chave) {
      var r = lerTexto(chave);
      if (!r.ok) return { ok: false, falhouArmazenamento: true };
      if (r.texto == null) return { ok: true, valor: null };
      try {
        return { ok: true, valor: JSON.parse(r.texto) };
      } catch (e) {
        return { ok: false, texto: r.texto };
      }
    }

    // Tenta gravar uma vez. true/false, nunca lança erro.
    function gravarUmaVez(chave, valor) {
      try {
        if (!amb.storage) return false;
        amb.storage.setItem(chave, JSON.stringify(valor));
        return true;
      } catch (e) {
        return false;
      }
    }

    // Grava os dados PRINCIPAIS (registros, fila, aparelho). Se não couber,
    // apaga as cópias automáticas mais antigas (são redundantes) e tenta de novo.
    // Os dados principais sempre têm prioridade sobre as cópias.
    function gravarPrincipal(chave, valor) {
      if (gravarUmaVez(chave, valor)) return true;
      var copias = lerCopias();
      while (copias.length > 0) {
        copias.pop(); // a lista está da mais nova para a mais antiga
        if (!gravarUmaVez(CHAVES.copias, copias)) {
          try { amb.storage.removeItem(CHAVES.copias); } catch (e) { /* segue */ }
          copias = [];
        }
        if (gravarUmaVez(chave, valor)) {
          avisoEspaco = 'Memória do celular quase cheia: apaguei cópias automáticas antigas para ' +
            'guardar os lançamentos. Exporte um backup em Config.';
          return true;
        }
      }
      return false;
    }

    // Grava gc_registros_v1. Em caso de falha, NADA é descartado: o registro
    // continua em memória e na fila (vai para a nuvem assim que possível),
    // e estado().erro explica o problema.
    function persistirRegistros() {
      var ok = gravarPrincipal(CHAVES.registros, registros);
      if (ok) {
        erroArmazenamento = null;
      } else {
        erroArmazenamento = 'ATENÇÃO: o celular não conseguiu guardar os dados (memória cheia ou ' +
          'bloqueada). O que foi lançado está só na tela' +
          (podeUsarNuvem() ? ' e será enviado à nuvem assim que houver internet' : '') +
          '. Não feche o app; libere espaço no celular ou exporte um backup em Config.';
      }
      return ok;
    }

    // Grava gc_fila_v1. Se falhar, APAGA a fila antiga do celular: uma fila velha
    // gravada faria os registros novos nunca serem enviados; sem fila, ao abrir
    // o app reconstrói a fila com TODOS os registros (reenvio é inofensivo).
    function persistirFila() {
      var ok = gravarPrincipal(CHAVES.fila, fila);
      if (!ok) {
        try { amb.storage.removeItem(CHAVES.fila); } catch (e) { /* segue */ }
        if (!erroArmazenamento) {
          erroArmazenamento = 'ATENÇÃO: o celular não conseguiu guardar a lista de pendências ' +
            '(memória cheia). Não feche o app; libere espaço no celular.';
        }
      }
      return ok;
    }

    function persistirAparelho() {
      var ok = gravarPrincipal(CHAVES.aparelho, aparelho);
      if (!ok && !erroArmazenamento) {
        erroArmazenamento = 'ATENÇÃO: o celular não conseguiu guardar a configuração deste aparelho ' +
          '(memória cheia). Libere espaço no celular.';
      }
      return ok;
    }

    // -------------------------------------------------------------------
    // Fila de pendências (ids que ainda não chegaram na nuvem)
    // -------------------------------------------------------------------
    function naFila(id) {
      return fila.indexOf(id) >= 0;
    }
    function adicionarFila(id) {
      if (!naFila(id)) fila.push(id);
    }
    function removerDaFila(id) {
      var i = fila.indexOf(id);
      if (i >= 0) fila.splice(i, 1);
    }

    // -------------------------------------------------------------------
    // Cópias automáticas (gc_copias_v1): até 7, da mais nova para a mais antiga
    // -------------------------------------------------------------------
    function lerCopias() {
      var r = lerJson(CHAVES.copias);
      return r.ok && Array.isArray(r.valor) ? r.valor : [];
    }

    // Grava a lista de cópias; se não couber, guarda menos e avisa.
    function gravarCopias(lista) {
      var copias = lista.slice(0, MAXIMO_COPIAS);
      var queria = copias.length;
      while (copias.length > 0 && !gravarUmaVez(CHAVES.copias, copias)) {
        copias.pop();
      }
      if (copias.length === 0 && queria > 0) {
        try { amb.storage.removeItem(CHAVES.copias); } catch (e) { /* segue */ }
        avisoCopias = 'Não coube nenhuma cópia automática no celular (memória cheia). ' +
          'Exporte um backup em Config.';
      } else if (copias.length < queria) {
        avisoCopias = 'Memória do celular cheia: só coube(ram) ' + copias.length +
          ' cópia(s) automática(s) (o normal é ' + MAXIMO_COPIAS + '). Exporte um backup em Config.';
      } else {
        avisoCopias = null;
      }
      return copias.length;
    }

    // Data local de hoje "AAAA-MM-DD" (sem usar UTC, contrato seção 2).
    function hojeLocal() {
      var d = amb.agora();
      function dois(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
    }

    function montarBackup() {
      var c = aparelho.codigo;
      return {
        versao_formato: VERSAO_FORMATO,
        exportado_em: amb.agora().toISOString(),
        codigo_casal_parcial: c ? c.slice(0, 4) + '-****' : null,
        registros: Object.keys(registros).map(function (id) { return clonar(registros[id]); })
      };
    }

    // Faz uma cópia agora (motivo: "diaria" ou "antes_de_importar").
    function fazerCopia(motivo) {
      if (Object.keys(registros).length === 0) return;
      var copia = montarBackup();
      copia.data_copia = hojeLocal();
      copia.motivo = motivo;
      var lista = [copia].concat(lerCopias());
      gravarCopias(lista);
    }

    // Uma cópia por dia, feita ao abrir o app.
    function fazerCopiaDiaria() {
      var hoje = hojeLocal();
      var jaTem = lerCopias().some(function (c) { return c && c.data_copia === hoje && c.motivo === 'diaria'; });
      if (!jaTem) fazerCopia('diaria');
    }

    // -------------------------------------------------------------------
    // Carregar do celular (ao abrir)
    // -------------------------------------------------------------------
    function carregar() {
      // 1) registros
      var r = lerJson(CHAVES.registros);
      if (r.ok) {
        registros = (r.valor && typeof r.valor === 'object' && !Array.isArray(r.valor)) ? r.valor : {};
      } else if (r.falhouArmazenamento) {
        registros = {};
        erroArmazenamento = 'Não foi possível ler a memória do celular (armazenamento bloqueado, ' +
          'talvez navegação anônima). Os lançamentos não ficarão guardados neste celular.';
      } else {
        // Texto existe mas está estragado. Guarda o original à parte (para socorro
        // manual) e recupera a cópia automática mais recente.
        try { amb.storage.setItem(CHAVES.ilegivel, r.texto); } catch (e) { /* sem espaço: segue */ }
        var copias = lerCopias();
        registros = {};
        if (copias.length && Array.isArray(copias[0].registros)) {
          copias[0].registros.forEach(function (reg) {
            if (reg && typeof reg.id === 'string') registros[reg.id] = reg;
          });
          avisoRecuperacao = 'Os dados do celular estavam danificados; recuperei a cópia automática de ' +
            copias[0].data_copia + '. O que chegou na nuvem depois disso volta na sincronização.';
        } else {
          avisoRecuperacao = 'Os dados do celular estavam danificados e não havia cópia automática. ' +
            'O que estiver na nuvem volta na sincronização; se tiver backup, importe em Config.';
        }
        persistirRegistros();
      }

      // 2) aparelho
      var a = lerJson(CHAVES.aparelho);
      if (a.ok && a.valor && typeof a.valor === 'object') {
        aparelho = {
          codigo: normalizarCodigo(a.valor.codigo || '') || null,
          eu: typeof a.valor.eu === 'string' && a.valor.eu ? a.valor.eu : null,
          ultimaSync: typeof a.valor.ultimaSync === 'string' ? a.valor.ultimaSync : null,
          criarNaNuvem: a.valor.criarNaNuvem === true
        };
      }
      if (avisoRecuperacao) aparelho.ultimaSync = null; // puxa tudo de novo da nuvem

      // 3) fila. Se a fila sumiu ou estragou mas existem registros, por SEGURANÇA
      //    coloca tudo na fila: a nuvem descarta o que já tem (recusa versões
      //    iguais ou mais velhas), então reenviar nunca estraga nada.
      var f = lerJson(CHAVES.fila);
      var temRegistros = Object.keys(registros).length > 0;
      if (f.ok && Array.isArray(f.valor)) {
        fila = f.valor.filter(function (id) { return typeof id === 'string'; });
      } else if (temRegistros && (f.ok || !f.falhouArmazenamento)) {
        fila = Object.keys(registros);
        persistirFila();
      } else {
        fila = [];
      }
      if (avisoRecuperacao) {
        fila = Object.keys(registros);
        persistirFila();
        persistirAparelho();
      }
    }

    // -------------------------------------------------------------------
    // Ids e momentos
    // -------------------------------------------------------------------

    // Id: prefixo + "-" + tempo base36 + "-" + 4 letras aleatórias. Ex.: "lan-lx3k2a-q8zt".
    function gerarId(tipo) {
      var letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var id;
      do {
        var b = bytesAleatorios(4, false);
        var sufixo = '';
        for (var i = 0; i < 4; i++) sufixo += letras.charAt(b[i] % letras.length);
        id = PREFIXOS[tipo] + '-' + amb.agora().getTime().toString(36) + '-' + sufixo;
      } while (registros[id]);
      return id;
    }

    // Id determinístico das confirmações e do ajuste (contrato seção 3).
    // Mesmo id nos dois celulares => a sincronização trata como o MESMO registro.
    function idFixo(reg) {
      if (reg.tipo === 'ajuste') return 'ajuste:casal';
      if (reg.tipo === 'fixa_confirmada') {
        if (!reg.conta_fixa_id || !reg.mes) throw new Error('Confirmação de conta fixa sem conta_fixa_id ou mes');
        return 'cf:' + reg.conta_fixa_id + ':' + reg.mes;
      }
      if (reg.tipo === 'receita_confirmada') {
        if (!reg.fonte_id || !reg.mes || reg.ocorrencia == null) {
          throw new Error('Confirmação de receita sem fonte_id, mes ou ocorrencia');
        }
        return 'rc:' + reg.fonte_id + ':' + reg.mes + ':' + reg.ocorrencia;
      }
      return null;
    }

    // Momento da gravação. Sempre MAIOR que o anterior do mesmo registro, mesmo
    // se o relógio do celular estiver atrasado: assim a edição mais recente feita
    // neste celular nunca perde para a versão que ela mesma substituiu.
    function novoMomento(anteriorIso) {
      var t = amb.agora().getTime();
      var antes = tempo(anteriorIso);
      if (t <= antes) t = antes + 1;
      return new Date(t).toISOString();
    }

    // -------------------------------------------------------------------
    // Salvar / apagar / restaurar
    // -------------------------------------------------------------------

    /*
     * salvar(registro, {motivo}) — ORDEM IMPORTANTE (regra de ouro do contrato):
     *   1. GRAVA NO CELULAR primeiro. O registro e a linha de histórico são
     *      colocados na memória e gravados JUNTOS numa única gravação do
     *      localStorage (registro antes do histórico). Uma gravação única é mais
     *      segura que duas: não existe momento com o registro salvo e o
     *      histórico faltando.
     *   2. Depois coloca os dois ids na FILA e grava a fila.
     *   3. Por último AGENDA o envio para a nuvem (2 s depois).
     * Se a internet cair em qualquer ponto, o lançamento já está no celular.
     * Se o próprio celular falhar ao gravar, nada é descartado: o registro fica
     * na memória e na fila, o envio é tentado na hora, e estado().erro avisa.
     */
    function salvar(entrada, opcoesSalvar) {
      if (!entrada || typeof entrada !== 'object') throw new Error('salvar: registro inválido');
      var reg = clonar(entrada);
      if (reg.tipo === 'historico') throw new Error('O histórico é gravado automaticamente e nunca é alterado');
      if (!PREFIXOS[reg.tipo] && !TIPOS_ID_FIXO[reg.tipo]) throw new Error('Tipo de registro desconhecido: ' + reg.tipo);

      var fixo = idFixo(reg);
      if (fixo) reg.id = fixo;
      var anterior = reg.id && registros[reg.id] ? registros[reg.id] : null;
      if (anterior && anterior.tipo !== reg.tipo) throw new Error('Não é permitido trocar o tipo de um registro');
      if (!reg.id) reg.id = gerarId(reg.tipo);

      // Campos comuns (contrato seção 3)
      reg.criado_em = anterior ? anterior.criado_em : (reg.criado_em || amb.agora().toISOString());
      reg.lancado_por = anterior ? (anterior.lancado_por == null ? null : anterior.lancado_por)
        : (reg.lancado_por || aparelho.eu || null);
      reg.apagado = typeof reg.apagado === 'boolean' ? reg.apagado : (anterior ? anterior.apagado === true : false);
      reg.versao_formato = VERSAO_FORMATO;

      // Nada mudou? Não grava nem cria histórico.
      if (anterior) {
        var a = clonar(anterior), b = clonar(reg);
        delete a.alterado_em; delete b.alterado_em;
        if (textoEstavel(a) === textoEstavel(b)) return clonar(anterior);
      }
      reg.alterado_em = novoMomento(anterior && anterior.alterado_em);

      var acao = 'criou';
      if (anterior) {
        if (!anterior.apagado && reg.apagado) acao = 'apagou';
        else if (anterior.apagado && !reg.apagado) acao = 'restaurou';
        else acao = 'alterou';
      }
      var hist = {
        id: gerarId('historico'),
        tipo: 'historico',
        criado_em: reg.alterado_em,
        alterado_em: reg.alterado_em,
        lancado_por: aparelho.eu || null,
        apagado: false,
        versao_formato: VERSAO_FORMATO,
        alvo_tipo: reg.tipo,
        alvo_id: reg.id,
        acao: acao,
        antes: anterior ? clonar(anterior) : null,
        depois: clonar(reg),
        motivo: (opcoesSalvar && opcoesSalvar.motivo) || null
      };

      // 1) celular (registro + histórico, uma gravação só)
      registros[reg.id] = reg;
      registros[hist.id] = hist;
      var gravouNoCelular = persistirRegistros();
      // 2) fila
      adicionarFila(reg.id);
      adicionarFila(hist.id);
      persistirFila();
      // 3) agenda envio (na hora, se o celular não conseguiu gravar)
      agendarEnvio(gravouNoCelular ? ESPERA_APOS_SALVAR : 0);
      avisar();
      return clonar(reg);
    }

    function apagar(id) {
      var r = registros[id];
      if (!r) return null;
      if (r.tipo === 'historico') throw new Error('O histórico nunca é apagado');
      var c = clonar(r);
      c.apagado = true;
      return salvar(c);
    }

    function restaurar(id) {
      var r = registros[id];
      if (!r) return null;
      if (r.tipo === 'historico') return clonar(r);
      var c = clonar(r);
      c.apagado = false;
      return salvar(c);
    }

    // -------------------------------------------------------------------
    // Leitura
    // -------------------------------------------------------------------
    function todos(op) {
      op = op || {};
      return Object.keys(registros).map(function (id) { return registros[id]; }).filter(function (r) {
        if (op.tipo) { if (r.tipo !== op.tipo) return false; } else if (r.tipo === 'historico') return false;
        if (!op.incluirApagados && r.apagado === true) return false;
        return true;
      }).map(clonar);
    }

    function porTipo(tipo) {
      return todos({ tipo: tipo });
    }

    function obter(id) {
      return registros[id] ? clonar(registros[id]) : null;
    }

    function lixeira() {
      return todos({ incluirApagados: true }).filter(function (r) { return r.apagado === true; });
    }

    function historico(alvoId) {
      return todos({ tipo: 'historico', incluirApagados: true }).filter(function (h) {
        return !alvoId || h.alvo_id === alvoId;
      }).sort(function (x, y) {
        var d = tempo(y.criado_em) - tempo(x.criado_em);
        return d !== 0 ? d : (y.id < x.id ? -1 : y.id > x.id ? 1 : 0);
      });
    }

    // -------------------------------------------------------------------
    // Nuvem: chamada de uma função gc_* por fetch
    // -------------------------------------------------------------------
    async function chamar(funcao, parametros) {
      var c = cfg();
      var url = String(c.supabaseUrl).replace(/\/+$/, '') + '/rest/v1/rpc/' + funcao;
      var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var relogio = controle && amb.agendar ? amb.agendar(function () { controle.abort(); }, TEMPO_LIMITE_REDE) : null;
      var resposta, texto;
      try {
        resposta = await amb.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: c.supabaseChave || '',
            Authorization: 'Bearer ' + (c.supabaseChave || '')
          },
          body: JSON.stringify(parametros),
          signal: controle ? controle.signal : undefined
        });
        texto = await resposta.text();
      } catch (e) {
        online = false;
        throw erroNuvem('rede', 'Sem internet');
      } finally {
        if (relogio != null && amb.cancelar) amb.cancelar(relogio);
      }
      online = true;
      var corpo = null;
      try { corpo = texto ? JSON.parse(texto) : null; } catch (e) { corpo = null; }
      if (!resposta.ok) {
        var msg = (corpo && (corpo.message || corpo.error || corpo.hint)) || ('HTTP ' + resposta.status);
        if (/codigo_invalido/.test(msg)) throw erroNuvem('codigo_invalido', 'Código do casal não encontrado na nuvem');
        if (/codigo_ja_existe/.test(msg)) throw erroNuvem('codigo_ja_existe', msg);
        throw erroNuvem('servidor', msg);
      }
      return corpo;
    }

    // -------------------------------------------------------------------
    // Mesclagem (contrato seção 6)
    //   * vence o alterado_em maior; empate: vence a nuvem;
    //   * local mais novo continua (e fica na fila para reenviar);
    //   * histórico nunca é sobrescrito;
    //   * "apagado" é só um campo: vence quem é mais recente (não ressuscita).
    // Devolve true se algo mudou no celular.
    // -------------------------------------------------------------------
    function mesclarUm(daNuvem) {
      if (!daNuvem || typeof daNuvem !== 'object' || typeof daNuvem.id !== 'string' || !daNuvem.id) return false;
      var id = daNuvem.id;
      var local = registros[id];
      if (!local) {
        registros[id] = daNuvem;
        return true;
      }
      if (local.tipo === 'historico') return false;
      if (tempo(local.alterado_em) > tempo(daNuvem.alterado_em)) {
        // o do celular é mais novo: fica, e garante que vai ser (re)enviado
        if (!naFila(id)) { adicionarFila(id); return true; }
        return false;
      }
      // nuvem igual ou mais nova: vence a nuvem; a versão local deixa de ser pendente
      var mudou = naFila(id);
      removerDaFila(id);
      if (textoEstavel(local) !== textoEstavel(daNuvem)) {
        registros[id] = daNuvem;
        mudou = true;
      }
      return mudou;
    }

    // -------------------------------------------------------------------
    // Sincronização
    // -------------------------------------------------------------------

    // Envia a fila em lotes. Só tira da fila o que a nuvem confirmou
    // (aceitos ou recusados por ter versão igual/mais nova) E que não foi
    // alterado de novo durante o envio. Os "invalidos" ficam na fila.
    async function enviarFila() {
      var ids = fila.slice();
      var invalidos = 0;
      for (var i = 0; i < ids.length; i += TAMANHO_LOTE_ENVIO) {
        var lote = ids.slice(i, i + TAMANHO_LOTE_ENVIO);
        var enviadoComo = {};
        var lista = [];
        lote.forEach(function (id) {
          var r = registros[id];
          if (!r) { removerDaFila(id); return; } // id sem registro: nada a enviar
          enviadoComo[id] = r.alterado_em;
          lista.push(clonar(r));
        });
        if (!lista.length) { persistirFila(); continue; }

        var resp = await chamar('gc_enviar', { p_codigo: aparelho.codigo, p_registros: lista });
        if (!resp || !Array.isArray(resp.aceitos) || !Array.isArray(resp.recusados)) {
          throw erroNuvem('servidor', 'Resposta inesperada da nuvem ao enviar');
        }
        resp.aceitos.concat(resp.recusados).forEach(function (id) {
          if (Object.prototype.hasOwnProperty.call(enviadoComo, id) &&
              registros[id] && registros[id].alterado_em === enviadoComo[id]) {
            removerDaFila(id);
          }
        });
        invalidos += Array.isArray(resp.invalidos) ? resp.invalidos.length : 0;
        persistirFila();
        avisar();
      }
      return invalidos;
    }

    // Puxa da nuvem o que chegou depois de ultimaSync, em páginas.
    // A ultimaSync só avança se tudo o que foi puxado ficou gravado no celular
    // (senão, numa próxima abertura, esses registros não viriam de novo).
    async function puxar() {
      var desde = aparelho.ultimaSync;
      var depoisId = null;
      var tudoGravado = true;
      for (var volta = 0; volta < 100000; volta++) {
        var resp = await chamar('gc_puxar', {
          p_codigo: aparelho.codigo, p_desde: desde, p_depois_id: depoisId, p_limite: LIMITE_PUXADA
        });
        if (!resp || typeof resp.servidor_agora !== 'string' || !Array.isArray(resp.registros)) {
          throw erroNuvem('servidor', 'Resposta inesperada da nuvem ao puxar');
        }
        var mudou = false;
        resp.registros.forEach(function (r) { if (mesclarUm(r)) mudou = true; });
        if (mudou) {
          if (!persistirRegistros()) tudoGravado = false;
          persistirFila();
          avisar();
        }
        if (resp.tem_mais && resp.cursor && resp.cursor.id) {
          desde = resp.cursor.recebido_em;
          depoisId = resp.cursor.id;
          continue;
        }
        if (tudoGravado) {
          aparelho.ultimaSync = resp.servidor_agora; // relógio do SERVIDOR, texto exato
          persistirAparelho();
        }
        return;
      }
    }

    // Uma rodada: (cria o casal na nuvem se foi criado sem nuvem) → envia → puxa.
    async function umaRodada() {
      if (aparelho.criarNaNuvem) {
        try {
          await chamar('gc_criar', { p_codigo: aparelho.codigo });
        } catch (e) {
          if (e.tipo !== 'codigo_ja_existe') throw e;
        }
        aparelho.criarNaNuvem = false;
        persistirAparelho();
      }
      var invalidos = await enviarFila();
      await puxar();
      return invalidos;
    }

    function tratarErroSync(e) {
      if (e && e.tipo === 'rede') {
        online = false;              // sem internet não é "erro": a tela mostra "N pendentes — sem internet"
        erroDaNuvem = null;
      } else if (e && e.tipo === 'codigo_invalido') {
        erroDaNuvem = 'Código do casal não encontrado na nuvem'; // nada local é apagado
      } else if (e && e.tipo === 'servidor') {
        erroDaNuvem = 'A nuvem respondeu com erro (' + e.message + '). Os dados continuam guardados neste celular.';
      } else {
        erroDaNuvem = 'Erro inesperado na sincronização: ' + (e && e.message) +
          '. Os dados continuam guardados neste celular.';
      }
    }

    // sincronizar() — nunca roda duas ao mesmo tempo. Se for chamada durante uma
    // sincronização, devolve a mesma promessa e faz mais uma rodada no final.
    // A promessa NUNCA é rejeitada: resolve {ok:true} ou {ok:false, erro}.
    function sincronizar() {
      if (promessaSync) {
        pedirDeNovo = true;
        return promessaSync;
      }
      if (!nuvemConfigurada()) return Promise.resolve({ ok: false, erro: 'nuvem não configurada' });
      if (!aparelho.codigo) return Promise.resolve({ ok: false, erro: 'sem código do casal' });
      if (typeof amb.fetch !== 'function') return Promise.resolve({ ok: false, erro: 'sem acesso à rede' });

      promessaSync = (async function () {
        sincronizando = true;
        avisar();
        try {
          var invalidos = 0, rodadas = 0;
          do {
            pedirDeNovo = false;
            invalidos = await umaRodada();
            rodadas++;
          } while (pedirDeNovo && rodadas < 5);
          erroDaNuvem = invalidos > 0
            ? 'A nuvem recusou ' + invalidos + ' registro(s) com defeito; eles continuam guardados neste celular.'
            : null;
          return { ok: true };
        } catch (e) {
          tratarErroSync(e);
          return { ok: false, erro: e && e.tipo === 'rede' ? 'sem internet' : erroDaNuvem };
        } finally {
          sincronizando = false;
          promessaSync = null;
          avisar();
        }
      })();
      return promessaSync;
    }

    function sincronizarSePuder() {
      if (podeUsarNuvem()) sincronizar();
    }

    // Envio agendado depois de salvar (junta vários salvamentos seguidos num envio só).
    function agendarEnvio(ms) {
      if (!podeUsarNuvem() || !amb.agendar) return;
      if (temporizadorEnvio != null && amb.cancelar) amb.cancelar(temporizadorEnvio);
      temporizadorEnvio = amb.agendar(function () {
        temporizadorEnvio = null;
        sincronizarSePuder();
      }, ms);
    }

    // Sincronização automática: internet voltou, tela voltou, e a cada N segundos com a tela visível.
    function ligarAutomatico() {
      if (automaticoLigado) return;
      automaticoLigado = true;
      var j = amb.janela, d = amb.documento;
      if (j && j.addEventListener) {
        j.addEventListener('online', function () { online = true; avisar(); sincronizarSePuder(); });
        j.addEventListener('offline', function () { online = false; avisar(); });
      }
      if (d && d.addEventListener) {
        d.addEventListener('visibilitychange', function () {
          if (d.visibilityState === 'visible') sincronizarSePuder();
        });
      }
      var segundos = Number(cfg().intervaloSincronizacao) || 20;
      if (segundos < 5) segundos = 5;
      if (amb.repetir) {
        temporizadorIntervalo = amb.repetir(function () {
          if (!d || d.visibilityState !== 'hidden') sincronizarSePuder();
        }, segundos * 1000);
      }
    }

    // -------------------------------------------------------------------
    // Casal e aparelho
    // -------------------------------------------------------------------
    function gerarCodigo() {
      var s = '';
      while (s.length < 8) {
        var bytes = bytesAleatorios(16, true);
        for (var i = 0; i < bytes.length && s.length < 8; i++) {
          // 248 = 31 × 8: descartar 248..255 deixa todas as 31 letras com a mesma chance
          if (bytes[i] < 248) s += ALFABETO_CODIGO.charAt(bytes[i] % 31);
        }
      }
      return s.slice(0, 4) + '-' + s.slice(4);
    }

    // Cria ajuste:casal, categorias e meios iniciais (só os que ainda não existem).
    function semear(nomes) {
      var c = cfg();
      salvar({ tipo: 'ajuste', nomes: nomes.slice() });
      if (porTipo('categoria').length === 0) {
        (c.categoriasIniciais || []).forEach(function (nome, i) {
          salvar({ tipo: 'categoria', nome: nome, ativo: true, ordem: i + 1 });
        });
      }
      if (porTipo('meio').length === 0) {
        (c.meiosIniciais || []).forEach(function (nome) {
          salvar({ tipo: 'meio', nome: nome, ativo: true });
        });
      }
    }

    async function criarCasal(nomes) {
      if (!Array.isArray(nomes) || nomes.length !== 2) throw new Error('Informe os dois nomes do casal');
      var limpos = nomes.map(function (n) { return String(n == null ? '' : n).trim(); });
      if (!limpos[0] || !limpos[1]) throw new Error('Informe os dois nomes do casal');
      if (aparelho.codigo) {
        throw new Error('Este celular já está ligado ao casal ' + aparelho.codigo.slice(0, 4) + '-****.');
      }
      var codigo = null;
      if (nuvemConfigurada()) {
        for (var tentativa = 0; tentativa < 5 && !codigo; tentativa++) {
          var candidato = gerarCodigo();
          try {
            await chamar('gc_criar', { p_codigo: candidato });
            codigo = candidato;
          } catch (e) {
            if (e.tipo === 'codigo_ja_existe') continue;
            if (e.tipo === 'rede') throw new Error('Sem internet. Para criar o código do casal é preciso estar conectado.');
            throw new Error('Não foi possível criar o casal na nuvem: ' + e.message);
          }
        }
        if (!codigo) throw new Error('Não foi possível criar o casal na nuvem. Tente de novo.');
        aparelho.criarNaNuvem = false;
      } else {
        // sem nuvem: código só no celular; se um dia a nuvem for configurada,
        // a primeira sincronização cria o casal lá (criarNaNuvem).
        codigo = gerarCodigo();
        aparelho.criarNaNuvem = true;
      }
      aparelho.codigo = codigo;
      aparelho.ultimaSync = null;
      persistirAparelho();
      semear(limpos);
      sincronizarSePuder();
      avisar();
      return codigo;
    }

    async function entrarCasal(codigoDigitado) {
      var codigo = normalizarCodigo(codigoDigitado);
      if (!codigo) return { ok: false, motivo: 'Código inválido: são 8 letras ou números, como AB2C-D3EF' };
      if (aparelho.codigo === codigo) return { ok: true, motivo: null };
      if (aparelho.codigo && Object.keys(registros).length > 0) {
        return { ok: false, motivo: 'Este celular já tem dados de outro casal (' + aparelho.codigo.slice(0, 4) + '-****).' };
      }
      function usar() {
        aparelho.codigo = codigo;
        aparelho.ultimaSync = null;
        aparelho.criarNaNuvem = false;
        persistirAparelho();
        avisar();
      }
      if (!nuvemConfigurada()) {
        usar();
        return { ok: true, motivo: 'nuvem não configurada' };
      }
      var existe;
      try {
        existe = await chamar('gc_existe', { p_codigo: codigo });
      } catch (e) {
        if (e.tipo === 'rede') {
          usar(); // sem internet: aceita e confere na próxima sincronização
          return { ok: true, motivo: 'Sem internet agora: o código será conferido quando a internet voltar' };
        }
        return { ok: false, motivo: 'A nuvem respondeu com erro (' + e.message + '). Tente de novo.' };
      }
      if (existe !== true) return { ok: false, motivo: 'Código do casal não encontrado na nuvem' };
      usar();
      sincronizarSePuder();
      return { ok: true, motivo: null };
    }

    function definirEu(nome) {
      var n = String(nome == null ? '' : nome).trim();
      aparelho.eu = n || null;
      persistirAparelho();
      avisar();
      return aparelho.eu;
    }

    // -------------------------------------------------------------------
    // Estado e backup
    // -------------------------------------------------------------------
    function estado() {
      var erro = erroArmazenamento || erroDaNuvem;
      if (!erro && !nuvemConfigurada()) erro = 'nuvem não configurada (os dados ficam só neste celular)';
      var avisos = [avisoRecuperacao, avisoEspaco, avisoCopias].filter(Boolean);
      return {
        pendentes: fila.length,
        online: online,
        ultimaSync: aparelho.ultimaSync,
        sincronizando: sincronizando,
        erro: erro || null,
        aviso: avisos.length ? avisos.join(' ') : null,
        nuvemConfigurada: nuvemConfigurada()
      };
    }

    // Mescla um backup: nada que não esteja no arquivo é apagado. Antes, faz uma cópia automática.
    function importarBackup(obj) {
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.registros)) {
        throw new Error('Arquivo de backup inválido: não tem a lista de registros. Nada foi importado.');
      }
      if (obj.versao_formato !== VERSAO_FORMATO) {
        throw new Error('Backup de versão desconhecida (' + obj.versao_formato + '). Nada foi importado.');
      }
      fazerCopia('antes_de_importar');
      var novos = 0, atualizados = 0, ignorados = 0;
      obj.registros.forEach(function (r) {
        var valido = r && typeof r === 'object' && typeof r.id === 'string' && r.id &&
          (PREFIXOS[r.tipo] || TIPOS_ID_FIXO[r.tipo]) && tempo(r.alterado_em) > -Infinity;
        if (!valido) { ignorados++; return; }
        var local = registros[r.id];
        if (!local) {
          registros[r.id] = clonar(r); adicionarFila(r.id); novos++;
        } else if (local.tipo === 'historico' || tempo(r.alterado_em) <= tempo(local.alterado_em)) {
          ignorados++;
        } else {
          registros[r.id] = clonar(r); adicionarFila(r.id); atualizados++;
        }
      });
      if (novos + atualizados > 0) {
        persistirRegistros();
        persistirFila();
        agendarEnvio(ESPERA_APOS_SALVAR);
      }
      avisar();
      return { novos: novos, atualizados: atualizados, ignorados: ignorados };
    }

    function iniciar() {
      carregar();
      fazerCopiaDiaria();
      ligarAutomatico();
      sincronizarSePuder();
      avisar();
      return estado();
    }

    // Para os temporizadores (usado nos testes e ao trocar de ambiente).
    function parar() {
      if (temporizadorEnvio != null && amb.cancelar) amb.cancelar(temporizadorEnvio);
      if (temporizadorIntervalo != null && amb.pararRepetir) amb.pararRepetir(temporizadorIntervalo);
      temporizadorEnvio = null;
      temporizadorIntervalo = null;
    }

    // ----- API pública (contrato seção 6) -----
    alvo.iniciar = iniciar;
    alvo.aparelho = function () { return { codigo: aparelho.codigo, eu: aparelho.eu }; };
    alvo.criarCasal = criarCasal;
    alvo.entrarCasal = entrarCasal;
    alvo.definirEu = definirEu;
    alvo.todos = todos;
    alvo.porTipo = porTipo;
    alvo.obter = obter;
    alvo.salvar = salvar;
    alvo.apagar = apagar;
    alvo.restaurar = restaurar;
    alvo.lixeira = lixeira;
    alvo.historico = historico;
    alvo.sincronizar = sincronizar;
    alvo.estado = estado;
    alvo.aoMudar = function (fn) {
      if (typeof fn === 'function') ouvintes.push(fn);
      return function cancelar() {
        var i = ouvintes.indexOf(fn);
        if (i >= 0) ouvintes.splice(i, 1);
      };
    };
    alvo.exportarBackup = montarBackup;
    alvo.importarBackup = importarBackup;
    alvo.copiasAutomaticas = function () { return clonar(lerCopias()); };
    // extras (fora do contrato, úteis para a tela e para testes)
    alvo.normalizarCodigo = normalizarCodigo;
    alvo._parar = parar;
    return alvo;
  }

  // ---------------------------------------------------------------------
  // Objeto global
  // ---------------------------------------------------------------------
  var Dados = {};
  montar(Dados, {});

  // Troca o ambiente do objeto global (testes). Zera o estado em memória.
  Dados._configurarAmbiente = function (opcoes) {
    if (Dados._parar) Dados._parar();
    var extras = { _configurarAmbiente: Dados._configurarAmbiente, _novaInstancia: Dados._novaInstancia };
    montar(Dados, opcoes);
    Dados._configurarAmbiente = extras._configurarAmbiente;
    Dados._novaInstancia = extras._novaInstancia;
    return Dados;
  };
  // Cria um "celular" independente (testes com dois aparelhos).
  Dados._novaInstancia = function (opcoes) {
    return montar({}, opcoes);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Dados;
  }
  raiz.Dados = Dados;
})(typeof window !== 'undefined' ? window : globalThis);
