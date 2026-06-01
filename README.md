# FightPass

O **FightPass** é uma plataforma acadêmica desenvolvida como Trabalho de Conclusão de Curso, voltada para a gestão de academias, alunos, aulas e check-ins em instituições de artes marciais.

A aplicação permite que alunos encontrem academias, realizem agendamentos de aulas, façam check-in por token ou QR Code e acompanhem suas informações dentro da plataforma. Também oferece recursos administrativos para gestores e instrutores acompanharem alunos, turmas, avaliações, planos e dados gerenciais.

## Tecnologias Utilizadas

O projeto foi desenvolvido utilizando as seguintes tecnologias:

* **HTML, CSS e JavaScript**: construção do frontend da aplicação.
* **Node.js**: ambiente de execução do backend.
* **Express.js**: framework utilizado para criação da API.
* **MySQL**: banco de dados relacional utilizado para armazenar as informações do sistema.
* **JWT**: autenticação de usuários por token.
* **npm**: gerenciamento de dependências.
* **Git e GitHub**: versionamento e hospedagem do código-fonte.
* **Vercel ou Netlify**: opções de deploy para o frontend.
* **Railway**: opção de deploy para o backend.

## Estrutura do Projeto

A estrutura principal do projeto está organizada da seguinte forma:

* `fightpass-frontend`: frontend estático em HTML, CSS e JavaScript integrado à API.
* `fightpass-backend`: API desenvolvida em Node.js com Express e banco MySQL.
* `docs`: pasta destinada à documentação do projeto.

## Pré-requisitos

Antes de executar o projeto, é necessário ter instalado na máquina:

* Node.js 22
* npm 10
* MySQL 8
* Git

## Instalação e Configuração

### 1. Clonar o repositório

```powershell
git clone https://github.com/seu-usuario/fightpass.git
cd fightpass
```

### 2. Configurar o banco de dados

Crie o banco de dados no MySQL:

```sql
CREATE DATABASE fightpass CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Configurar o backend

Entre na pasta do backend:

```powershell
cd fightpass-backend
```

Copie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

Configure as variáveis de ambiente no arquivo `.env`:

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

Instale as dependências:

```powershell
npm install
```

Crie as tabelas do banco de dados:

```powershell
npm run migrate
```

Carregue os dados de demonstração:

```powershell
npm run seed
```

Execute a API:

```powershell
npm run dev
```

### 4. Testar a API

Após iniciar o backend, acesse a rota de teste de saúde da API:

```text
GET http://localhost:3000/api/health
```

Se a API estiver funcionando corretamente, o sistema deverá retornar uma resposta indicando que o serviço está ativo.

## Configuração do Frontend

Abra o arquivo principal do frontend:

```text
fightpass-frontend/index.html
```

O frontend consome a API em:

```text
http://localhost:3000/api
```

Caso seja necessário configurar manualmente a URL da API, utilize:

```javascript
localStorage.setItem("fightpass.apiBaseUrl", "http://localhost:3000/api")
```

## Deploy

Para realizar o deploy do frontend, é possível utilizar plataformas como **Vercel** ou **Netlify**.

Use a pasta `fightpass-frontend` como raiz do projeto e configure a variável:

```text
FIGHTPASS_API_BASE_URL
```

Essa variável deve receber a URL pública do backend hospedado no Railway, terminando em `/api`.

Exemplo:

```text
https://sua-api-fightpass.up.railway.app/api
```

Após isso, publique o diretório `dist` gerado pelo comando:

```powershell
npm run build
```

O backend pode ser publicado em plataformas como **Railway**, desde que as variáveis de ambiente sejam configuradas corretamente.

## Usuários de Demonstração

Após executar o comando de seed, os usuários abaixo estarão disponíveis para testes.

Todos utilizam a senha:

```text
FightPass123
```

| Perfil                       | Email                                                   |
| ---------------------------- | ------------------------------------------------------- |
| Administrador da instituição | [contato@dojosakura.com](mailto:contato@dojosakura.com) |
| Instrutor                    | [carlos@dojosakura.com](mailto:carlos@dojosakura.com)   |
| Aluno                        | [joao@fightpass.com](mailto:joao@fightpass.com)         |

## Exemplos de Uso

A aplicação pode ser utilizada em diferentes fluxos, de acordo com o perfil do usuário.

### Cadastro e Login

O usuário pode criar uma conta informando nome, e-mail, senha e tipo de conta. Após o cadastro, é possível realizar login e acessar a área interna da plataforma.

Rotas principais:

```text
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
POST /api/auth/logout
```

### Busca de Academias

O aluno pode pesquisar academias por nome, modalidade ou localização. O sistema retorna instituições compatíveis com os filtros informados.

Rotas principais:

```text
GET /api/map/search
GET /api/institutions
GET /api/institutions/:id
```

### Agendamento de Aulas

O aluno pode visualizar turmas disponíveis e realizar o agendamento de uma aula. O sistema registra o agendamento e vincula a aula ao usuário.

Rotas principais:

```text
GET /api/classes
GET /api/classes/:id
POST /api/bookings
GET /api/bookings
DELETE /api/bookings/:id
```

### Check-in

O aluno pode realizar check-in utilizando um token ou QR Code válido. O sistema registra a presença do aluno na aula.

Rotas principais:

```text
POST /api/checkin/token
POST /api/checkin/confirm
GET /api/checkin/history
```

### Painel Administrativo

Gestores e instrutores podem acompanhar informações gerenciais, alunos, instituições, turmas, avaliações e dados de progresso.

Rotas principais:

```text
GET /api/dashboard/student
GET /api/dashboard/institution/:id
GET /api/institutions/:id/students
GET /api/students/:id/evaluations
GET /api/students/:id/profile
GET /api/students/:id/progress
```

## Rotas Principais da API

### Autenticação

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET /api/auth/me
POST /api/auth/logout
```

### Perfil

```text
GET /api/profile
PUT /api/profile
PUT /api/profile/password
```

### Catálogo

```text
GET /api/modalities
GET /api/map/search
GET /api/institutions
GET /api/institutions/:id
GET /api/institutions/:id/students
```

### Turmas

```text
GET /api/classes
GET /api/classes/:id
POST /api/classes
```

### Agendamentos

```text
GET /api/bookings
POST /api/bookings
POST /api/bookings/recurring
DELETE /api/bookings/:id
```

### Check-in

```text
POST /api/checkin/token
POST /api/checkin/confirm
GET /api/checkin/history
```

### Planos e Pagamentos Fictícios

```text
GET /api/plans
GET /api/access/me
POST /api/payments/simulate
POST /api/payments/:id/confirm
```

### Avaliações

```text
GET /api/students/:id/evaluations
POST /api/students/:id/evaluations
GET /api/students/:id/profile
GET /api/students/:id/progress
```

### Dashboards

```text
GET /api/dashboard/student
GET /api/dashboard/institution/:id
```

## Recuperação de Senha

Para utilizar o envio real de e-mails de recuperação de senha, configure as variáveis SMTP no arquivo `.env`.

Exemplo com Brevo:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Também é necessário configurar a variável:

```env
PASSWORD_RESET_URL=http://127.0.0.1:5500/fightpass-frontend/redefinir-senha.html
```

Caso as credenciais SMTP estejam vazias, o token de recuperação ainda será salvo na tabela `password_reset_tokens`, porém o e-mail não será enviado.

## Contribuindo

Este projeto foi desenvolvido com finalidade acadêmica. Caso outras pessoas desejem contribuir, recomenda-se seguir os passos abaixo:

1. Criar uma branch para a alteração.
2. Realizar a implementação ou correção necessária.
3. Testar a funcionalidade localmente.
4. Registrar as alterações com commits claros.
5. Enviar a alteração para análise antes de integrar ao projeto principal.

Exemplo:

```powershell
git checkout -b minha-alteracao
git add .
git commit -m "Descrição da alteração realizada"
git push origin minha-alteracao
```

## Licença

Este projeto foi desenvolvido exclusivamente para fins acadêmicos, como parte de um Trabalho de Conclusão de Curso.

O uso, cópia, modificação ou distribuição do código deve respeitar as orientações da instituição de ensino e dos autores do projeto.
