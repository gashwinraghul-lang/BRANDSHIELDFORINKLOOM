// server/scripts/migrate.js
/**
 * Migration runner that applies all SQL files in the db/migrations directory
 * in lexical order, tracking applied migrations in the `schema_migrations`
 * table. It can be executed directly (node server/scripts/migrate.js) which
 * will exit the process on success/failure, or imported and the `runMigrations`
 * function can be awaited by the server start‑up code.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import pool from '../src/db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

/**
 * Ensure the schema_migrations table exists.
 */
async function ensureSchemaMigrations(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Split a SQL script into individual statements.
 */
function splitStatements(sql) {
  // Remove line comments and split by semicolon.
  const cleaned = sql
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('--'))
    .join(' ');
  return cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Apply pending migrations.
 */
export async function runMigrations() {
  const migrationsDir = path.resolve('db/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexical order ensures correct sequence

  const conn = await pool.getConnection();
  try {
    await ensureSchemaMigrations(conn);
    for (const file of files) {
      const [rows] = await conn.query('SELECT filename FROM schema_migrations WHERE filename = ?', [file]);
      if (rows.length > 0) {
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`Applying migration: ${file}`);
      const statements = splitStatements(sql);
      for (const stmt of statements) {
        await conn.query(stmt);
      }
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    }
    console.log('All pending migrations applied successfully');
  } finally {
    await conn.release();
  }
}

// If this script is run directly, execute migrations and exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}

