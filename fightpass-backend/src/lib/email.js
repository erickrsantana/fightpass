const nodemailer = require("nodemailer");
const env = require("../config/env");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function parseFrom(value) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(value || ""));
  return m ? { name: m[1].trim() || "FightPass", email: m[2].trim() } : { name: "FightPass", email: String(value || "").trim() };
}

function emailProvider() {
  if (env.email.brevoApiKey) return "brevo-api";
  if (env.email.smtpUser && env.email.smtpPass) return "smtp";
  return null;
}

// Envio unico para todos os e-mails do sistema. Prefere a API HTTPS do Brevo (nao depende de portas SMTP).
async function deliver({ to, subject, html, text }) {
  const provider = emailProvider();
  if (!provider) return { skipped: true, reason: "nenhum provedor de e-mail configurado (BREVO_API_KEY ou SMTP_USER/SMTP_PASS)" };

  if (provider === "brevo-api") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.email.brevoApiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: parseFrom(env.email.from), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${data.message || "falha no envio"}`);
      return { skipped: false, data: { messageId: data.messageId } };
    } finally {
      clearTimeout(timer);
    }
  }

  const transporter = nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpSecure,
    auth: { user: env.email.smtpUser, pass: env.email.smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  const info = await transporter.sendMail({ from: env.email.from, to, subject, html, text });
  return { skipped: false, data: { messageId: info.messageId } };
}

function buildPasswordResetUrl(token) {
  const url = new URL(env.email.passwordResetUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function passwordResetTemplate({ name, resetUrl }) {
  const safeName = escapeHtml(name || "usuário");
  const safeResetUrl = escapeHtml(resetUrl);

  return `
    <!doctype html>
    <html lang="pt-br">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Redefinição de senha - FightPass</title>
      </head>
      <body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif; color:#1e293b;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px; background:#1b59f8; color:#ffffff;">
                    <div style="font-size:24px; font-weight:700;">FightPass</div>
                    <div style="font-size:14px; margin-top:6px;">Recuperação de acesso</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="font-size:22px; line-height:1.3; margin:0 0 16px;">Redefinição de senha</h1>
                    <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Olá, ${safeName}.</p>
                    <p style="font-size:15px; line-height:1.6; margin:0 0 24px;">
                      Recebemos uma solicitação para redefinir a senha da sua conta no FightPass.
                      Clique no botão abaixo para criar uma nova senha.
                    </p>
                    <p style="margin:0 0 28px;">
                      <a href="${safeResetUrl}" style="display:inline-block; background:#1b59f8; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 22px; border-radius:8px;">
                        Redefinir senha
                      </a>
                    </p>
                    <p style="font-size:13px; line-height:1.6; color:#64748b; margin:0 0 12px;">
                      O link expira em 30 minutos. Se você não solicitou esta alteração, ignore este email.
                    </p>
                    <p style="font-size:13px; line-height:1.6; color:#64748b; margin:0;">
                      Caso o botão não funcione, copie e cole este endereço no navegador:<br>
                      <a href="${safeResetUrl}" style="color:#1b59f8; word-break:break-all;">${safeResetUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendPasswordResetEmail({ to, name, token }) {
  const resetUrl = buildPasswordResetUrl(token);
  if (!emailProvider() && process.env.NODE_ENV !== "production") {
    console.log(`[email] (modo desenvolvimento) Link de redefinicao para ${to}: ${resetUrl}`);
  }
  return deliver({
    to,
    subject: "Redefinição de senha - FightPass",
    html: passwordResetTemplate({ name, resetUrl }),
    text: [
      `Olá, ${name || "usuário"}.`,
      "Recebemos uma solicitação para redefinir sua senha no FightPass.",
      `Acesse: ${resetUrl}`,
      "O link expira em 30 minutos. Se você não solicitou esta alteração, ignore este email."
    ].join("\n\n")
  });
}

function verificationTemplate({ name, code, ttlMinutes, purpose }) {
  const isLogin = purpose === "login";
  const safeName = escapeHtml(name || "usuário");
  const safeCode = escapeHtml(code);
  return `
    <!doctype html>
    <html lang="pt-br">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirme seu e-mail - FightPass</title></head>
      <body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif; color:#1e293b;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 16px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
              <tr><td style="padding:28px 32px; background:#1b59f8; color:#ffffff;">
                <div style="font-size:24px; font-weight:700;">FightPass</div>
                <div style="font-size:14px; margin-top:6px;">${isLogin ? "Código de acesso" : "Confirmação de e-mail"}</div>
              </td></tr>
              <tr><td style="padding:32px;">
                <h1 style="font-size:22px; margin:0 0 16px;">${isLogin ? "Confirme que é você" : "Confirme seu e-mail"}</h1>
                <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Olá, ${safeName}. ${isLogin ? "Alguém acabou de entrar com a sua senha. Use o código abaixo para concluir o acesso ao FightPass." : "Use o código abaixo para ativar sua conta no FightPass."}</p>
                <p style="font-size:34px; letter-spacing:10px; font-weight:700; margin:0 0 24px; color:#0f172a;">${safeCode}</p>
                <p style="font-size:13px; line-height:1.6; color:#64748b; margin:0;">O código expira em ${ttlMinutes} minutos. ${isLogin ? "Se não foi você, ignore este e-mail, <strong>troque a sua senha</strong> e não compartilhe o código com ninguém." : "Se você não criou esta conta, ignore este e-mail e não compartilhe o código com ninguém."}</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
  `;
}

async function sendVerificationEmail({ to, name, code, purpose = "register" }) {
  const ttlMinutes = env.emailVerification.ttlMinutes;
  if (!emailProvider() && !env.isProduction) {
    console.log(`[email] (modo desenvolvimento) Codigo de verificacao para ${to}: ${code}`);
  }
  const isLogin = purpose === "login";
  return deliver({
    to,
    subject: `${code} é o seu código de ${isLogin ? "acesso" : "confirmação"} - FightPass`,
    html: verificationTemplate({ name, code, ttlMinutes, purpose }),
    text: [
      `Olá, ${name || "usuário"}.`,
      `Seu código de ${isLogin ? "acesso" : "confirmação"} do FightPass é: ${code}`,
      isLogin
        ? `O código expira em ${ttlMinutes} minutos. Se não foi você tentando entrar, ignore este e-mail e troque a sua senha.`
        : `O código expira em ${ttlMinutes} minutos. Se você não criou esta conta, ignore este e-mail.`
    ].join("\n\n")
  });
}

module.exports = {
  deliver,
  emailProvider,
  sendPasswordResetEmail,
  sendVerificationEmail
};
