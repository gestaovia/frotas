# gestaovia

Gestão visual de frota: posse do veículo por QR Code, checklists com fotos, mapa da frota, calendário de manutenção, CRLV/IPVA, pedágios, multas, premiação de condutores e rastreamento (Traccar).

- **Front-end:** arquivo único `dist/index.html` (HTML + JS, sem build de framework). Fontes em `src/`.
- **Banco, login e arquivos:** Supabase (PostgreSQL com RLS, Auth, Storage e Edge Functions).
- **Hospedagem:** por enquanto o código fica no GitHub; na publicação, basta enviar `dist/index.html` para a Hostinger.

## Estrutura

```
src/                     código do aplicativo (JS e CSS)
vendor/leaflet.css       estilo do mapa
config.json              endereço do Supabase + chave PUBLICÁVEL (pública por definição)
build.py                 gera dist/index.html
dist/index.html          aplicativo pronto para publicar
dist/demo.html           demonstração sem servidor
supabase/migrations/     tabelas, RLS, funções e bucket de arquivos (aplicadas no projeto)
supabase/functions/      admin-users, traccar-proxy, traccar-webhook (rodam no servidor)
traccar/                 docker-compose do Traccar e guia de ligação
```

## Segurança

| O quê | Onde fica | No navegador? |
|---|---|---|
| Endereço do projeto e chave publicável (`sb_publishable_…`) | `config.json` | Sim (é pública; o acesso é decidido pelo RLS) |
| Chave de serviço (`service_role` / `sb_secret_…`) | Variável automática das Edge Functions | **Nunca** |
| Token do Traccar | `private.traccar_config` (schema não exposto pela API) | **Nunca** |
| Segredo do webhook do Traccar | `private.traccar_config`, visível só ao administrador | Só na tela do administrador |
| Senhas | Supabase Auth | Nunca armazenadas pelo app |

O `build.py` recusa gerar o site se `config.json` tiver qualquer chave que não seja a publicável/anon.

### Perfis e RLS

| Perfil | Pode |
|---|---|
| Administrador | Tudo, inclusive usuários, regras e integrações |
| Gestor de frota | Toda a operação: cadastros, transferência forçada, pedágios, multas, manutenção, premiação; cria acesso de **condutores** |
| Supervisor | Lê tudo; não altera cadastros nem movimentações |
| Condutor | Só o que é dele: a própria posse, checklists, abastecimentos, transferências e alertas; atualiza apenas a quilometragem do veículo que está com ele; não vê CNH/telefone de colegas |

- Todas as tabelas têm RLS. Visitante sem login não lê nada. Perfil inativo não lê nada.
- Gravações passam pela função `sync_apply`, que roda com o login de quem chamou (`SECURITY INVOKER`), então as políticas valem sempre; tudo de uma movimentação entra numa única transação.
- Gatilhos impedem o condutor de mudar placa/cadastro do veículo, diminuir quilometragem, reabrir posse ou forçar transferência.
- A restrição `custody_no_overlap` garante no banco que um veículo nunca tem dois condutores ao mesmo tempo.
- Fotos e documentos ficam no bucket privado `vialink-arquivos`; o app usa links assinados que expiram em 1 hora. O condutor só lê os arquivos que ele mesmo enviou.

## Primeiro acesso (administrador)

1. Abra o site e clique em **Primeiro acesso do administrador**.
2. Use o e-mail `mauriciosantos@dgaautomacao.com.br` (lista `private.bootstrap_admins`) e crie a senha.
3. Confirme pelo link enviado ao e-mail e entre.
4. Em **Configurações › Usuários e perfis**, crie os demais acessos (senha provisória; a pessoa troca no primeiro login).
5. Condutores: cadastre em **Condutores** informando o e-mail; o acesso é criado junto.

Outro e-mail de administrador inicial: no SQL Editor, `insert into private.bootstrap_admins(email) values ('email@empresa.com.br');`

## Ajustes recomendados no painel do Supabase

- **Authentication › Sign In / Providers:** desligar *Allow new users to sign up* depois que o administrador entrar (os usuários são criados pela tela de Usuários).
- **Authentication › URL Configuration:** *Site URL* = endereço publicado (ex.: `https://frota.suaempresa.com.br`) e o mesmo em *Redirect URLs*.
- **Authentication › SMTP:** configurar o e-mail da empresa. O e-mail padrão do Supabase só envia para membros da organização e tem limite baixo (recuperação de senha depende disso).
- **Edge Functions › Secrets (opcional):** `ALLOWED_ORIGIN=https://frota.suaempresa.com.br` para restringir quem chama as funções pelo navegador.

## Desenvolvimento

```bash
python3 build.py          # gera dist/index.html e dist/demo.html
```

Para aplicar as migrations em outro projeto: `supabase link --project-ref <ref>` e `supabase db push`; funções: `supabase functions deploy admin-users traccar-proxy` e `supabase functions deploy traccar-webhook --no-verify-jwt`.

## Publicação na Hostinger

Envie `dist/index.html` para a pasta `public_html` (ou subpasta). Ative HTTPS no domínio. Depois ajuste a *Site URL* do Supabase para o endereço final.

## Visual

- Tema neutro (bege e grafite) com **modo claro e escuro**: botão sol/lua no topo; a escolha fica salva no aparelho e, sem escolha, segue o sistema.
- Cor só onde ajuda a decidir: **verde** para confirmar/salvar, **vermelho** para excluir/inativar e escalas de urgência apenas no **calendário** e nos itens que pedem intervenção imediata (lista de atenção, vencimentos, plano de manutenção).
- Bordas pouco arredondadas (4–6 px). Fontes: Inter, JetBrains Mono (placas) e Playfair Display (marca).
- Responsivo de 320 px em diante: campos sem zoom no iPhone, janelas em tela cheia no celular, alvos de toque maiores e áreas seguras (notch).
