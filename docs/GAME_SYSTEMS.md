# Emberfall 0.8 — progressão, comunidade e economia

## Regras de produto

- Login e restauração por F5 abrem no **Mapa**. Atualizações de dados em segundo plano preservam a aba atual.
- XP, nível, inventário e equipamentos pertencem a `(conta, herói)`. Gold pertence à conta. Não existe transferência direta entre heróis.
- Cada capítulo concede XP pelas mortes de inimigos simuladas no servidor. Todos os participantes elegíveis recebem a XP; suporte e jogadores caídos também participam. Quem sai deixa de receber novas mortes e não recebe o prêmio de conclusão.
- Concluir um capítulo concede **gold + um equipamento por jogador**, sem disputa de loot. O sorteio inclui classes diferentes: um item de outra classe fica no inventário do herói utilizado e pode ser vendido, mas não equipado por ele nem transferido diretamente a outro herói da conta.
- O resultado abre um modal. Próximo capítulo e reinício são decisões do anfitrião; participantes podem sair. A passagem seguinte exige gravação concluída. No último capítulo ficam reiniciar e sair.
- Equipamentos não são equipados automaticamente. Slots: cabeça, armadura, arma, luvas, botas, acessório. Um por slot. Itens anunciados ficam reservados e não podem ser equipados.
- Compra usa gold da conta. O comprador escolhe o herói destinatário. A classe e o nível mínimo ainda precisam coincidir para equipar. Não é permitido comprar o próprio anúncio. Venda sem taxa nesta versão.
- Amizade exige solicitação e aceite. Pesquisa por nome de usuário, mínimo de 3 caracteres. Solicitações pendentes e amizades existentes não exibem novo botão de adicionar.
- Chat global e conversas privadas entre amigos são persistentes. Remover amizade bloqueia leitura/envio privado até restabelecer a amizade. Guilda é uma aba informativa indisponível até existir associação real a guildas.
- Presença usa heartbeat por sessão de navegador a cada 25 segundos e expira após 75 segundos. Logout revoga a presença daquela sessão imediatamente. Outra sessão válida pode manter o jogador online. Amigos e chat são atualizados a cada 5 segundos enquanto o widget está aberto.
- Histórico guarda solo, equipe e PvP, com filtro de modo e páginas de 20, mais recentes primeiro. Partidas encerradas por saída recebem resultado `left`; partidas interrompidas por queda definitiva do processo antes da gravação não são inventadas como concluídas.

## Balanceamento: um ponto de edição

O arquivo `server/catalog.mjs` contém os IDs de heróis, slots, catálogo e fórmulas compartilhadas entre o serviço de dados e o servidor de partidas. **Execute o build e publique Worker + Render quando alterar esse arquivo.**

### XP

`BALANCE.mobXp`: goblin 20, morcego 12, espectro 32, chefe 150. Multiplicadores de capítulo: I = 1, II = 1,7, III = 2,6. XP final arredondada. Para novo inimigo, adicione seu `kind` explicitamente na tabela; desconhecidos usam a base de goblin como fallback.

XP do próximo nível: `round(100 × 1.18^(nível−1))`. Nível máximo: 100. A coluna persistida é a XP total acumulada; `progression()` calcula nível, progresso atual e requisito. Mudar a curva recalcula níveis de todas as contas; trate isso como mudança de balanceamento e documente a versão.

Gold de conclusão: I = 80, II = 150, III = 250 (`BALANCE.chapterGold`). Sem gold ou item por derrota e sem gold/XP por PvP nesta versão.

### Itens e drops

O catálogo inicial tem 72 equipamentos: 4 classes × 6 slots × 3 patamares. IDs são estáveis, por exemplo `kael_head_1`. `lootPool(chapter)` retorna equipamentos do patamar da fase, com probabilidade uniforme.

Para adicionar um item:

1. Adicione uma definição em `ITEMS` com ID único, `name`, `slot`, `hero`, `tier`, `requiredLevel` e `attributes`.
2. Garanta que `lootPool()` inclua o item na tabela desejada. Para pesos diferentes, altere a seleção central no servidor, nunca no navegador.
3. Adicione uma verificação de definição válida no teste do catálogo e execute os testes.
4. Aumente `BALANCE.version`, registre o balanceamento e publique ambas as partes.

Não remova/renomeie IDs já concedidos. Instâncias persistem `catalog_id`; nomes e atributos vêm do catálogo, portanto uma mudança afeta também itens existentes. Para preservar atributos antigos, introduza uma nova revisão/ID antes de criar afixos aleatórios.

### Atributos

Base: vida = `100 + 4 × (nível−1)`, dano = `100 + 2 × (nível−1)` em porcentagem, defesa = 0, movimento = 100%, velocidade de ataque = 100%. Some bônus dos equipamentos válidos e equipados.

- Dano final: `round(dano base do ataque × dano% / 100)`.
- Dano recebido: `max(1, round(dano bruto × 100 / (100 + defesa)))`, antes do escudo.
- Velocidade horizontal: base de 290 × movimento% / 100. Movimento limitado a 150%.
- Recarga do ataque básico decresce proporcionalmente à velocidade de ataque, limitada a 200%. Recargas de Q/E não são modificadas.
- Cura, reanimação e HUD respeitam vida máxima.
- O servidor captura o equipamento ao entrar na sala e atualiza os atributos após salvar cada resultado para a rodada seguinte. Equipar no menu não altera uma luta em andamento. Esses atributos também valem em PvP; equalização competitiva futura deve ser uma regra explícita.

## Ranking semanal

Semana: segunda-feira 00:00 de Brasília (UTC−3). `weekStart()` define o período e todos os modos usam o mesmo cálculo. Não há cron nem exclusão destrutiva: a consulta seleciona a semana atual, e resultados anteriores continuam no histórico.

- Solo: melhor tempo de cada conta **por fase**.
- Equipe: melhor tempo de cada conjunto de contas **por fase**, independentemente da ordem ou anfitrião. Grupos que perderam alguém durante a partida não entram no ranking.
- PvP: soma de abates por nocaute; desistência dá vitória na sala/histórico, mas não inventa abate.
- Até 100 entradas na tela. Empates PvE: conclusão mais antiga, depois ID. PvP: nome de usuário.
- Tempo é o tempo ativo da simulação; pausas coletivas ficam excluídas. O filtro “todas as fases” agrega os melhores registros por fase e mostra a fase em cada linha; não é uma pontuação normalizada entre mapas.

## Persistência e concorrência

D1 é a fonte persistente. `worker/game-data.mjs` aceita somente operações enumeradas por meio do canal interno autenticado. O navegador usa `/api/game/*`, e o Express deriva o ID da conta da sessão HttpOnly. Não existem endpoints públicos de XP, recompensa, vitória, preço calculado ou atributos arbitrários.

`reward_events` é um registro com chave única por sala/rodada/conta/inimigo ou conclusão. Cada recibo tem um marcador `applied`. O mesmo batch insere os recibos, soma somente os ainda não aplicados e marca sua aplicação. Salvar XP durante a fase e reenviar todas as mortes na conclusão é seguro. A conclusão, o loot, o desbloqueio, o histórico e os registros da partida são gravados numa transação `DB.batch`.

Mercado: `listings` reserva um item; índice único parcial impede dois anúncios ativos. O batch de compra cria um recibo em `sales` por INSERT condicional, verificando disponibilidade, propriedade, vendedor diferente do comprador e saldo. Débito, crédito, transferência e encerramento dependem da existência desse recibo e ocorrem na mesma transação. O preço utilizado é o persistido no anúncio. Falhas desfazem tudo. Vender e equipar também repetem condições dentro do SQL para resistir a requisições concorrentes.

Índices cobrem inventário/slots, listagens ativas, amizades, chat, ranking e histórico por conta. Busca de itens resolve IDs do catálogo no servidor; nenhum trecho da pesquisa vira SQL. No estado atual o catálogo e os inventários são pequenos e o perfil carrega todo o inventário. Antes de milhares de itens por herói, introduza endpoint paginado de inventário, mantendo `/api/me` resumido.

A simulação e os retries temporários ainda ficam em memória. XP é gravada em intervalos curtos durante a fase; uma queda do processo ou indisponibilidade prolongada de D1 pode perder eventos ainda não confirmados. O modal sinaliza falha e oferece nova tentativa. Antes de economia com dinheiro real, evoluir para registro durável de partidas/checkpoints e fila de recuperação, além de retenção/moderação de chat e observabilidade de transações. Isso não implica que o modelo atual seja multi-região ou tenha capacidade ilimitada.

## Administração

1. Faça login no jogo e abra Configurações; copie o **ID da conta** exibido.
2. No serviço Render, em Environment, adicione `ADMIN_ACCOUNT_IDS` com esse ID. Para várias contas, separe por vírgulas. Salve e aguarde o deploy.
3. Com essa mesma conta autenticada no mesmo domínio, abra `/admin`.
4. O link “Monitor de salas Colyseus” abre `/admin/monitor/`.

`/admin` mostra cadastros, capítulo liberado, herói padrão, gold, IDs e sessões de login válidas. As listagens usam campos explícitos: hashes de senha e de sessão nunca são retornados. O monitor oficial inspeciona salas/clientes e possui ações administrativas. Ambos usam a mesma allowlist de IDs; nenhum usuário é promovido automaticamente por nome, ordem de cadastro ou parâmetro enviado no navegador.

Links no Render:
- https://emberfall-server.onrender.com/admin
- https://emberfall-server.onrender.com/admin/monitor/

O monitor acompanha salas temporárias. D1 guarda contas, progresso e economia. Expansões de admin para inventário/mercado devem adicionar autorização explícita por operação e auditoria antes de permitir alterações. Documentação do monitor: https://docs.colyseus.io/tools/monitoring

## Arquivos e publicação

- `server/catalog.mjs`: definições e balanceamento.
- `worker/game-data.mjs`: operações persistentes e consultas.
- `server/features.mjs`: API autenticada, limite de requisições e admin.
- `server/room.mjs`: eventos autoritativos, XP e fechamento de rodada.
- `src/features.ts`: widgets, inventário, comércio e telas de dados.
- `drizzle/0001_game_systems.sql` e seguintes: migrações aditivas; nunca reescrever depois de aplicadas.
- `tests/systems.test.mjs`: regressão de economia, privacidade, rankings e admin.

Ordem de deploy: **primeiro Sites/Worker + migração D1, depois GitHub/Render**. O Worker novo preserva as operações antigas para a transição. Render serve o frontend compilado de `dist`; portanto `npm run build` e artefatos atualizados são obrigatórios antes do push. Configurar `ADMIN_ACCOUNT_IDS` não exige senha nova nem chave no código.

### Compatibilidade das migrações

O executor de publicação separa SQL por ponto e vírgula e não suporta blocos de triggers. As transações usam `DB.batch` com SQL condicional e recibos de aplicação. A primeira tentativa da migração 0001 foi rejeitada e revertida integralmente antes de qualquer publicação no Render; essa versão foi corrigida antes da aplicação.
