import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempDatabase(): Promise<{
        testDirectory: string;
        databaseFilePath: string;
}>
{
        const testDirectory = await mkdtemp(join(tmpdir(), "credit-builder-test-"));
        const databaseFilePath = join(testDirectory, "test.sqlite");
        const schema = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
        const setupDatabase = new Database(databaseFilePath);

        setupDatabase.exec(schema);
        setupDatabase.close();

        return { testDirectory, databaseFilePath };
}
