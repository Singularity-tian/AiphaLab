import Database from "better-sqlite3";
import path from "path";
import { DDL } from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "simulation.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const { mkdirSync } = require("fs");
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initDb(_db);
  }
  return _db;
}

function initDb(db: Database.Database) {
  const stmts = DDL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    db.exec(stmt + ";");
  }
}
