# Portal Futuro

Guia de estudos, carreira e vida adulta para jovens de Campinas, Sumaré e região, com ferramentas de finanças, provas, agenda, calendário ao vivo e guia do campus.

© 2026 Bruno Henrique Messias de Sousa. Todos os direitos reservados.

## Como abrir

Dê dois cliques em `index.html`. Ele abre em qualquer navegador e não precisa de instalação nem de servidor.

## Visual e animações

- Abertura com vídeo em tela cheia, navegação de vidro e títulos em Instrument Serif (corpo em Inter), sobre azul-marinho.
- Cada página interna abre com o mesmo vídeo no cabeçalho. Se o vídeo não carregar, o site mostra a ilustração da biblioteca no lugar.
- Animações em JavaScript puro, sem bibliotecas: palavras que giram e títulos que surgem palavra por palavra, texto que se acende com a rolagem, capítulos empilhados, linha do tempo que se desenha, cursor com anel, luz que segue o mouse, botão elástico, letras embaralhadas, odômetro, barras de salário com reordenação animada, anel de progresso, confete e transição entre páginas.
- Modo claro e escuro: o site segue o aparelho (claro de dia para quem usa o modo automático) e tem um botão de sol/lua no topo. A escolha fica salva no navegador. As faixas com vídeo continuam escuras nos dois modos.
- Cada página tem uma figura sobre o assunto ao lado do título, como o cofrinho em Finanças e o lápis em Provas.
- Campus: campus-modelo em 3D (three.js) inspirado nos campi da região, com 16 áreas clicáveis, giro, zoom, filtros, tela ampliada, áreas favoritas, roteiro da primeira semana e perguntas rápidas. Sem WebGL, a lista de áreas continua funcionando.
- Documentos: cada documento que pode ser feito on-line tem o link para o site oficial.
- Tela de entrada (pré-login): abas "Entrar" e "Criar conta", "Esqueci minha senha", conta de demonstração (demo@portalfuturo.app / Demo2026!), menu da conta e botão "Sair".
- **Contas de verdade (Supabase):** com `assets/js/config.js` preenchido, o login, o cadastro (com confirmação por e-mail), a recuperação de senha e o login com Google passam pelo Supabase, e o perfil e os dados das ferramentas ficam guardados na nuvem. O aluno acessa de qualquer aparelho. O site fala direto com a API do Supabase, sem biblioteca externa. A senha é conferida e guardada pelo Supabase (bcrypt) e nunca fica salva no aparelho. Os dados são salvos na nuvem quase na hora (800 ms depois de cada mudança), com uma cópia no aparelho enquanto a pessoa está conectada; o que for mudado sem internet sobe quando a conexão volta. Ao sair, a cópia do aparelho é apagada. A conta de demonstração continua só no navegador.
- **Sem servidor (modo antigo):** com `supabaseKey` vazio em `config.js`, tudo volta a ficar só no navegador, com a senha guardada como hash PBKDF2-SHA-256 (120 mil iterações) e bloqueio de 30 segundos depois de 5 tentativas erradas.
- Perfil: ao clicar no nome, no topo, abre a página do perfil, com resumo das ferramentas, perfil completo (nome, instituição, cidade, curso e áreas de interesse), troca de senha (pede a senha atual e tem o mesmo bloqueio de 5 tentativas do login), dados da sessão, cópia dos dados em arquivo (sem a senha) e opção de apagar a conta (pede a senha).
- Ônibus: 30 linhas municipais e metropolitanas, com trajeto, planejador de origem e destino (direto ou com uma troca), busca, filtros e "Minhas linhas" salvas no navegador. Os dados ficam em `LINES` dentro de `assets/js/app.js`.
- Meu bairro: cerca de 190 bairros, condomínios e conjuntos habitacionais de Campinas, Sumaré, Hortolândia, Paulínia, Valinhos e Vinhedo, com as linhas que passam em cada um. Os dados ficam em `BAIRROS`, em `assets/js/app.js`, tirados das paradas listadas no BusInfo (linhas EMTU) e no Cittamobi (linhas da Emdec) em outubro de 2026.
- Campus 3D: cada estrutura tem detalhes próprios (colunata da biblioteca, heliponto do hospital, pórtico da portaria, ônibus, carros, fonte da praça, ipês). No tema escuro, as janelas acendem como à noite.
- Quem ativa "reduzir movimento" no sistema vê o site sem animações e sem o vídeo rodando.
- O vídeo da abertura (de autoria própria) fica em `assets/video/abertura.mp4`. Se esse arquivo não existir, o site usa como reserva o endereço antigo em `d8j0ntlcm91z4.cloudfront.net` (lista `VIDEO_SRCS` em `assets/js/app.js`).

## Banco de dados (Supabase)

- E-mails do login: enviados pelo Gmail `portalfuturo.app@gmail.com` (SMTP do Supabase, até 30 por hora). Modelos em português em `supabase/emails`.
- Política de privacidade: no `index.html` (janela `privDialog`). Ao mudar o texto, atualize a data e o `privacy_version` em `assets/js/app.js`.

- Projeto: **Portal Futuro** (`baubfjqwrdyeqarmjjio`), plano gratuito.
- Estrutura em `supabase/schema.sql`: tabelas `profiles` (nome, instituição, cidade, curso, áreas) e `user_data` (provas, gastos, agenda, documentos e favoritos, em JSON, até 512 KB por aluno).
- Segurança por linha (RLS): cada aluno só lê e altera as próprias linhas. Visitantes sem login não acessam nada. O perfil é criado pelo servidor quando a conta nasce, e a conta só pode ser apagada pela função `delete_my_account`, que apaga junto o perfil e os dados.
- A chave em `config.js` é a chave **pública** (publishable), feita para ficar no site. Nunca coloque a chave secreta (service_role) no site.
- Função de apagar a conta: `supabase/apagar-conta.sql` (rodar uma vez no SQL Editor).
- No painel do Supabase (Authentication → URL Configuration), o endereço do site publicado precisa estar em **Site URL** e em **Redirect URLs**, para os links de confirmação, de nova senha e do Google voltarem para o site.

## Estrutura

```
portal-futuro/
├── index.html            Páginas, textos e ilustrações
├── assets/css/style.css  Visual: cores, fontes e layout (claro e escuro)
├── assets/img/favicon.svg  Ícone da aba (livro aberto)
├── assets/vendor/three-r128.min.js  Biblioteca 3D (three.js, licença MIT) usada no campus
├── assets/js/config.js   Endereço e chave pública do Supabase
├── assets/js/app.js      Navegação, login, sincronização, calendário, finanças, provas, agenda e salários
└── supabase/schema.sql   Estrutura e regras de segurança do banco
```

## Publicar no Netlify

Endereço: **https://portal-futuro.netlify.app** (projeto `portal-futuro` no Netlify). Para publicar à mão: no painel do Netlify, abra o projeto → **Deploys** → arraste o arquivo `portal-futuro-netlify.zip` (ou a pasta com `index.html`, `assets` e `_headers`).

O arquivo `netlify.toml` já configura a publicação e os cabeçalhos de segurança (impede abrir o site dentro de outro site, bloqueia scripts de fora, entre outros). Basta publicar a pasta do projeto inteira.

## Publicar de graça no GitHub Pages

1. Crie um repositório no GitHub e envie o conteúdo desta pasta.
2. Em **Settings → Pages**, escolha a branch `main` e a pasta raiz.
3. Em poucos minutos o site fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Segurança

- Os dados que o estudante cadastra ficam só no navegador dele (localStorage). Nada é enviado para servidores.
- Cada conta tem os próprios dados (chave `portalFuturo.v1.<id da conta>`). Quem entra com outra conta no mesmo computador não vê as provas, os gastos nem a agenda da anterior. Sem ninguém conectado, o portal fica vazio. Ao apagar a conta, os dados dela também são apagados.
- O tema claro ou escuro é uma preferência do aparelho (`portalFuturo.theme`), igual para todas as contas.
- Todo texto digitado é inserido na página de forma segura (sem `innerHTML`), o que evita injeção de código.
- Os dados salvos são validados ao carregar, com limites de tamanho e quantidade.
- A planilha CSV é protegida contra fórmulas maliciosas.
- O `index.html` tem uma política de segurança de conteúdo (CSP) que só permite scripts do próprio site, fontes do Google Fonts, o vídeo da abertura e conexões com o Supabase do projeto. Ao hospedar, vale configurar no servidor o cabeçalho `X-Frame-Options: DENY` para impedir que o site seja aberto dentro de outro site.

## Atualizar informações

As datas fixas (Unicamp, ENEM e feriados) e as faixas salariais ficam no início das seções correspondentes em `assets/js/app.js` (busque por `UNICAMP`, `OFICIAIS`, `FERIADOS` e `SALARIOS`). Confirme sempre nos sites oficiais antes de atualizar.

## Histórico de versões

- **v1.9 (20/10/2026):** nome completo do autor (Bruno Henrique Messias de Sousa) no rodapé, na tela de entrada, na política de privacidade e nos créditos; publicação automática pelo GitHub (repositório Portal-Futuro-TCC) no Netlify.
- **v1.8 (20/10/2026):** política de privacidade (LGPD) em uma janela que abre no cadastro, no rodapé e no perfil, com o aceite registrado na conta; conta nova começa vazia (os exemplos ficam só na conta de demonstração); e-mails de confirmação e de nova senha em português (`supabase/emails`), enviados pelo Gmail do portal.
- **v1.7 (20/10/2026):** login de verdade ligado (Supabase) para o endereço https://portal-futuro.netlify.app; arquivo `_headers` com os cabeçalhos de segurança para publicar arrastando a pasta no Netlify.
- **v1.6 (20/10/2026):** tabelas e regras de segurança criadas no Supabase e testadas (um aluno não lê nem altera os dados de outro; visitantes sem login não acessam nada); na tela de entrada, no computador, só o painel do formulário rola e a arte da esquerda fica parada; `netlify.toml` com os cabeçalhos de segurança para a publicação.
- **v1.5 (20/10/2026):** contas de verdade com Supabase (cadastro com confirmação por e-mail, login, "esqueci minha senha", login com Google pronto para ligar, perfil e dados das ferramentas na nuvem, troca de senha e exclusão da conta no servidor); estrutura do banco em `supabase/schema.sql`.
- **v1.4 (20/10/2026):** provas, gastos, agenda, documentos e favoritos passam a ser separados por conta (antes, contas no mesmo navegador viam os dados umas das outras); dados da versão antiga passam para a conta só se ela for a única do navegador; apagar a conta apaga também os dados dela; a página Finanças não rola mais para o lado no celular.
- **v1.3 (20/10/2026):** nova página de perfil; a saudação do início mostra só o nome ("Olá, Bruno. Bom te ver por aqui."); o contador do início volta a mostrar o espaço em "0 de 10".
- **v1.2 (20/10/2026):** a tela de login usa o cursor normal do sistema; o cursor animado aparece no resto do site, depois de entrar.
- **v1.1 (20/10/2026):** o cursor personalizado não some mais na tela de login; o topo não fica mais apertado em telas de notebook (o botão "Começar jornada" some abaixo de 1480 px de largura e nada quebra em duas linhas); o vídeo passa a ser lido de `assets/video/abertura.mp4`, com o endereço antigo como reserva; os textos de "Criar conta" deixam claro que a conta fica salva só no navegador.
- **v1.0 (19/10/2026):** projeto reaberto, sem alterações.
