const pool = require('./src/config/db');
async function test() {
  const [rows] = await pool.execute('DESCRIBE lots');
  console.log(rows);
  process.exit();
}
test();
