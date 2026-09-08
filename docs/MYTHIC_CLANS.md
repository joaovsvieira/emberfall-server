# Emberfall 0.9 — regras e continuidade

## Capítulos por herói

A fonte de verdade é `hero_progress.unlocked_chapter`, por `(account_id, hero)`. Vitória solo/PvE libera o próximo apenas para os heróis elegíveis da partida. O rodapé usa o capítulo mais avançado liberado do herói escolhido, independentemente do mapa selecionado. `accounts.unlocked_chapter` permanece apenas como legado, não usar para novas telas/autorizações. Admin agora mostra capítulos por herói.

Migração 0004 recupera vitórias identificadas em `matches`/`match_players`. Contas anteriores ao histórico, sem vitórias atribuíveis, preservam o avanço legado somente no herói padrão. Não é possível reconstruir qual personagem jogou antes de esse dado existir. Outros heróis começam no capítulo I.

O criador de qualquer sala precisa liberar o mapa com seu herói. Convidados PvE também; convidados PvP podem jogar um mapa bloqueado. Identidade do criador é autenticada e registrada antes da entrada de convidados. PvP não concede XP, gold, cristais, itens, capítulos ou chaves: somente histórico e ranking de abates reais.

## Mítica+

Chave exclusiva por `(account_id, hero, chapter, week)`. Concluir cada capítulo normal concede sua chave +2, no máximo uma concessão por semana. Vitórias normais repetidas não substituem chaves ativas/melhoradas/quebradas. Registro de chave quebrada é mantido para impedir refarm.

Semana vira segunda 00:00 Brasília (UTC−3), mesma `weekStart()` do ranking. Não há exclusão de histórico nem cron: consultas filtram a semana atual. Na nova semana, completar normal novamente concede +2. Mítica+ não concede novas chaves normais.

Solo agora abre lobby: seleção opcional, pronto e iniciar. Coop inicia com 2–4, todos prontos; grupo já iniciado pode continuar com os restantes. **Somente o anfitrião ativa sua própria chave**, daquele herói/capítulo. Mudar seleção remove o pronto de todos. Convidados mantêm suas chaves. Uma operação condicional atômica impede duas salas de usar a mesma chave.

Relógio real inicia após a contagem regressiva de três segundos e continua durante pausas/reconexão. Esgotar tempo, perder ou abandonar definitivamente quebra a chave. Se o dono saiu e a equipe ganhou, os restantes recebem a conclusão, mas a chave dele quebra. Reiniciar/continuar PvE retorna ao lobby com modo normal selecionado; revanche PvP mantém fluxo direto e placar.

### Balanceamento central em `server/mythic.mjs`

| Capítulo | Limite | +2 por tempo | +1 por tempo |
|---|---:|---:|---:|
| I | 8:00 | até 4:48 | até 6:24 |
| II | 10:00 | até 6:00 | até 8:00 |
| III | 12:00 | até 7:12 | até 9:36 |

Faixas exclusivas: até 60% concede +2; acima de 60% até 80%, +1; acima de 80% mas antes do limite, +0. Matar 95% dos inimigos comuns, excluindo chefe, acrescenta +1; requisito `ceil(total × .95)`. Chefe obrigatório para concluir. Resultado **+0 a +3**: +0 mantém a chave, conforme terminar dentro do limite sem objetivos extras. No limite exato já é falha.

Vida inimiga × `1.12^nível`, além da escala existente por grupo. Dano hostil × `1.08^nível`, antes da defesa/escudo; perigos e quedas PvE também seguem a escala. Teto inicial +100. HUD mostra timer, forças e bônus; modal mostra resultado. Ranking Mítico usa tempo real, incluindo pausas, separa Normal/Mítica+ e prioriza maior chave, depois menor tempo, por fase/composição de equipe.

XP, gold e loot continuam nas tabelas normais do capítulo: afixos e recompensas escalonadas ainda não foram definidos. Falha não dá loot de conclusão, mas mantém XP ganha em mortes confirmadas.

### Interrupção e idempotência

`key-activate` associa uma execução única; `key-resolve` altera nível/status uma vez. Recompensas mantêm recibos idempotentes e erro de gravação bloqueia avanço até repetir. Chave ativada antes de encerramento do processo fica consumida, sem reuso; pode permanecer internamente `active` até a virada semanal. Não existe restauração de simulação após reinício do servidor. Próximo passo para recuperação de partidas é um registro durável de execução/prazo e checkpoints. Evitar deploy durante partidas importantes.

## Clãs

Clã pertence à conta. Criação custa 1.000 gold, com débito/criação/associação atômicos. Nome único sem distinguir maiúsculas, 3–32 letras, números, espaços, `_` ou `-`. Sem clã: diretório pesquisável/paginado, aplicar, aceitar convite. Com clã: membros, presença, chat, sair.

Cargos atuais: `admin` e `member`; fundador identificado por `clans.owner`. Delegar moderação usa **Tornar admin**, sem inventar um terceiro rank. Admin aprova/recusa pedidos, convida e remove membros. Só fundador promove/rebaixa admins, remove outros admins e exclui clã. Fundador não pode ser expulso. Excluir remove membros, pedidos e mensagens, sem reembolso.

Chat no widget e na página exige associação em cada leitura/envio; mensagens têm `clan_id` e não aparecem no global. Removidos perdem acesso na próxima consulta. Mesmos limites de tamanho/frequência do chat existente; dados escapados na interface.

Baú é apenas **prévia visual**: Geral, Equipamentos e Tesouros, sem depósito/retirada real. Cargos customizados/permissões desabilitados. Evoluir com tabelas `clan_roles`, `clan_role_permissions`, `clan_bank_tabs`, ledger de movimentos e validação por capacidade no servidor, migrando os dois cargos atuais. Visibilidade de botão não concede autorização.

## Mercado e loja

Mercado continua em gold; recibos `sales` são exibidos somente a comprador/vendedor, com contraparte, valor, item, data, filtro e páginas de 20. Cancelar anúncio não cria transação. Não excluir fisicamente itens sem preservar catálogo nos recibos históricos.

Cristais são `accounts.gems`, separados do gold. Pedidos em `payment_orders`. [PIX_SETUP.md](PIX_SETUP.md) documenta ativação no Render, confirmação, limite de R$ 0,01 ainda não confirmado e ausência de teste bancário real.

## Pontos de extensão

- `server/catalog.mjs`: XP, níveis, gold, catálogo, slots, atributos, drops.
- `server/mythic.mjs`: tempos/escala/objetivos.
- `server/payments.mjs`: produto e Mercado Pago Payments. Segredos somente no Render.
- `worker/game-data.mjs`: perfil, recibos, chat, rankings.
- `worker/expansion-data.mjs`: chaves, clãs, pedidos e histórico do mercado.
- `src/expansion.ts`: Loja, Clã, transações; `src/hub.ts`: capítulos do herói.
- `db/schema.ts` e migração 0004: esquema e migração histórica. Não reescrever após publicar; usar batches condicionais, sem triggers SQL no pipeline D1.

Publicar Worker/migração antes do GitHub/Render e compilar `dist`, que é rastreado. Antes de alto volume: paginar inventários/membros, indexar por métricas, definir retenção de mensagens, persistir execuções e reconciliação periódica de pagamentos. Recibos e identidades atuais permitem evolução sem confiar no navegador.
