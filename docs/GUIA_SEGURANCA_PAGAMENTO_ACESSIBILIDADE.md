# FightPass – Segurança, pagamento real e acessibilidade (guia rápido)

## 1. Rodar as migrações (banco Aiven ligado)
```
cd fightpass-backend
npm install
npm run migrate        # aplica 013 (verificação de e-mail) e 014 (gateway)
```
Usuários que já existiam ficam como "e-mail verificado" (não são trancados fora).

## 2. Variáveis no Render (API)
| Variável | Valor |
|---|---|
| NODE_ENV | production |
| JWT_SECRET | 48+ caracteres aleatórios (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Sem isso a API NÃO sobe em produção |
| CORS_ORIGINS | https://SEU-SITE.vercel.app |
| FRONTEND_URL | https://SEU-SITE.vercel.app |
| API_PUBLIC_URL | https://SUA-API.onrender.com |
| SMTP_USER / SMTP_PASS / EMAIL_FROM | Brevo (envia o código de 6 dígitos) |
| PAYMENTS_MODE | gateway (ou simulation para continuar com o fluxo fictício) |
| MERCADOPAGO_ACCESS_TOKEN | começar com o token de TESTE (TEST-...) |
| MERCADOPAGO_WEBHOOK_SECRET | chave secreta do webhook |

## 3. Pagamento na SUA conta (Mercado Pago – Checkout Pro)
1. Crie conta em mercadopago.com.br → Suas integrações → Criar aplicação (Checkout Pro).
2. Copie o Access Token (teste primeiro; depois o de produção) e cole **só no Render**.
3. Em Webhooks, URL: `https://SUA-API.onrender.com/api/payments/webhook/mercadopago`, evento "Pagamentos"; copie a chave secreta para MERCADOPAGO_WEBHOOK_SECRET.
4. O dinheiro cai no saldo da conta Mercado Pago dona do token (você retira para seu banco).
- Valor sempre vem do banco (o navegador não manda preço); o webhook é validado por assinatura HMAC e reconsultado na API do Mercado Pago (valor, moeda e status); é idempotente.
- Dados de cartão não passam pelo FightPass (ficam no Mercado Pago).
- Em modo gateway, "simular/confirmar" pagamento fica bloqueado (403).

## 4. Verificação por e-mail
Cadastro → código de 6 dígitos no e-mail (vale 15 min, 5 tentativas, reenvio a cada 60 s, guardado com hash). Sem confirmar, o login é bloqueado.

## 5. Senhas
Já eram guardadas com **hash bcrypt + sal** (nunca em texto puro). Agora custo 12 e, no login, hashes antigos (custo 10) são refeitos automaticamente. Recuperação de senha usa token guardado como SHA-256.

## 6. Proteções adicionadas
JWT com algoritmo fixado (HS256) e segredo obrigatório em produção · usuário desativado/não verificado barrado em toda requisição · bloqueio por tentativas de login (5 → 15 min) · rate limit específico nas rotas de auth · CORS só para sites autorizados · helmet estrito · erros sem vazar detalhes em produção · hash fictício contra medição de tempo no login · CSP + HSTS + X-Frame-Options no frontend (vercel.json) · correção de XSS armazenado no cabeçalho (nome do usuário).

## 7. Testes
- `npm run test:unit` – hash de senha, código, bloqueio de login, assinatura do webhook (rodam sem banco).
- `BASE_URL=http://localhost:3000 npm run test:security` – ataca a API em execução: SQL injection, JWT adulterado/alg none, CORS, rotas sem token, JSON malformado/corpo gigante, força bruta (429), enumeração, webhook falso, cadastro com papel admin, arquivos sensíveis. **Rode só no seu ambiente.**

## 8. Botão de acessibilidade (todas as telas)
Botão azul no canto inferior esquerdo (ou Alt+A): leitor de voz ao passar o mouse/Tab/toque (pt-BR) · alertas visuais com faixa, piscada e vibração + tradutor de Libras (VLibras) · filtros para protanopia, deuteranopia, tritanopia e acromatopsia + símbolos além da cor · alto contraste, fonte A+/A-, destacar links, reduzir animações. Preferências ficam salvas.

## Limites honestos
Nenhum teste garante "zero invasão". Aqui foram validados: sintaxe do backend, testes unitários e o widget/XSS no navegador. Os testes de API e o pagamento real precisam rodar no seu ambiente (com banco e conta Mercado Pago). Teste primeiro com o token TEST-.

## 9. Código por e-mail a cada login (2º fator)
Todo login (inclusive de contas antigas) envia um código de 6 dígitos ao e-mail cadastrado; o token só é emitido depois do código. Exige SMTP (Brevo) configurado no Render; sem SMTP ninguém entra. Para desligar temporariamente: `LOGIN_2FA_REQUIRED=false`.

## 10. hCaptcha
Login, cadastro (aluno e academia) e "esqueci minha senha". Variáveis: `HCAPTCHA_SITEKEY` (pública) e `HCAPTCHA_SECRET` (só no Render). Chaves de teste no `.env.example`. Cadastre `localhost` e o domínio da Vercel no painel do hCaptcha.
