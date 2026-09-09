# Emberfall 0.11 — A jornada do eclipse

Este documento substitui regras conflitantes das notas 0.10 e anteriores. Mantém arquitetura, IDs persistentes e deploy Worker/D1 antes do Render.

## Consumíveis e atalhos

Atalhos 1–5 continuam vinculados a catálogo e herói. Vincular reserva a pilha inteira disponível; a mochila a oculta por `hotbar=1`, calculado no perfil a partir de `hero_hotbar`. Remover o último vínculo devolve as unidades restantes. O mesmo tipo em dois slots compartilha estoque e cooldown. Novas unidades abastecem a vinculação existente. Unidades já anunciadas permanecem reservadas ao anúncio e não podem ser consumidas.

O backend impede anunciar ou depositar no clã unidades de um tipo vinculado. Para vender, primeiro retire-o da barra e escolha quantidade/preço total na mochila. Reservas e consumos continuam validados dentro das consultas atômicas, com IDs por unidade. A representação não concede itens novos nem altera a propriedade.

## Baú semanal

Durante a semana W (segunda 00:00 America/Sao_Paulo), a elegibilidade consulta exclusivamente chaves da semana W−7 dias. Escolhe a maior chave válida do herói e, no empate, capítulo mais alto. Chaves disponíveis da semana atual não interferem. Chaves quebradas ou ativas não dão baú; preserva a regra anterior de invalidação por quebra. O resgate não consome a chave arquivada.

`weeklyKeys` expõe candidatas da semana anterior; `weeklySourceWeek` identifica o período. `weekly_claims.week` continua sendo a semana de coleta, única por conta/herói/semana. Sem acúmulo de períodos antigos. Claims antigos são respeitados: quem já resgatou nesta semana não recebe um segundo item após esta atualização. Chaves iniciadas antes da virada e ainda em andamento só ficam disponíveis após resolução bem-sucedida; um resgate já realizado não é reaberto.

## Movimento

S em uma plataforma suspensa ativa `Player.dropping`, que ignora colisão com plataformas intermediárias até tocar chão sólido. Não atravessa chão. Abismos continuam causando dano e retorno ao checkpoint. `Input.down` passa por validação, envio ao servidor e predição; menus, pausa e campos de edição não capturam a tecla. Nenhuma posição ou autorização de colisão é aceita do cliente.

## Capítulos IV–VI

| ID | Destino | Chefe | Vida base do chefe | Gold normal | Tempo Mítica+ |
| --- | --- | --- | ---: | ---: | ---: |
| 4 | Império das Dunas | Akharet, Rei Sepulto | 1.392 | 380 | 14 min |
| 5 | Palácio Abissal | Nhal, Devorador das Marés | 1.848 | 540 | 16 min |
| 6 | Coroa do Firmamento | Asterion, Titã da Tempestade | 2.400 | 750 | 18 min |

Deserto: escorpião de pedra, escaravelho solar, sacerdote das areias e faraó. Fundo do mar: guardião de coral, arraia abissal, sirena e leviatã. Céu: cavaleiro da tempestade, harpia, vidente e titã alado. Sprites e backgrounds originais, com animação de corrida, ataque/sinalização, flutuação, impactos e partículas existentes. Padrões de combate usam os arquétipos compartilhados (terrestre, voador, conjurador e chefe), com vida, dano e população crescentes. O capítulo submerso mantém física de plataforma; não introduz natação ou oxigênio.

Cada herói libera o capítulo seguinte por vitória solo/PvE, recebe equipamentos da faixa correspondente, XP, gold e sua chave individual. PvP continua sem loot/XP/gold/progresso e convidados podem entrar em mapa bloqueado. Ranking, busca de salas, histórico e continuação aceitam os seis capítulos. Apenas VI encerra a campanha. Migração 0007 libera IV para heróis com vitória solo/PvE registrada em III; não libera por conta nem por vitórias PvP.

Para adicionar capítulo: atualizar CHAPTERS/CHAPTER_COUNT/ChapterId/SPECIES em src/engine.ts; CHAPTER_IDS, temas, faixas de item, mobXp, chapterXp/chapterGold em server/catalog.mjs; limites em server/mythic.mjs; artes/preload/quadros e apresentação em src/game.ts; cartas e filtros em dist/index.html. O endpoint legado de conclusão em worker/index.mjs deve aceitar o novo limite. IDs existentes não devem ser renomeados.

## Nyxar — Bruxo do eclipse

Disponível a todas as contas, começando no capítulo I com inventário/XP/chaves próprios. Paleta violeta, túnica e magia do vazio; forma demoníaca com chifres e garras preserva a identidade visual.

| Ação | Regra |
| --- | --- |
| Clique — Dardo do vazio | À distância, 23 dano PvE / 12 PvP, intervalo 0,45 s |
| Q — Ruptura abissal | Projétil perfurante, 54 dano PvE / 25 PvP, recarga 8 s |
| E — Metamorfose | Forma demoníaca por 15 s de simulação; recarga 40 s a partir da ativação |
| Clique transformado | Corpo a corpo, 36 dano PvE / 18 PvP, intervalo 0,40 s |

Bônus de dano/velocidade do equipamento continuam aplicados. Não há cura gratuita nem modificação permanente de atributos ao transformar. Pausa congela o efeito como outras habilidades; renascimento/reinício encerra a forma. `demonTime` é autoritativo, trafega em snapshots e reconcilia a predição; adversários veem a transformação e o HUD mostra o tempo restante. Q permanece disponível nas duas formas. Recortes usam coordenadas explícitas para preservar chifres, garras e efeitos.

## Poder do herói

Calculado no servidor por `heroPower(stats)` (fórmula v1):

`round(10 × sqrt(damage × attackSpeed/100 × maxHp × (1 + defense/100)) × (speed/100)^0.25)`

Stats permanentes já incluem nível, itens equipados e qualidade mítica. Base sem itens no nível 1: 1.000. Skins, títulos, poções, escudos e transformação temporária não alteram o poder. Trata-se de estimativa de equipamento/atributos, não previsão exata de habilidade do jogador nem equivalência competitiva entre classes. Perfil fornece `hero.power`; lobby calcula a partir dos mesmos stats que serão aplicados à partida. Não aceita poder enviado pelo cliente.

## Assets e validação

Artes: dist/assets/desert.png, abyss.png, sky.png, nyxar.png e new-enemies.png. Prompts originais em eclipse-art-prompts.json; geração pelo imagegen integrado. A extração no jogo preserva transparência e usa retângulos específicos por pose. O alinhamento vertical dos novos backgrounds considera a linha de piso pintada.

Testes novos em tests/eclipse.test.mjs cobrem reservas/retorno de pilhas, mercado, semana anterior, isolamento, descida, Nyxar/PvP/cooldowns, travessia IV–VI, XP/loot/progresso, poder e migração. Testes existentes de autenticação/controles/campanha foram atualizados para cinco heróis e seis capítulos. Testes de interface usam fachada de cena; não houve teste de navegador. Inventários ainda carregam completos, como documentado em ADVENTURE_SYSTEMS.md. O filtro de catálogo do mercado usa json_each com um parâmetro para evitar ultrapassar o limite de parâmetros D1 com o catálogo expandido.
