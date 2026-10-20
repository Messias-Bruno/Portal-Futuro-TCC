/* Portal Futuro · configuração do servidor (Supabase)
   A chave abaixo é a chave PÚBLICA ("publishable"), feita para ficar no site.
   Quem protege os dados são as regras de segurança (RLS) do banco.
   Com supabaseKey vazio, o portal funciona só no navegador (modo antigo). */
window.PF_CONFIG = {
  supabaseUrl: "https://baubfjqwrdyeqarmjjio.supabase.co",
  supabaseKey: "sb_publishable_G_OyvQyWFSWfrLeO7cezYQ_RYkr0mHX",
  // Mude para true depois de ligar o login com Google no painel do Supabase
  google: false
};
