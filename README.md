# FightPass

Plataforma acadêmica para gestão de academias e alunos de artes marciais, desenvolvida como projeto de TCC.

## Estrutura

- `fightpass-frontend`: frontend estático em HTML, CSS e JavaScript integrado à API.
- `fightpass-backend`: API Node.js + Express, banco MySQL
- `docs`: Documentação

## Pré-requisitos

- Node.js 22
- npm 10
- MySQL 8
- Git

## Configuração do banco

Crie o banco de dados no MySQL:

```sql
CREATE DATABASE fightpass CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Backend

Entre na pasta do backend:

```powershell
cd fightpass-backend
```

Copie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

Configure as variáveis:

```env
PORT=3000
NODE_ENV=development
APP_NAME=FightPass API
APP_URL=http://localhost:3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=fightpass
DB_USER=root
DB_PASSWORD=

JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=8h

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=FightPass <seu-email-verificado@exemplo.com>
PASSWORD_RESET_URL=http://127.0.0.1:5500/fightpass-frontend/redefinir-senha.html

CHECKIN_TOKEN_TTL_SECONDS=45
BOOKING_CANCELLATION_LIMIT_HOURS=2
```

Instale dependências, crie as tabelas e carregue dados de demonstração:

```powershell
npm install
npm run migrate
npm run seed
```

Execute a API:

```powershell
npm run dev
```

Teste de saúde:

```text
GET http://localhost:3000/api/health
```

## Frontend

Abra o arquivo:

```text
fightpass-frontend/index.html
```

O frontend consome a API em `http://localhost:3000/api`

```javascript
localStorage.setItem("fightpass.apiBaseUrl", "http://localhost:3000/api")
```

## Usuários de demonstração

Todos usam a senha `FightPass123` após executar o seed.

| Perfil | Email |
|---|---|
| Administrador da instituição | `contato@dojosakura.com` |
| Instrutor | `carlos@dojosakura.com` |
| Aluno | `joao@fightpass.com` |

## Rotas principais

Autenticação:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Recuperação de senha:

- Configure `SMTP_USER` e `SMTP_PASS` para envio real via Brevo SMTP ou outro SMTP.
- No Brevo, use `smtp-relay.brevo.com`, porta `587`, SMTP login e SMTP key.
- Configure `PASSWORD_RESET_URL` para apontar para a tela `redefinir-senha.html` servida pelo frontend.
- Se as credenciais SMTP estiverem vazias, o token ainda é salvo em `password_reset_tokens`, mas o email não é enviado.

Perfil:

- `GET /api/profile`
- `PUT /api/profile`
- `PUT /api/profile/password`

Catálogo:

- `GET /api/modalities`
- `GET /api/map/search`
- `GET /api/institutions`
- `GET /api/institutions/:id`
- `GET /api/institutions/:id/students`

Turmas:

- `GET /api/classes`
- `GET /api/classes/:id`
- `POST /api/classes`

Agendamentos:

- `GET /api/bookings`
- `POST /api/bookings`
- `POST /api/bookings/recurring`
- `DELETE /api/bookings/:id`

Check-in:

- `POST /api/checkin/token`
- `POST /api/checkin/confirm`
- `GET /api/checkin/history`

Planos e pagamentos fictícios:

- `GET /api/plans`
- `GET /api/access/me`
- `POST /api/payments/simulate`
- `POST /api/payments/:id/confirm`

Avaliações:

- `GET /api/students/:id/evaluations`
- `POST /api/students/:id/evaluations`
- `GET /api/students/:id/profile`
- `GET /api/students/:id/progress`

Dashboards:

- `GET /api/dashboard/student`
- `GET /api/dashboard/institution/:id`
