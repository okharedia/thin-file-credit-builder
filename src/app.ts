import Fastify from "fastify";
import * as z from "zod";
import type { BankingArgs } from "./banking/index.js";
import { mkCloseDatabase, type DatabaseArgs } from "./database.js";
import { mkGetUserReliability } from "./packages/get-user-reliability.js";
import { mkSyncUser } from "./packages/sync-user.js";

type UserParams = {
  userId: string;
};

type ReliabilityQuery = {
  from?: string;
};

const reliabilityQuerySchema = z.object({
  from: z.iso.date(),
});

export function buildApp(args: BankingArgs & DatabaseArgs) {
  const app = Fastify({ logger: true });
  const closeDatabase = mkCloseDatabase(args);
  const getUserReliability = mkGetUserReliability(args);
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
      const query = reliabilityQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          error: "from must be a valid date in YYYY-MM-DD format",
        });
      }

      return reply.send(
        await getUserReliability(request.params.userId, query.data.from),
      );
    },
  );

  return app;
}
