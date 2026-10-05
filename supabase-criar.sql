-- =====================================================================
-- Gastos do Casal — script que cria o banco na nuvem (Supabase / Postgres)
-- Dono: Agente Nuvem. Especificação: CONTRATO.md, seção 6.
--
-- COMO RODAR: Supabase > SQL Editor > colar tudo > Run
--
-- Pode rodar quantas vezes quiser: nada é apagado e nada dá erro na
-- segunda vez (usa "if not exists" e "create or replace").
--
-- Ideia geral (para quem for mexer depois):
--   * Ninguém lê nem grava as tabelas diretamente. A segurança (RLS) está
--     ligada e SEM nenhuma política, e o acesso direto foi retirado.
--   * O app só consegue chamar 4 funções: gc_criar, gc_existe, gc_enviar,
--     gc_puxar. Todas exigem o código do casal.
--   * O código do casal nunca fica guardado em texto: guardamos só o
--     "hash" sha256 dele (codigo_hash). Quem não tem o código não acha nada.
--   * Cada registro do app (lançamento, cartão, histórico...) fica inteiro
--     na coluna "dados" (jsonb). A nuvem não interpreta o conteúdo; só
--     decide qual versão é a mais nova pelo campo alterado_em.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Extensão pgcrypto (fornece a função digest, usada no hash do código).
--    No Supabase ela mora no esquema "extensions"; por isso as funções
--    abaixo procuram nos esquemas "public" e "extensions".
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------

-- Um casal = um código. Só o hash do código é guardado.
create table if not exists public.gc_casais (
  codigo_hash text primary key,
  criado_em   timestamptz not null default now()
);

-- Todos os registros de todos os casais.
--   alterado_em = momento da última alteração, dado pelo CELULAR (decide quem vence)
--   recebido_em = momento em que a NUVEM recebeu (relógio do servidor; usado na puxada)
create table if not exists public.gc_registros (
  codigo_hash text not null references public.gc_casais(codigo_hash),
  id          text not null,
  tipo        text not null,
  dados       jsonb not null,
  alterado_em timestamptz not null,
  recebido_em timestamptz not null default now(),
  primary key (codigo_hash, id)
);

-- Índice para a puxada ("o que chegou depois de tal momento"), em ordem.
create index if not exists gc_registros_puxada_idx
  on public.gc_registros (codigo_hash, recebido_em, id);


-- ---------------------------------------------------------------------
-- 3) Segurança das tabelas: RLS ligado e NENHUMA política.
--    Resultado: pela API pública ninguém lê nem grava direto.
--    E, por garantia, retiramos qualquer permissão direta.
-- ---------------------------------------------------------------------
alter table public.gc_casais    enable row level security;
alter table public.gc_registros enable row level security;

revoke all on table public.gc_casais    from public;
revoke all on table public.gc_registros from public;
do $$
begin
  -- anon e authenticated existem no Supabase; o "if" evita erro em outro Postgres.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.gc_casais, public.gc_registros from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.gc_casais, public.gc_registros from authenticated';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 4) Função auxiliar (interna, o app NÃO chama): transforma o código
--    digitado no hash guardado.
--    Normaliza antes: maiúsculas, tira espaços e hífen, exige 8 caracteres
--    do alfabeto sem ambíguos (sem 0, O, 1, I, L) e remonta "XXXX-XXXX".
--    Devolve null se o código tiver formato inválido.
-- ---------------------------------------------------------------------
create or replace function public.gc_hash(p_codigo text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v !~ '^[A-HJKMNP-Z2-9]{8}$' then
    return null;
  end if;
  return encode(digest(substr(v, 1, 4) || '-' || substr(v, 5, 4), 'sha256'), 'hex');
end
$$;


-- ---------------------------------------------------------------------
-- 5) gc_criar(p_codigo) — cria o casal.
--    Erro "codigo_ja_existe" se já existir (o app sorteia outro código).
--    Erro "codigo_invalido" se o formato estiver errado.
-- ---------------------------------------------------------------------
create or replace function public.gc_criar(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text := public.gc_hash(p_codigo);
begin
  if v_hash is null then
    raise exception 'codigo_invalido';
  end if;
  insert into public.gc_casais (codigo_hash) values (v_hash)
  on conflict (codigo_hash) do nothing;
  if not found then
    raise exception 'codigo_ja_existe';
  end if;
  return true;
end
$$;


-- ---------------------------------------------------------------------
-- 6) gc_existe(p_codigo) — true se o casal existe. Usado em "Já tenho o código".
-- ---------------------------------------------------------------------
create or replace function public.gc_existe(p_codigo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text := public.gc_hash(p_codigo);
begin
  if v_hash is null then
    return false;
  end if;
  return exists (select 1 from public.gc_casais where codigo_hash = v_hash);
end
$$;


-- ---------------------------------------------------------------------
-- 7) gc_enviar(p_codigo, p_registros) — o celular manda um lote de
--    registros completos (lista jsonb, no máximo 500 por chamada).
--
--    Para cada registro: grava se não existe, ou atualiza SOMENTE se o
--    alterado_em que chegou for MAIOR que o guardado (empate: fica o da
--    nuvem). Registro do tipo "historico" nunca é sobrescrito.
--
--    Devolve:
--      { servidor_agora, aceitos:[ids gravados],
--        recusados:[ids em que a nuvem já tem versão igual ou mais nova],
--        invalidos:[ids com defeito — sem id, sem alterado_em válido...] }
--    O celular tira da fila os aceitos e os recusados (a versão da nuvem
--    chega na puxada) e MANTÉM os inválidos (nada some sem aviso).
--
--    Trava: pega uma trava exclusiva do casal enquanto grava. A puxada pega
--    a mesma trava em modo compartilhado. Junto com o relógio
--    clock_timestamp() lido DEPOIS da trava, isso garante que nenhuma
--    gravação "escape" da puxada (ver explicação em gc_puxar).
-- ---------------------------------------------------------------------
create or replace function public.gc_enviar(p_codigo text, p_registros jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash      text := public.gc_hash(p_codigo);
  v_agora     timestamptz;
  v_reg       jsonb;
  v_id        text;
  v_tipo      text;
  v_alterado  timestamptz;
  v_valido    boolean;
  v_gravou    boolean;
  v_aceitos   text[] := '{}';
  v_recusados text[] := '{}';
  v_invalidos text[] := '{}';
begin
  if v_hash is null or not exists (select 1 from public.gc_casais where codigo_hash = v_hash) then
    raise exception 'codigo_invalido';
  end if;
  if p_registros is null or jsonb_typeof(p_registros) <> 'array' then
    raise exception 'lista_invalida';
  end if;
  if jsonb_array_length(p_registros) > 500 then
    raise exception 'lote_grande_demais';
  end if;

  -- trava exclusiva deste casal (liberada sozinha no fim da transação)
  perform pg_advisory_xact_lock(hashtextextended('gc:' || v_hash, 0));
  v_agora := clock_timestamp();

  for v_reg in select value from jsonb_array_elements(p_registros) loop
    -- confere o registro; qualquer defeito => vai para "invalidos"
    v_id := null; v_valido := true;
    begin
      if jsonb_typeof(v_reg) <> 'object' then
        raise exception 'nao_e_objeto';
      end if;
      v_id   := v_reg->>'id';
      v_tipo := v_reg->>'tipo';
      v_alterado := (v_reg->>'alterado_em')::timestamptz;
      if v_id is null or length(v_id) = 0 or length(v_id) > 200
         or v_tipo is null or length(v_tipo) = 0 or length(v_tipo) > 40
         or v_alterado is null
         or octet_length(v_reg::text) > 200000 then
        raise exception 'registro_invalido';
      end if;
    exception when others then
      v_valido := false;
    end;

    if not v_valido then
      v_invalidos := v_invalidos || coalesce(v_id, '(sem id)');
    else
      v_gravou := null;
      insert into public.gc_registros as g (codigo_hash, id, tipo, dados, alterado_em, recebido_em)
      values (v_hash, v_id, v_tipo, v_reg, v_alterado, v_agora)
      on conflict (codigo_hash, id) do update
        set tipo        = excluded.tipo,
            dados       = excluded.dados,
            alterado_em = excluded.alterado_em,
            recebido_em = excluded.recebido_em
        where g.alterado_em < excluded.alterado_em
          and g.tipo <> 'historico'
      returning true into v_gravou;

      if v_gravou then
        v_aceitos := v_aceitos || v_id;
      else
        v_recusados := v_recusados || v_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'servidor_agora', v_agora,
    'aceitos',   to_jsonb(v_aceitos),
    'recusados', to_jsonb(v_recusados),
    'invalidos', to_jsonb(v_invalidos)
  );
end
$$;


-- ---------------------------------------------------------------------
-- 8) gc_puxar(p_codigo, p_desde, p_depois_id, p_limite) — devolve o que a
--    nuvem RECEBEU depois de p_desde (relógio do servidor, nunca o do celular).
--
--    Devolve:
--      { servidor_agora, registros:[...], tem_mais:true/false,
--        cursor:{recebido_em, id} ou null }
--
--    Páginas: no máximo p_limite (até 1000) registros por chamada.
--    Se tem_mais = true, o celular chama de novo com
--      p_desde = cursor.recebido_em  e  p_depois_id = cursor.id
--    até tem_mais = false. Aí guarda servidor_agora (da ÚLTIMA página)
--    como sua "ultimaSync".
--
--    Por que (recebido_em + id) e não só recebido_em: um mesmo lote enviado
--    grava vários registros com o MESMO recebido_em. Se a página cortasse no
--    meio desse grupo e o próximo pedido fosse "recebido_em > X", os que
--    sobraram do grupo seriam pulados. Com o par (recebido_em, id), em ordem
--    fixa, a próxima página continua exatamente do registro seguinte.
--
--    Primeira página (p_depois_id nulo) usa "recebido_em >= p_desde": repete
--    no máximo o que chegou naquele exato instante — inofensivo, porque a
--    mesclagem no celular é idempotente — e garante que nada no limite escapa.
--
--    Por que a trava: sem ela, um envio que começou antes e só terminou
--    depois da puxada poderia ficar com recebido_em MENOR que o
--    servidor_agora entregue, e nunca mais seria puxado pelo outro celular.
--    Com a trava, a puxada espera envios em andamento terminarem e lê o
--    relógio só depois; envios que começarem depois leem o relógio depois
--    dela. Assim todo registro tem recebido_em maior que o servidor_agora
--    de uma puxada que não o viu.
-- ---------------------------------------------------------------------
create or replace function public.gc_puxar(
  p_codigo    text,
  p_desde     timestamptz default null,
  p_depois_id text        default null,
  p_limite    integer     default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash      text := public.gc_hash(p_codigo);
  v_limite    integer := least(greatest(coalesce(p_limite, 1000), 1), 1000);
  v_agora     timestamptz;
  v_lista     jsonb;
  v_tem_mais  boolean;
  v_ult_rec   timestamptz;
  v_ult_id    text;
begin
  if v_hash is null or not exists (select 1 from public.gc_casais where codigo_hash = v_hash) then
    raise exception 'codigo_invalido';
  end if;

  -- trava compartilhada: espera envios deste casal em andamento terminarem
  perform pg_advisory_xact_lock_shared(hashtextextended('gc:' || v_hash, 0));
  v_agora := clock_timestamp();

  with filtrado as (
    select r.id, r.dados, r.recebido_em
      from public.gc_registros r
     where r.codigo_hash = v_hash
       and (   p_desde is null
            or (p_depois_id is null     and r.recebido_em >= p_desde)
            or (p_depois_id is not null and (r.recebido_em > p_desde
                                             or (r.recebido_em = p_desde and r.id > p_depois_id))))
     order by r.recebido_em, r.id
     limit v_limite + 1          -- um a mais só para saber se "tem mais"
  ),
  numerado as (
    select f.*, row_number() over (order by f.recebido_em, f.id) as n from filtrado f
  )
  select coalesce(jsonb_agg(dados order by n) filter (where n <= v_limite), '[]'::jsonb),
         count(*) > v_limite,
         (array_agg(recebido_em order by n desc) filter (where n <= v_limite))[1],
         (array_agg(id          order by n desc) filter (where n <= v_limite))[1]
    into v_lista, v_tem_mais, v_ult_rec, v_ult_id
    from numerado;

  return jsonb_build_object(
    'servidor_agora', v_agora,
    'registros', v_lista,
    'tem_mais', coalesce(v_tem_mais, false),
    'cursor', case when v_ult_id is null then null
                   else jsonb_build_object('recebido_em', v_ult_rec, 'id', v_ult_id) end
  );
end
$$;


-- ---------------------------------------------------------------------
-- 9) Quem pode chamar o quê.
--    Por padrão o Postgres (e o Supabase) deixa todo mundo executar funções.
--    Retiramos de todos e devolvemos SÓ as 4 funções do app para "anon"
--    (a chave pública que vai no config.js). A gc_hash fica só interna.
-- ---------------------------------------------------------------------
revoke all on function public.gc_hash(text)                               from public;
revoke all on function public.gc_criar(text)                              from public;
revoke all on function public.gc_existe(text)                             from public;
revoke all on function public.gc_enviar(text, jsonb)                      from public;
revoke all on function public.gc_puxar(text, timestamptz, text, integer)  from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on function public.gc_hash(text) from %I', papel);
      execute format('revoke all on function public.gc_criar(text) from %I', papel);
      execute format('revoke all on function public.gc_existe(text) from %I', papel);
      execute format('revoke all on function public.gc_enviar(text, jsonb) from %I', papel);
      execute format('revoke all on function public.gc_puxar(text, timestamptz, text, integer) from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.gc_criar(text)                             to anon;
    grant execute on function public.gc_existe(text)                            to anon;
    grant execute on function public.gc_enviar(text, jsonb)                     to anon;
    grant execute on function public.gc_puxar(text, timestamptz, text, integer) to anon;
  end if;
end
$$;

-- Fim. Depois de rodar, copie "Project URL" e a chave "anon"/"publishable"
-- (Project Settings > API) para o config.js.
