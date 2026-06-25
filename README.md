<h1>
  <img src="https://cr-store.vercel.app/assets/images/crcoins.webp" alt="CR Coins" width="48">
  CR Store
</h1>

Plataforma de recompensas interna: carteira de pontos e resgate de produtos.
Acesso por whitelist. Primeiro acesso valida o e-mail por código (Supabase Auth);
depois, login por e-mail e senha.

## Time e Contribuições

* **Maria** — Product Design (Concepção do produto, UX/UI, identidade visual e mapeamento de fluxos).
* **Ryan** — Engenharia de Software (Levantamento de requisitos, arquitetura dimensionada por volume de usuários, modelagem de banco de dados, infraestrutura e frontend).

## Módulos

- Carteira: saldo, extrato, transferência de pontos entre usuários.
- Loja: resgate de produtos por pontos, controle de estoque.
- Admin: permissões por cargo (ajuste de saldo, estoque, usuários, campanhas).

Transferência, compra e ajuste de saldo rodam como transação atômica no banco,
sob Row Level Security.

## Arquitetura

```
Frontend (vanilla JS + Vite)   anon key, sob RLS — operações do próprio usuário
Backend (/api na Vercel)       service_role, só no servidor — ações administrativas
Supabase (PostgreSQL)          tabelas, RLS e funções (RPC) atômicas
```

Operações do usuário comum usam a anon key + RLS. Ações privilegiadas (listar
todos os usuários, gerenciar a whitelist) passam pelo backend com a service_role,
que não é exposta ao client.

## Infraestrutura

Dimensionado para ~20 usuários. Planos gratuitos do Supabase (banco, auth, RLS)
e Vercel (frontend e funções serverless). Sem VPS, container ou banco
autogerenciado.

## Estrutura

```
.
├── index.html · carteira.html · loja.html · produto.html
├── css/style.css
├── js/                cliente Supabase (anon key)
│   ├── supabase.js · auth.js · header.js · storage.js
│   └── login.js · carteira.js · loja.js · produto.js
├── admin/
│   ├── index.html
│   └── admin.js
├── api/               funções serverless (service_role)
│   ├── primeiro-acesso.js
│   └── usuarios.js
├── lib/supabaseAdmin.js
├── supabase/          schema, RLS e funções
│   ├── schema.sql
│   ├── 02_extras.sql
│   ├── 03_bootstrap.sql
│   └── 04_produtos_admin.sql
├── vite.config.js
└── .env.example
```

## Licença e Atribuições

Esta plataforma utiliza recursos de terceiros sob licenças de uso livre:

- **Avatares Personalizados**: O criador de perfil utiliza o estilo **Big Smile** do [DiceBear](https://www.dicebear.com/styles/big-smile/), que é uma remixagem da biblioteca de avatares desenvolvida por [Ashley Seo](https://www.ashleyseo.com/) sob a licença [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
  - **Obra original**: [Custom Avatar no Figma Community](https://www.figma.com/community/file/881358461963645496/custom-avatar).
  - **Modificações**: Integrada à API DiceBear v10.x para customização paramétrica em tempo real no front-end, convertendo a imagem vetorial final em `Data-URI` armazenada localmente para carregamento offline instantâneo.
- **Ilustrações**: Ilustrações por Stickers do [Flaticon](https://www.flaticon.com/).

