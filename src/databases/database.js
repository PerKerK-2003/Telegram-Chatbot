// databases/database.js
const knex = require("knex");

const db = knex({
  client: "mysql2", // or 'mysql' depending on XAMPP config
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
  },
});

module.exports = db;
