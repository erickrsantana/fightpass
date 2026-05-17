const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const routes = require("./routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota nao encontrada"
  });
});

app.use((err, req, res, next) => {
  if (err.code === "ER_DUP_ENTRY") {
    const messageByKey = [
      { key: "users.email", message: "Ja existe um usuario com este email" },
      { key: "email", message: "Ja existe um usuario com este email" },
      { key: "users.document", message: "CPF/CNPJ ja cadastrado" },
      { key: "document", message: "CPF/CNPJ ja cadastrado" },
      { key: "institutions.legal_document", message: "Ja existe uma instituicao com este CNPJ" },
      { key: "legal_document", message: "Ja existe uma instituicao com este CNPJ" }
    ];
    const duplicateMessage = messageByKey.find((item) => err.message.includes(item.key));

    return res.status(409).json({
      success: false,
      message: duplicateMessage ? duplicateMessage.message : "Registro duplicado",
      details: null
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Erro interno do servidor",
    details: err.details || null
  });
});

module.exports = app;
