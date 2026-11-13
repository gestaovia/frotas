# CliqueObras v4.5.16: duas obras no mesmo dia em horários diferentes e fim do aviso "Há dados novos da nuvem"

Base: v4.5.15 (ZIP de 13/11/2026). **Tem SQL novo**: `supabase/ATUALIZACAO-v4.5.16-RDO-MESMO-DIA-HORARIOS.sql`.

## 1. Mesmo colaborador em duas obras no mesmo dia (RDO)

### Antes
Um colaborador lançado em qualquer RDO ficava preso ao dia inteiro: sumia da lista nos outros RDOs da
mesma data, e o banco recusava a gravação ("já está registrado em outro RDO nesta data").

### Agora
Ele pode estar em dois (ou mais) RDOs na mesma data, em obras diferentes, desde que **os horários de
Entrada e Saída não se sobreponham**.

| Situação no outro RDO do mesmo dia | Resultado |
|---|---|
| 07:00 às 12:00 e este 13:00 às 17:00 | Permitido |
| 07:00 às 12:00 e este 12:00 às 17:00 (encosta) | Permitido |
| 07:00 às 12:00 e este 11:00 às 15:00 | Bloqueado, com o horário do outro RDO na mensagem |
| Virada da noite: 22:00 às 06:00 e este 23:00 às 01:00 | Bloqueado |
| Falta registrada no outro RDO | Bloqueado (a falta ocupa o dia inteiro) |
| Outro RDO sem horário de entrada/saída | Bloqueado (ocupa o dia inteiro) |
| Folga no dia | Bloqueado (sem mudança) |
| Registrar falta aqui para quem trabalhou em outro RDO do dia | Bloqueado |
| Mesmo colaborador duas vezes no mesmo RDO | Bloqueado (sem mudança) |

No formulário (etapa "Equipe e horas"):
- quem já está em outro RDO **em parte do dia** continua na lista, com uma linha: *"Já está em outro
  RDO das 07:00 às 12:00. Pode entrar neste RDO em horário que não se sobreponha."*;
- se o horário digitado sobrepõe, o cartão fica vermelho: *"Horário em conflito: …"*;
- folga, falta ou outro RDO sem horário continuam escondendo o colaborador, como antes.

### Horas normais x hora extra no dia dividido
O limite diário de horas normais (Configurações, jornada) passou a ser **um só para o dia**. O que já
foi lançado como hora normal em outro RDO da mesma data sai do limite deste, e o que passar vira HE 50%.
Exemplo com jornada de 8h: manhã 07:00 às 12:00 = 5h normais; tarde 13:00 às 18:00 = **3h normais +
2h HE 50%**. Isso só acontece quando as horas são recalculadas no formulário (ao selecionar o
colaborador ou mudar entrada/saída). Os campos continuam editáveis, e RDOs já gravados não mudam.

### Onde a regra mora (as três com o mesmo critério)
- Tela e verificação ao salvar: `RDO.entryWindow`, `windowsOverlap`, `slotConflict`,
  `occupationsOn`, `allocationConflicts`, `remoteAllocationConflicts` (`modules/rdo/rdo.js`).
- Consulta da organização inteira: `Cloud.occupiedRdoSlots` → RPC nova
  `clique_obras_rdo_occupied_slots_v4516`. Ela devolve situação, horário e horas normais, **sem o projeto**.
  Se a RPC ainda não existir, o front usa a antiga e trata tudo como dia inteiro (regra anterior).
- Banco: gatilho `zz_cliqueobras_validate_rdo_workforce` (função
  `clique_obras_private.validate_rdo_workforce_reservation`, corpo novo) + auxiliar
  `clique_obras_private.rdo_entry_window_v4516`. O lock por organização, data e colaborador foi mantido.

Não mudou: o gatilho de folga (`validate_workforce_status_v401`), que continua impedindo folga em dia
com qualquer lançamento; o Planejamento de Equipe (Gantt), que trabalha por dia, sem horário, e continua
marcando duas obras no mesmo dia como conflito; e o relatório de Histórico de Alocações, que já mostrava
uma linha por RDO.

## 2. Fim do aviso "Há dados novos da nuvem"
Quando chega mudança de outro usuário/aparelho (ou da carga do Omie), o sistema **atualiza os dados em
segundo plano, mas não redesenha a tela aberta e não mostra aviso**. O que chegou aparece quando a
pessoa:
- recarrega a página (F5 / botão recarregar do navegador);
- abre outra tela do menu;
- faz algo que já redesenha a tela (salvar, filtrar, botão "Sincronizar" em Configurações).

Como os dados de fundo continuam em dia, uma janela de edição aberta depois já usa a informação nova.
O **modo Painel/TV** continua se atualizando sozinho a cada 2 minutos, como antes.

Removido de `js/app.js`: `applyCloudRender`, `showCloudUpdateNotice`, `userIsEditing`,
`watchContentEdits`, `touchesCurrentView`/`viewExtraStores` (só serviam ao redesenho automático).
Removido de `css/components.css`: estilos de `#cloud-update-notice`.

## Arquivos
- `supabase/ATUALIZACAO-v4.5.16-RDO-MESMO-DIA-HORARIOS.sql` (novo)
- `modules/rdo/rdo.js`, `database/cloud.js`, `css/rdo.css`
- `js/app.js`, `css/components.css`
- `index.html`: versão 4.5.16
- Testes: `tests/v4516-rdo-mesmo-dia-horarios.test.mjs` (novo, 9 testes),
  `tests/v4516-cloud-sem-aviso.test.mjs` (novo, 4 testes; substitui `cloud-quiet-render.test.mjs`, que
  testava o aviso removido)

## Verificação
- `node --test tests/*.test.mjs`: 83/87. As 4 falhas são as mesmas de sempre (presas à v4.0.1). Rodei os
  4 arquivos anotando cada verificação que falha (em vez de parar na primeira): a lista é idêntica à do
  ZIP v4.5.15.
- SQL executado num Postgres local (PGlite) com a tabela `app_records`: 15 cenários do gatilho
  (manhã/tarde, encostar, sobrepor, virada da noite, sem horário, falta nos dois sentidos, folga, edição
  do próprio RDO, duplicado no mesmo RDO) e a RPC nova. Todos OK.
- Formulário do RDO num DOM simulado (jsdom): aviso no cartão, cálculo 3h normais + 1h HE, cartão
  vermelho ao sobrepor, colaborador some com folga.

## Publicação
- **Banco: aplicado em 13/11/2026** no projeto `mwelgpjkqljtkzbqxmag` (migration
  `v4516_rdo_mesmo_dia_horarios`).
- Conferido antes de aplicar:
  - **O gatilho `zz_cliqueobras_validate_rdo_workforce` da v4.0 não existia neste projeto.** Até agora a
    única trava contra o mesmo colaborador em dois RDOs do dia era a da tela. O SQL v4.5.16 cria o
    gatilho, já com a regra de horário. (O gatilho de folga da v4.0.1 também não existe aqui. A tela
    continua impedindo folga em dia com lançamento.)
  - Dados: 686 RDOs e 1.741 lançamentos. Nenhum colaborador em dois RDOs no mesmo dia, todos os 1.733
    lançamentos de presença têm horário válido para a regra e nenhum RDO tem formato ou equipe que o
    gatilho recuse. Portanto nenhum RDO existente passa a dar erro ao ser editado ou aprovado.
  - `clique_obras_private.approve_rdo_v401` não compara RDOs do mesmo dia (não precisou mudar).
- Depois de aplicar: gatilho ativo; a RPC nova só pode ser executada por usuário logado
  (`authenticated`); `anon` não tem acesso.
- Ensaio no banco de produção (transação desfeita, nada gravado; conferido depois: 686 RDOs, nenhum
  registro de ensaio): cópia do RDO-2026-0678 (13/11/2026) com um colaborador real que está lá das
  07:00 às 17:00.
  - novo RDO das 18:00 às 22:00 → **gravou**;
  - novo RDO das 16:00 às 20:00 → **recusado**: "já está em outro RDO das 07:00 às 17:00 nesta data…";
  - os 30 RDOs não aprovados, regravados cada um pelo próprio usuário → 30 OK, nenhum recusado.
- **Falta o front:** subir os arquivos do site e, **por último**, o `index.html`. Até lá a tela antiga
  continua mais restritiva (esconde quem já está em qualquer RDO do dia) e o aviso de dados novos
  continua aparecendo.
