import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/thin-file-credit-builder.sqlite");

mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);

database.exec(readFileSync(resolve("db/init.sql"), "utf8"));
database.close();

// Build the analytics mart so the reliability endpoint has a table to read.
// On a first start there is nothing synced yet, which produces an empty mart:
// the endpoint then answers 404 rather than failing to open the database.
// After syncing a user, rebuild with:
//   docker compose exec app npm run analytics:build
const dbtExecutable = resolve("/app/.venv/bin/dbt");

if (existsSync(dbtExecutable))
{
	const build = spawnSync(dbtExecutable, ["build", "--project-dir", "analytics", "--profiles-dir", "analytics"], { stdio: "inherit" });

	if (build.status !== 0)
	{
		console.warn("analytics build failed; the reliability endpoint will not be able to answer until it succeeds");
	}
}

await import(pathToFileURL(resolve("dist/server.js")).href);
