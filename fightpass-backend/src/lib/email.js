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
  if (!env.email.smtpUser || !env.email.smtpPass) {
    return { skipped: true, reason: "SMTP_USER ou SMTP_PASS ausente" };
  }

  const resetUrl = buildPasswordResetUrl(token);
  const transporter = nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpSecure,
    auth: {
      user: env.email.smtpUser,
      pass: env.email.smtpPass
    }
  });

  const info = await transporter.sendMail({
    from: env.email.from,
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

  return { skipped: false, data: { messageId: info.messageId } };
}

module.exports = {
  sendPasswordResetEmail
};
