const mysql = require("mysql2/promise");
const env = require("../config/env");

const useSsl = String(process.env.DB_SSL || "").toLowerCase() === "true";

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true,
  multipleStatements: true,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  query
};