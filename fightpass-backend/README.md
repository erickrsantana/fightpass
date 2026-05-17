# FightPass Backend

API do projeto FightPass desenvolvida em Node.js com Express e MySQL.

## Objetivo

Este backend centraliza a lógica de negócio da plataforma:

- autenticação e controle de acesso;
- cadastro de usuários e instituições;
- busca de academias e modalidades;
- criação e consulta de turmas;
- planos de acesso, teste gratuito e simulação financeira fictícia;
- agendamento e cancelamento de aulas;
- check-in por token/QR Code;
- avaliação de alunos;
- dashboards de acompanhamento;
- auditoria simples de ações relevantes.

## Stack

- Node.js
- Express
- MySQL
- JWT para autenticação
- `express-validator` para validações
- SQL versionado em arquivos

## Configuração

```powershell
npm install
Copy-Item .env.example .env
```

Variáveis principais:

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

GOOGLE_GEOCODING_API_KEY=
GEOCODING_TIMEOUT_MS=5000

CHECKIN_TOKEN_TTL_SECONDS=45
BOOKING_CANCELLATION_LIMIT_HOURS=2
```

### Envio de email com SMTP gratuito

A recuperação de senha usa SMTP quando `SMTP_USER` e `SMTP_PASS` estão configurados. O padrão do `.env.example` aponta para o Brevo SMTP, mas qualquer provedor SMTP compatível pode ser utilizado.

- `SMTP_HOST`: servidor SMTP, por exemplo `smtp-relay.brevo.com`.
- `SMTP_PORT`: porta SMTP, normalmente `587`.
- `SMTP_SECURE`: use `false` na porta `587` e `true` na porta `465`.
- `SMTP_USER`: login SMTP do provedor.
- `SMTP_PASS`: senha/chave SMTP do provedor.
- `EMAIL_FROM`: remetente validado no provedor.
- `PASSWORD_RESET_URL`: endereço público/local da tela `redefinir-senha.html`.

Sem credenciais SMTP, a API mantém o comportamento seguro: salva o token em `password_reset_tokens`, retorna mensagem genérica e registra no console que o envio foi ignorado.

### CEP e geolocalizacao

A consulta de endereco usa ViaCEP. Para latitude e longitude, configure `GOOGLE_GEOCODING_API_KEY`. Se a chave nao estiver configurada ou o Google falhar, o endereco e salvo com `geocoding_status` pendente/falho e pode ser regularizado depois.

Endpoints principais:

- `GET /api/locations/cep/:cep`: consulta CEP e tenta geocodificar.
- `PUT /api/institutions/:id/address`: atualiza endereco do DOJO autenticado.
- `GET /api/map/search`: retorna apenas instituicoes ativas com coordenadas salvas.

## Banco de dados

Crie o banco no MySQL:

```sql
CREATE DATABASE fightpass CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Execute migration e seed:

```powershell
npm run migrate
npm run seed
```

## Execução

Modo desenvolvimento:

```powershell
npm run dev
```

Modo normal:

```powershell
npm start
```

Teste rápido:

```text
GET http://localhost:3000/api/health
```

O frontend estático consome esta API por padrão em `http://localhost:3000/api`.

## Módulos disponíveis

- `auth`: login, cadastro, recuperação e redefinição de senha.
- `profile`: leitura, atualização do perfil e alteração de senha.
- `catalog`: modalidades, instituições e busca de academias.
- `classes`: criação e consulta de turmas.
- `dojo`: plano mensal do parceiro, assinatura, pagamento ficticio e listagem de aulas da instituicao.
- `bookings`: agendamento simples, recorrente e cancelamento.
- `access`: planos, acesso ativo do aluno e pagamento fictício.
- `checkin`: geração e confirmação de token de presença.
- `evaluations`: avaliação técnica e evolução do aluno.
- `dashboard`: indicadores do aluno e da instituição.

## Usuários de demonstração

Todos os usuários abaixo usam a senha `FightPass123` quando o seed é executado:

- `contato@dojosakura.com`: administrador da instituição Dojo Sakura.
- `carlos@dojosakura.com`: instrutor vinculado à Dojo Sakura.
- `joao@fightpass.com`: aluno vinculado à Dojo Sakura.

## Observações

### Atualizacoes da Entrega 3

- Instituicoes cadastradas por administrador recebem o Plano DOJO de R$69 em `institution_platform_subscriptions`.
- O Plano DOJO aparece apenas para administradores de instituicao. Alunos continuam vendo apenas `access_plans`.
- A recuperacao de senha usa Nodemailer/SMTP, salva hash do token, expira em 30 minutos e marca tokens como utilizados.
- O backend consulta CEP via ViaCEP e usa Google Geocoding opcional para latitude/longitude.

- O frontend da Entrega 3 já utiliza a API para autenticação, catálogo, agendamentos, check-in, perfil, gestão, avaliações e dashboards.
- O cadastro de aluno valida CPF e libera um teste gratuito de 1 dia, limitado por CPF, antes da contratação de plano.
- A tela de planos usa cobranças fictícias por Pix ou boleto para demonstrar o fluxo financeiro. Nenhuma cobrança real é executada.
- Instituições cadastradas por administrador recebem vínculo demonstrativo com o FightPass em `institution_platform_subscriptions`.
- O envio real de email de recuperação usa SMTP quando as credenciais são configuradas no `.env`.
- O mapa permanece demonstrativo no frontend, sem serviço externo de geolocalização em tempo real.
