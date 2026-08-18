import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/thin-file-credit-builder.sqlite");

mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);

database.exec(readFileSync(resolve("db/init.sql"), "utf8"));
database.close();

await import(pathToFileURL(resolve("dist/server.js")).href);
