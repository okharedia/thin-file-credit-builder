import { buildApp } from "./app.js";

const app = buildApp({
        bankingApiBaseUrl: process.env.BANKING_API_BASE_URL ?? "https://btq03nn21b.execute-api.eu-central-1.amazonaws.com/",
        databaseFilePath: process.env.DATABASE_PATH ?? "./data/thin-file-credit-builder.sqlite",
});
const port = Number(process.env.PORT ?? 3000);

try
{
        await app.listen({ port, host: "0.0.0.0" });
}
catch (error)
{
        app.log.error(error);
        process.exit(1);
}
