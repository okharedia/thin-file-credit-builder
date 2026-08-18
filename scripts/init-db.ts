import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync("data", { recursive: true });

const database = new Database("data/thin-file-credit-builder.sqlite");

database.exec(readFileSync(new URL("../db/init.sql", import.meta.url), "utf8"));
database.close();
