# Conteúdo Base para o DOCX do TCC

## Correção documental do frontend

Na Entrega 3, o frontend do FightPass deixou de representar apenas um protótipo visual e passou a consumir a API do backend. As telas principais utilizam uma camada comum de comunicação HTTP, armazenam o token JWT no navegador, aplicam proteção simples de rotas e exibem estados de carregamento, sucesso, erro e ausência de dados. A integração foi mantida com HTML, CSS e JavaScript estáticos, preservando a proposta tecnológica do projeto.

Foram corrigidos textos com problemas de acentuação nas telas e foram removidos dados fixos das principais páginas quando havia endpoint correspondente. As telas de login, cadastro, recuperação de senha, dashboard, mapa, planos, agendamento, minhas aulas, check-in, perfil, gestão institucional, perfil do aluno e avaliação passaram a refletir dados persistidos no banco ou mensagens claras de indisponibilidade.

## Arquitetura do backend

O backend foi desenvolvido em Node.js com o framework Express, adotando uma arquitetura organizada por módulos. A aplicação foi dividida em rotas especializadas para autenticação, perfil, catálogo de instituições e modalidades, turmas, planos de acesso, pagamentos fictícios, agendamentos, check-in, avaliações e dashboards. Esse arranjo favorece a separação de responsabilidades e prepara o sistema para evolução, manutenção e implantação em nuvem.

O sistema utiliza autenticação baseada em JSON Web Token, com controle de acesso por perfil de usuário. Os principais perfis definidos para o sistema são aluno, instrutor e administrador da instituição. Na Entrega 3, foram reforçadas as validações de permissão por vínculo institucional, impedindo que instrutores ou administradores acessem alunos e indicadores de instituições às quais não pertencem.

## Persistência em MySQL

Foi definida uma estrutura relacional em MySQL para suportar os fluxos observados no frontend e as regras de negócio implementadas. O banco contempla tabelas de usuários, papéis, instituições, endereços, modalidades, vínculos entre usuários e instituições, assinatura demonstrativa da instituição na plataforma, planos de acesso, passes ativos do aluno, uso do teste por CPF, simulações de pagamento, turmas, horários, matrículas, agendamentos, tokens de check-in, presenças, avaliações, histórico de progresso, redefinição de senha e auditoria. Essa modelagem busca coerência entre a interface, os processos operacionais e a necessidade de relatórios gerenciais.

## Segurança e validação

O backend aplica validações de entrada nos endpoints, utiliza hash seguro para senhas e adota mensagens genéricas em operações sensíveis de autenticação. No fluxo de login, o sistema retorna apenas a mensagem de credenciais inválidas em caso de falha, sem informar se o erro ocorreu no email ou na senha. No fluxo de recuperação de senha, a resposta também é neutra, evitando a confirmação pública da existência de um email cadastrado. Quando as credenciais SMTP são configuradas, o sistema envia email de recuperação com link e token de redefinição por meio de provedor transacional, como Brevo SMTP.

Além disso, os fluxos de plano de acesso, agendamento, cancelamento, check-in e avaliação validam regras de negócio no backend, não dependendo apenas da interface. O cadastro de aluno valida CPF e libera um teste gratuito de 1 dia, limitado por CPF. Após o encerramento do teste ou consumo dos treinos disponíveis, novos agendamentos são bloqueados até a contratação de um plano. A Entrega 3 também incluiu registros simples em `audit_logs` para cadastro, login, atualização de perfil, simulação e confirmação de pagamento fictício, criação e cancelamento de agendamentos, geração e confirmação de check-in e registro de avaliação.

## Considerações para implantação futura em nuvem

O backend foi estruturado para futura publicação em ambiente de nuvem, com configurações externalizadas por variáveis de ambiente, organização modular e separação clara entre regras de negócio e transporte HTTP. Como trabalho futuro, recomenda-se complementar a solução com observabilidade, testes automatizados, mapas reais, pagamento real e conciliação financeira. O fluxo financeiro atual permanece explicitamente demonstrativo, com QR Code Pix e boleto fictícios para representar a jornada de contratação sem gerar cobrança real.
