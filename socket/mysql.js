import mysql from "mysql";
const sqlConnection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "hilo",
  port: 3306,
});

export default sqlConnection;