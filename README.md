# CR Store

Plataforma de recompensas interna: carteira de pontos e resgate de produtos.
Acesso por whitelist. Primeiro acesso valida o e-mail por código (Supabase Auth);
depois, login por e-mail e senha.

## Time

- Maria — frontend e design (HTML, CSS, JS)
- Ryan — banco, infra e backend

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
