# Emberfall — estado e continuidade

Atualização 0.8: amizades, chat, progressão, inventário, mercado, histórico, rankings e admin. Leia docs/GAME_SYSTEMS.md para regras, configuração e extensão. Leia também README.md e os testes antes de alterar o projeto.

## Identidade e direção

Emberfall — Ecos da Floresta é um jogo original de plataforma 2D e combate inspirado na estrutura de Grand Chase, sem reutilizar seus personagens ou assets. Arte pintada de fantasia, interface em pedra azul-escura com detalhes dourados. Português brasileiro. Reutilize as artes em dist/assets e a simulação compartilhada.

## Estado atual

- Cadastro com usuário de 3–18 letras/números/_ e senha de 8–128 caracteres. Sessão HttpOnly por 30 dias; F5 restaura via /api/me. Não há recuperação de senha por e-mail nesta versão.
- Menu desktop: Loja (desabilitada), Heróis, Histórico, Mapa, Mercado, Ranking, Configurações. Login/F5 sempre abre no mapa.
- Todos possuem Kael (espada), Lyra (fogo), Aurel (suporte dourado) e Sylva (arqueira verde). Preferência do herói fica na conta. XP/nível, equipamentos e inventário são individuais por herói; gold é da conta. Habilidades continuam disponíveis. Itens de outra classe ficam no herói que recebeu e só podem ser vendidos, nunca transferidos diretamente a outro herói.
- Mapa tem floresta, caldeira e cidadela de gelo. Só capítulo I inicia liberado. Vitória PvE/solo libera o seguinte; PvP não libera. Cada participante precisa ter o mapa liberado, inclusive quem entra por convite.
- Solo agora usa uma sala autoritativa para 1 pessoa, inicia automaticamente após autenticar. PvE começa com 2–4, todos prontos; PvP com 2. Cada mapa tem arena PvP sem inimigos ou perigos ambientais.
- A/D/setas movem, W/cima/espaço pulam duas vezes, clique esquerdo ataca, Shift/K esquiva, Q/U e E/I são habilidades. Teclas só afetam a partida ativa. Escape pausa, menu oferece retorno.
- Loja premium permanece desabilitada. Mercado usa somente gold. Configurações: tela cheia, som, ID da conta e desconectar. Não há pagamento real.

## Arquitetura e publicação

- GitHub: https://github.com/joaovsvieira/emberfall-server (main). Render publica automaticamente main.
- Render: https://emberfall-server.onrender.com — Node/Express/Colyseus. Plano Free. Build `npm ci --omit=dev`, start `npm start`, health `/health`.
- Site: https://emberfall-ruinas.joaovsvieira-me.chatgpt.site — Worker como proxy HTTP do jogo e API restrita de dados D1. WebSockets conectam diretamente ao Render.
- .openai/hosting.json identifica o Site e declara o binding D1 `DB`. Não recriar Site nem banco. Usar skills Sites ao editar/publicar. O GitHub não precisa do manifesto privado de hospedagem do Sites.
- server/accounts.mjs executa scrypt, autentica sessões, gera tickets curtos para partidas e controla rotas /api. Senhas e tokens nunca entram no código, armazenamento do navegador ou logs.
- worker/index.mjs expõe /internal/data somente para a chave de serviço. Consultas preparadas e operações limitadas; nenhum endpoint público aceita vitórias ou SQL arbitrário.
- DATA_SERVICE_KEY é segredo compartilhado gerenciado separadamente em Sites e Render; ACCOUNT_DATA_URL no Render aponta ao endpoint de dados do Site. GAME_SERVER_URL no Worker aponta ao Render. Não copiar valores de segredos para documentos ou Git.
- db/schema.ts + Drizzle definem contas, sessões, progresso, recompensas, itens, amizades, chat, histórico, presença e mercado. Migrações em drizzle/ são aplicadas no publish do Sites. Após aplicar, nunca reescrever migrações antigas.
- dist/ é rastreado. Executar `npm run build` antes de publicar alterações em src/ ou worker/. O build também gera dist/server/index.js para Sites; Render bloqueia a rota estática /server.
- Salas e partidas são temporárias; contas/capítulos ficam no D1 e sobrevivem aos deploys. Desbloqueios só são gravados por vitória simulada no servidor; uma falha de gravação aparece no resultado com opção de tentar novamente.

## Verificação e trabalho

Testes cobrem física, combate, 4 clientes WebSocket, PvP, progresso, contas, sessões revogadas, isolamento entre usuários, banco reaberto e bloqueio de mapas. Os testes antigos injetam identidade fictícia somente por dependência em tests/helpers/server.mjs; o servidor publicado sempre usa Accounts.

O usuário prefere implementação autônoma com atualização do GitHub e publicação, mantendo infraestrutura gratuita. Custos novos precisam ser discutidos. Preserve alterações feitas pelo usuário no repositório. Use as artes existentes como referência ao gerar novos assets. Não fazer testes de navegador sem pedido explícito; os testes de interface existentes usam fachadas em Node.

Admin próprio em /admin consulta contas e sessões; monitor oficial @colyseus/monitor em /admin/monitor/. Ambos exigem sessão e ADMIN_ACCOUNT_IDS configurado no Render. Nunca retornar hashes ou promover usuário automaticamente. Consulte docs/GAME_SYSTEMS.md.

## Regras da atualização 0.8

- Modal final obrigatório, loot individual (gold + item), XP por morte confirmada no servidor. Recompensas idempotentes e compra/venda atômicas no D1.
- Ranking semanal: segunda 00:00 Brasília; solo/equipe por tempo e fase, PvP por abates reais. Histórico preservado, paginação 20.
- Amigos com solicitação/aceite e presença por sessão; global e privado persistentes. Aba guilda indisponível até criar guildas.
- Inventário/catalogo ainda carregados inteiros no perfil; paginar antes de grandes volumes. Salas/retries temporários não sobrevivem ao encerramento do processo; veja limitações documentadas.
- Publicar Worker/migração antes do frontend/API no Render. Não reescrever migrações aplicadas.
