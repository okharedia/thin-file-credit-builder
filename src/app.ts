import Fastify from "fastify";
import type { BankingArgs } from "./banking/index.js";
import { mkCloseDatabase, type DatabaseArgs } from "./database.js";
import { mkSyncUser } from "./packages/sync-user.js";

type UserParams = {
  userId: string;
};

type ReliabilityQuery = {
  from?: string;
};

export function buildApp(args: BankingArgs & DatabaseArgs) {
  const app = Fastify({ logger: true });
  const closeDatabase = mkCloseDatabase(args);
  const syncUser = mkSyncUser(args);

  app.addHook("onClose", async () => {
    closeDatabase();
  });

  app.post<{ Params: UserParams }>(
    "/api/users/:userId/sync",
    async (request, reply) => {
      const result = await syncUser(request.params.userId);

      return reply.send(result);
    },
  );

  app.get<{ Params: UserParams; Querystring: ReliabilityQuery }>(
    "/api/users/:userId/reliability",
    async (request, reply) => {
      return reply.code(501).send({
        error: "Not implemented",
        user_id: request.params.userId,
        from: request.query.from ?? null,
      });
    },
  );

  return app;
}
