// Envia um e-mail de teste:  npm run test:email -- seuemail@gmail.com
const { deliver, emailProvider } = require("../src/lib/email");

(async () => {
  const to = process.argv[2];
  if (!to) { console.error("Uso: npm run test:email -- destino@exemplo.com"); process.exit(1); }
  console.log("Provedor:", emailProvider() || "NENHUM");
  try {
    const r = await deliver({ to, subject: "Teste de e-mail - FightPass", html: "<p>Se voce recebeu isto, o envio de e-mails do FightPass esta funcionando.</p>", text: "Se voce recebeu isto, o envio de e-mails do FightPass esta funcionando." });
    console.log(r.skipped ? "NAO enviado: " + r.reason : "Enviado! Confira a caixa de entrada e o Spam. id: " + (r.data && r.data.messageId));
  } catch (e) { console.error("FALHOU:", e.message); process.exit(1); }
})();
