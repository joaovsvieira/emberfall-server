Atualização 0.10.1: correção do layout Heróis, pilhas de materiais/poções, venda por quantidade (preço total do lote), progresso e som no craft. Migração 0006. Consulte a seção final de docs/ADVENTURE_SYSTEMS.md.

# Emberfall — estado e continuidade

Atualização 0.10: profissões, poções, correio, baús, conquistas, skins, salas públicas e vidas infinitas. Leia primeiro docs/ADVENTURE_SYSTEMS.md; suas regras substituem as divergentes abaixo.

Anterior 0.9: loja Pix, cristais, Mítica+, capítulos por herói, clãs e histórico do mercado. Leia docs/MYTHIC_CLANS.md e docs/PIX_SETUP.md. Leia docs/GAME_SYSTEMS.md para regras, configuração e extensão. Leia também README.md e os testes antes de alterar o projeto.

## Identidade e direção

Emberfall — Ecos da Floresta é um jogo original de plataforma 2D e combate inspirado na estrutura de Grand Chase, sem reutilizar seus personagens ou assets. Arte pintada de fantasia, interface em pedra azul-escura com detalhes dourados. Português brasileiro. Reutilize as artes em dist/assets e a simulação compartilhada.

## Estado atual

- Cadastro com usuário de 3–18 letras/números/_ e senha de 8–128 caracteres. Sessão HttpOnly por 30 dias; F5 restaura via /api/me. Não há recuperação de senha por e-mail nesta versão.
- Menu desktop: Loja, Profissões, Heróis, Conquistas, Histórico, Mapa, Mercado, Ranking, Clã, Email, Configurações. Login/F5 sempre abre no mapa.
- Todos possuem Kael (espada), Lyra (fogo), Aurel (suporte dourado) e Sylva (arqueira verde). Preferência do herói fica na conta. XP/nível, capítulos, chaves, equipamentos e inventário são individuais por herói; gold é da conta. Habilidades continuam disponíveis. Itens de outra classe ficam no herói que recebeu e só podem ser vendidos, sem transferência direta; podem circular por mercado ou baú compartilhado do clã.
- Mapa tem floresta, caldeira e cidadela de gelo. Só capítulo I inicia liberado. Vitória PvE/solo libera o seguinte; PvP não libera. Desbloqueio é por herói. Criador e convidados PvE precisam liberar o mapa; convidados PvP podem jogar bloqueados. Rodapé usa progresso do herói.
- Solo agora usa uma sala autoritativa para 1 pessoa, abre lobby explícito com chave opcional, pronto e iniciar. PvE começa com 2–4, todos prontos; PvP com 2. Cada mapa tem arena PvP sem inimigos ou perigos ambientais.
- A/D/setas movem, W/cima/espaço pulam duas vezes, clique esquerdo ataca, Shift/K esquiva, Q/U e E/I são habilidades. Teclas só afetam a partida ativa. Escape pausa, menu oferece retorno.
- Loja oferece 10 cristais por R$ 0,01 via Mercado Pago/Pix, aguardando configuração do vendedor. Mercado usa gold e registra compras/vendas. Configurações: tela cheia, som, ID da conta e desconectar. Recebimento real e aceitação de R$ 0,01 dependem de credenciais e validação do vendedor.

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

## Regras persistentes

- Modal final obrigatório, loot individual (gold + item), XP por morte confirmada no servidor. Recompensas idempotentes e compra/venda atômicas no D1.
- Ranking semanal: segunda 00:00 Brasília; solo/equipe por tempo e fase, PvP por abates reais. Histórico preservado, paginação 20.
- Amigos com solicitação/aceite e presença por sessão; global e privado persistentes. Chat do clã disponível; criar custa 1.000 gold, cargos admin/membro, baú funcional com quatro abas e expansão até oito.
- Inventário/catalogo ainda carregados inteiros no perfil; paginar antes de grandes volumes. Salas/retries temporários não sobrevivem ao encerramento do processo; veja limitações documentadas.
- Publicar Worker/migração antes do frontend/API no Render. Não reescrever migrações aplicadas.

## Continuidade 0.9

Mítica+: host ativa a própria chave, por capítulo/herói, +2 inicial, uma concessão semanal; tempo real corre durante pausas. Limites 8/10/12min, bônus até +3. Desde 0.10, quebra permite refarm +2 em uma nova conclusão normal. Filtro Mítica+ no ranking. Migração 0004 recupera capítulos por herói a partir das vitórias históricas, usando o herói padrão apenas para legados sem identidade. Testes adicionais em tests/mythic-shop-clan.test.mjs. Nenhum pagamento bancário real foi realizado.

## Continuidade 0.10

Implementação completa em docs/ADVENTURE_SYSTEMS.md. Dez tabelas novas via 0005. Preservar semântica de recibos atômicos e propriedade do herói. Profissões custam 100 GOLD. Apenas receita de poção de cura menor inicialmente: duas ervas, cura 20%, cooldown 30s, atalhos 1–5. Skins não alteram atributos. Baú semanal usa chave válida atual e não recompensa chave quebrada. Consulte limitações de escala documentadas antes de ampliar inventários, filas ou instâncias.
