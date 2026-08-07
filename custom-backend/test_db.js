const { Client } = require('pg');
async function test() {
  const passwords = ['postgres', 'root', 'password', '', 'samc4e'];
  for (const p of passwords) {
    try {
      const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: p,
        port: 5432,
      });
      await client.connect();
      console.log('SUCCESS with password:', p);
      await client.end();
      return;
    } catch(e) {
      console.log('Failed with password:', p, '-', e.message);
    }
  }
}
test();
