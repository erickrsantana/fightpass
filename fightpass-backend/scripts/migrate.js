const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const env = require("../src/config/env");

async function main() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: true
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(191) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = path.join(__dirname, "..", "src", "database", "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [executed] = await connection.execute(
      "SELECT filename FROM schema_migrations WHERE filename = ? LIMIT 1",
      [file]
    );

    if (executed.length) {
      console.log(`Migration ignorada: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await connection.query(sql);
    await connection.execute("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
    console.log(`Migration executada: ${file}`);
  }

  await connection.end();
  console.log("Migrations executadas com sucesso.");
}

main().catch((error) => {
  console.error("Erro ao executar migration:", error.message);
  process.exit(1);
});
