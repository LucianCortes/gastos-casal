/*
 * config.js — TUDO que se troca sem mexer no sistema fica aqui.
 *
 * Gastos do Casal · versão do formato dos dados: 1
 *
 * 1) Nuvem (Supabase)
 *    supabaseUrl  = endereço do projeto (Supabase > Project Settings > API > Project URL)
 *    supabaseChave = chave pública "anon" / "publishable" (mesma tela).
 *    Essa chave é PÚBLICA por natureza: ela só deixa chamar as funções gc_*,
 *    e as funções exigem o código do casal. Nunca colocar aqui a chave "service_role".
 *    Enquanto estiverem vazias, o app funciona só no aparelho (sem compartilhar).
 *
 * 2) Valores iniciais
 *    Usados UMA vez, quando o casal é criado. Depois disso, tudo é editado
 *    pela tela Config do app, e o que vale é o que está salvo nos dados.
 */
window.CONFIG = {
  nomeApp: "Gastos do Casal",

  supabaseUrl: "https://puldbvugtbblvazsdwhi.supabase.co",
  supabaseChave: "sb_publishable_86-JUWiIbdpD_vtqQ_p1tA_UhAfV2py",

  // segundos entre cada conferência automática com a nuvem, com a tela aberta
  intervaloSincronizacao: 20,

  categoriasIniciais: ["Mercado", "Combustível", "Casa", "Escola", "Farmácia", "Lazer", "Outros"],
  meiosIniciais: ["Pix", "Dinheiro", "Débito"]
};
