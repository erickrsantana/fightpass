# Prompt de desenvolvimento - Entrega 3 do TCC FightPass

Use este prompt com um agente de desenvolvimento de software trabalhando no repositorio `tcc-2025-1-e-2-fightpass`.

```text
Voce e um agente de desenvolvimento senior trabalhando no TCC FightPass. Termine a Entrega 3, com prazo em 26/04/2026, seguindo o enunciado: "Desenvolvimento da aplicacao - Regras de negocio da aplicacao - parte 2 - Enfase no Backend e integracao". A entrega sera conferida no GitHub Classroom e havera demonstracao das principais funcionalidades para o professor, principalmente as que destacam regras de negocio.

CONTEXTO DO PROJETO
- Nome: FightPass.
- Objetivo: plataforma academica para gestao de academias e alunos de artes marciais.
- Estrutura atual:
  - `fightpass-frontend`: frontend estatico em HTML, CSS e JavaScript.
  - `fightpass-backend`: API Node.js + Express + MySQL.
  - `docs/tcc-documentacao-base.md`: texto base documental.
  - `TCC.docx`: documento do TCC em ABNT.
- Stack do backend: Node.js, Express, MySQL, JWT, bcryptjs, express-validator, helmet, cors, morgan.
- Rotas existentes: autenticacao, perfil, catalogo/mapa, instituicoes, turmas, agendamentos, check-in, avaliacoes e dashboards.
- Banco atual: roles, users, institutions, addresses, institution_user, modalities, institution_modality, classes, class_schedules, enrollments, bookings, attendance_qr_tokens, attendances, student_evaluations, student_progress_snapshots, password_reset_tokens e audit_logs.

OBJETIVO DA ENTREGA 3
Transformar o projeto de prototipo/backend isolado em uma aplicacao demonstravel, com backend funcionando, regras de negocio parte 2 implementadas/validadas e frontend integrado a API. Todas as telas principais devem apresentar resultados reais vindos do banco ou mensagens claras de erro/estado vazio. Se alguma funcionalidade ainda tiver limitacao, registrar a ressalva na documentacao e no resumo final.

ANTES DE ALTERAR
1. Leia `README.md`, `fightpass-backend/README.md`, `docs/tcc-documentacao-base.md`, as rotas do backend e as paginas HTML.
2. Verifique o status do Git e nao reverta alteracoes de terceiros.
3. Preserve o estilo atual do projeto: HTML/CSS/JS estatico no frontend e modulos Express no backend.
4. Corrija textos com problemas de acentuacao quando aparecerem em telas, menus e documentacao.

BACKEND - REGRAS DE NEGOCIO PARTE 2
Implemente ou ajuste as regras abaixo usando consultas parametrizadas, validacao de entrada e mensagens claras:
- Autenticacao: cadastro, login, recuperacao/redefinicao de senha, `GET /api/auth/me`, JWT no frontend e controle de acesso por perfil.
- Perfis: aluno, instrutor e administrador da instituicao. Impedir que um perfil acesse dados/acoes de outro sem permissao.
- Instituicoes e mapa: listar modalidades, buscar instituicoes por modalidade/nome, carregar detalhes da instituicao e turmas vinculadas.
- Turmas: permitir consulta de turmas e criacao por instrutor/admin. Validar instituicao, modalidade, horario, capacidade e dia da semana.
- Agendamentos: aluno deve agendar aula simples e recorrente, listar minhas aulas e cancelar. Regras obrigatorias:
  - bloquear agendamento duplicado para mesmo aluno, horario e data;
  - bloquear turma sem vagas;
  - impedir agendamento em data passada;
  - validar se a data escolhida corresponde ao dia da semana do horario;
  - respeitar limite de cancelamento configurado por `BOOKING_CANCELLATION_LIMIT_HOURS`;
  - em agendamento recorrente, evitar criacao parcial inconsistente; retornar conflitos de forma compreensivel.
- Check-in: gerar token/QR Code para agendamento valido, expirar em `CHECKIN_TOKEN_TTL_SECONDS`, impedir token vencido/reutilizado, registrar presenca, evitar presenca duplicada e atualizar o status do agendamento quando aplicavel.
- Avaliacoes: instrutor/admin deve listar alunos da instituicao, abrir perfil do aluno, registrar avaliacao de 0 a 10, listar historico e mostrar progresso. Validar que o aluno pertence a instituicao do avaliador.
- Dashboard aluno: aulas agendadas, taxa de presenca e media de avaliacao com dados reais.
- Dashboard instituicao: alunos ativos, taxa de presenca e risco/evolucao com dados reais.
- Auditoria/historico: usar `audit_logs` ou outro mecanismo simples para registrar acoes relevantes, como cadastro, agendamento, cancelamento, check-in e avaliacao, se couber no escopo sem criar complexidade desnecessaria.

FRONTEND - INTEGRACAO
Integrar as telas existentes com a API, sem trocar a stack:
- Criar uma camada comum de API, por exemplo `fightpass-frontend/js/api.js`, com `API_BASE_URL`, tratamento de JSON, token JWT no `localStorage`, headers de autenticacao e tratamento padrao de erros.
- Criar protecao simples de rotas/telas: paginas internas exigem login; login/cadastro redirecionam quando ja autenticado.
- Atualizar `layout.js` para exibir nome e papel do usuario autenticado, esconder/mostrar links conforme perfil e oferecer logout.
- Integrar:
  - `login.html`: autenticar pela API e redirecionar por perfil.
  - `cadastro.html`: cadastrar aluno/instrutor/admin, respeitando senha minima exigida pelo backend e criando instituicao quando for admin.
  - `redefinir-senha.html` e paginas de sucesso: chamar recuperacao de senha e mostrar mensagem generica.
  - `dashboard.html`: carregar dashboard do aluno ou da instituicao conforme perfil.
  - `mapa.html`: carregar modalidades/instituicoes da API, filtrar e abrir detalhes.
  - `agendar.html`: carregar turmas/horarios reais, criar agendamento simples ou recorrente e mostrar conflitos.
  - `minhas-aulas.html`: listar agendamentos reais e cancelar aula.
  - `checkin.html`: gerar QR/token real, exibir contagem regressiva e permitir demonstracao do fluxo.
  - `perfil.html`: carregar e atualizar dados do usuario e alterar senha se houver campos.
  - `gestao.html`: carregar indicadores institucionais e lista de alunos reais.
  - `perfil-aluno.html`: carregar dados, avaliacoes e progresso do aluno selecionado.
  - `avaliar-aluno.html`/`avaliar.html`: salvar avaliacao via API.
- Todas as telas devem ter estado de carregamento, erro, sucesso e vazio. Nada importante deve ficar fixo/mockado quando houver endpoint correspondente.

VERIFICACAO TECNICA
- Executar `npm run check` no backend.
- Se houver MySQL disponivel, executar `npm run migrate`, `npm run seed` e testar endpoints principais.
- Testar manualmente os fluxos de demonstracao:
  1. cadastro/login;
  2. busca de academia/modalidade;
  3. agendamento com sucesso;
  4. tentativa de agendamento duplicado ou sem vaga;
  5. cancelamento com regra de limite;
  6. check-in por token/QR;
  7. avaliacao do aluno;
  8. dashboards aluno/instituicao.
- Atualizar README se mudar forma de executar, variaveis de ambiente, rotas ou usuarios de demonstracao.

SECAO DOCX - ATUALIZACAO DO DOCUMENTO EM ABNT
Atualize o `TCC.docx` ou gere um arquivo `docs/tcc-entrega-3-atualizacao.md` com texto pronto para inserir no DOCX. O conteudo deve estar em linguagem academica, impessoal, clara e compativel com ABNT. Manter fonte, margens, espacamento, numeracao de secoes, legendas de quadros/figuras e referencias conforme o padrao ja usado no documento.

Obrigatorio na documentacao:
- Incluir todas as correcoes apontadas nas entregas 1 e 2 que estiverem pendentes.
- Atualizar telas, requisitos funcionais e regras de negocio conforme o que foi implementado.
- Incluir quadro de historico de alteracoes dos requisitos funcionais, requisitos nao funcionais e regras de negocio.
- Substituir o subtitulo "3.8 Infraestrutura da Aplicacao" por "3.8 Arquitetura do sistema".
- Na secao "3.8 Arquitetura do sistema", aplicar o modelo C4 e inserir seu diagrama. No minimo, descrever:
  - C1 - Contexto do sistema: usuario aluno, instrutor, administrador da instituicao, sistema FightPass, banco MySQL e servicos externos futuros.
  - C2 - Containers: frontend HTML/CSS/JS, API Node.js/Express, banco MySQL e navegador do usuario.
  - Justificar as decisoes arquiteturais: separacao frontend/backend, API REST, JWT, MySQL, variaveis de ambiente e modularizacao por dominio.
- Atualizar a secao "Desenvolvimento da aplicacao" descrevendo:
  - integracao do frontend com backend;
  - funcionalidades implementadas;
  - regras de negocio demonstraveis;
  - persistencia em banco;
  - seguranca e controle de acesso;
  - limitacoes e trabalhos futuros.

Modelo minimo para o quadro de historico de alteracoes no DOCX:
Quadro X - Historico de alteracoes dos requisitos e regras de negocio
Colunas: Codigo | Tipo | Descricao anterior | Alteracao realizada na Entrega 3 | Justificativa | Impacto nas telas/backend | Status.
Linhas sugeridas: RF de login/cadastro; RF de busca de academias; RF de agendamento; RF de check-in; RF de avaliacao; RF de dashboard; RN de capacidade da turma; RN de bloqueio de duplicidade; RN de cancelamento; RN de permissao por perfil; RNF de seguranca/autenticacao; RNF de persistencia.

Ao escrever a SECAO DOCX, entregue texto pronto para colar no documento, com estes blocos:
1. Atualizacao dos requisitos funcionais.
2. Atualizacao dos requisitos nao funcionais.
3. Atualizacao das regras de negocio.
4. Quadro de historico de alteracoes.
5. Secao 3.8 Arquitetura do sistema com C4.
6. Atualizacao da secao de desenvolvimento da aplicacao.
7. Roteiro de demonstracao para o professor.

CRITERIOS DE ACEITE
- A aplicacao deve iniciar sem erro.
- Backend e frontend devem conversar pela API.
- As principais telas devem apresentar dados reais ou mensagens claras.
- As regras de negocio da Entrega 3 devem estar demonstraveis.
- O documento deve refletir exatamente o que foi implementado.
- O resumo final deve listar arquivos alterados, comandos executados, testes feitos, pendencias e roteiro de demonstracao.
```
