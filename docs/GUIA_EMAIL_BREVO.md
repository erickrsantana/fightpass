# E-mail do FightPass (configurar UMA vez)

Por que Brevo por API: o plano grátis do Render bloqueia as portas SMTP (25, 465 e 587), então Gmail/SMTP não funciona publicado. A API do Brevo usa HTTPS (porta 443) e funciona. Plano grátis do Brevo: 300 e-mails/dia.

## Passo a passo
1. Crie conta grátis em brevo.com.
2. **Remetente:** Brevo → Senders, Domains & Dedicated IPs → Senders → Add a sender. Use o e-mail que vai aparecer como remetente (ex.: erick.meiji2004@gmail.com) e confirme o e-mail de verificação que o Brevo enviar.
   - Para chegar sempre na caixa de entrada (e não no spam), o ideal é um remetente de domínio próprio com autenticação (SPF/DKIM/DMARC) feita pelo Brevo. Com @gmail.com costuma funcionar, mas alguns provedores mandam para o spam.
3. **Chave de API:** Brevo → SMTP & API → API Keys → Generate a new API key. Copie (começa com `xkeysib-`). Nunca cole no chat nem no código.
4. No `.env` (local) e nas variáveis do Render (publicado):
   ```
   BREVO_API_KEY=xkeysib-...
   EMAIL_FROM=FightPass <erick.meiji2004@gmail.com>
   ```
   (o e-mail do EMAIL_FROM tem de ser exatamente o remetente verificado no passo 2)
5. Reinicie o backend e teste:
   ```
   npm run test:email -- seuemail@gmail.com
   ```
   Deve imprimir "Enviado!". Ao subir (`npm run dev`) o terminal mostra `[email] provedor: brevo-api`.

Depois disso todos os usuários recebem os códigos e e-mails de recuperação de senha sem mais nenhuma configuração.
