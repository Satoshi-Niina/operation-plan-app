import pg from 'pg';
const { Client } = pg;

const dbs = ['daitetsu_db', 'kosei_db', 'kintetsu_db', 'common_db'];

for (const db of dbs) {
  const client = new Client({
    connectionString: `postgresql://postgres:Takabeni@localhost:5432/${db}`
  });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);
    console.log(`=== ${db} (${res.rows.length} tables) ===`);
    res.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
  } catch (err) {
    console.error(`Error connecting to ${db}: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
