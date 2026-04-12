const pool = require('./src/config/db');
async function run() {
  try {
    await pool.execute("ALTER TABLE lots MODIFY COLUMN status ENUM('sin_informacion','censado','registrado','inactive') DEFAULT 'sin_informacion'");
    try {
       await pool.execute("ALTER TABLE lots ADD COLUMN parent_ids JSON NULL");
    } catch(e) { if(e.code!=='ER_DUP_FIELDNAME') throw e; }
    try {
       await pool.execute("ALTER TABLE lots ADD COLUMN version INT DEFAULT 1");
    } catch(e) { if(e.code!=='ER_DUP_FIELDNAME') throw e; }
    console.log("DB Updated!");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
