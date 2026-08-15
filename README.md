# Thin-File Credit Builder

Minimal TypeScript service for the thin-file credit builder assignment.

## Run locally

```bash
npm install
sqlite3 data/thin-file-credit-builder.sqlite < db/init.sql
npm run dev
```

The SQL command creates the tables and indexes in
`data/thin-file-credit-builder.sqlite`. The application expects this database to
exist before it starts. The service then listens on `http://localhost:3000` by
default.

## Endpoints

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

The sync endpoint stores the user's accounts and transactions. The reliability
endpoint is not implemented yet.
