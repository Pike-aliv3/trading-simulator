// Rebuilds the database from db/*.sql in order. Erases everything first,
// so it only runs with --yes:  npm run db:setup -- --yes
// Uses DATABASE_URL (direct connection) from the .env at the repo root.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Client } = require('pg');

const FILES = ['reset', 'schema', 'seed', 'views', 'triggers', 'matching_engine', 'funds', 'indexes'];
const dbDir = path.resolve(__dirname, '../../db');

async function main() {
    if (!process.argv.includes('--yes')) {
        console.error('This erases every table in the database and rebuilds it from db/*.sql.');
        console.error('Run again with --yes to go ahead:  npm run db:setup -- --yes');
        process.exit(1);
    }
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED;
    if (!connectionString) {
        console.error('No DATABASE_URL in the .env file at the repo root.');
        process.exit(1);
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
        for (const name of FILES) {
            process.stdout.write(`running ${name}.sql ... `);
            await client.query(fs.readFileSync(path.join(dbDir, name + '.sql'), 'utf8'));
            console.log('ok');
        }
        const counts = await client.query(`
            SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM accounts) AS accounts,
                   (SELECT count(*) FROM instruments) AS instruments, (SELECT count(*) FROM orders) AS orders,
                   (SELECT count(*) FROM trades) AS trades, (SELECT count(*) FROM holdings) AS holdings,
                   (SELECT count(*) FROM cash_ledger) AS cash_ledger,
                   (SELECT count(*) FROM watchlists) AS watchlists, (SELECT count(*) FROM watchlist_items) AS watchlist_items`);
        const row = counts.rows[0];
        const total = Object.values(row).reduce((sum, n) => sum + Number(n), 0);
        console.log('rows per table:', row);
        console.log('total rows:', total);
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exit(1);
});
