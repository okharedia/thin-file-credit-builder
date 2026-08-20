import Fastify from "fastify";
import * as z from "zod";
import { mkCloseAnalytics, type AnalyticsArgs } from "./analytics.js";
import type { BankingArgs } from "./banking/index.js";
import { mkCloseDatabase, type DatabaseArgs } from "./database.js";
import { isoDateSchema } from "./utils/iso-date.js";
import { mkGetUserReliability } from "./user/reliability.js";
import { mkSyncUser } from "./user/sync.js";

type UserParams = {
        userId: string;
};

type ReliabilityQuery = {
        from?: string;
};

const reliabilityQuerySchema = z.object({
        from: isoDateSchema,
});

export function buildApp(args: BankingArgs & DatabaseArgs & AnalyticsArgs)
{
        const app = Fastify({ logger: true });
        const closeDatabase = mkCloseDatabase(args);
        const closeAnalytics = mkCloseAnalytics(args);
        const getUserReliability = mkGetUserReliability(args);
        const syncUser = mkSyncUser(args);

        app.addHook("onClose", async () =>
        {
                closeDatabase();

                await closeAnalytics();
        });

        // Liveness only. It deliberately touches neither database: the container
        // is healthy before anything has been synced or the mart has been built.
        app.get("/health", async (_request, reply) =>
        {
                return reply.send({ status: "ok" });
        });

        app.post<{ Params: UserParams }>("/api/users/:userId/sync", async (request, reply) =>
        {
                const result = await syncUser(request.params.userId);

                return reply.send(result);
        });

        app.get<{ Params: UserParams; Querystring: ReliabilityQuery }>("/api/users/:userId/reliability", async (request, reply) =>
        {
                const query = reliabilityQuerySchema.safeParse(request.query);

                if (!query.success)
                {
                        return reply.code(400).send({
                                error: "from must be a valid date in YYYY-MM-DD format",
                        });
                }

                const result = await getUserReliability(request.params.userId, query.data.from);

                // A date with no fully-observed 6-month window has no score. The mart
                // omits those dates rather than zero-filling them, because a
                // half-observed window scores like a genuinely bad one.
                if (result.outcome === "date_not_scoreable")
                {
                        return reply.code(404).send({
                                error: "No reliability score is available for that date. Its 6-month scoring window is not fully covered by synced banking data.",
                                scoreable_from: result.scoreableDateRange?.scoreableFrom ?? null,
                                scoreable_to: result.scoreableDateRange?.scoreableTo ?? null,
                        });
                }

                if (result.outcome === "user_not_found")
                {
                        return reply.code(404).send({
                                error: `No synced data for user ${request.params.userId}. POST /api/users/${request.params.userId}/sync first, then rebuild the analytics mart.`,
                        });
                }

                return reply.send(result.response);
        });

        return app;
}
