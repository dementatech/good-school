import { Redis } from "ioredis";

// Shared connection: used for caching directly, and passed as the `connection`
// option to BullMQ Queue/Worker instances in /jobs once background jobs exist
// (SMS dispatch, PDF generation, sync retries).
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
