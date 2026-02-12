import { Worker } from "bullmq";
import { connectDB } from "./config/db.js";
import { createRedisClient } from "./config/redis.js";
import { runtimeConfig } from "./config/runtime.js";
import { SUBMISSION_QUEUE_NAME } from "./queues/constants.js";
import { processSubmissionJob } from "./services/submissionProcessingService.js";

const workerConnection = createRedisClient({ forBull: true });

async function startWorker() {
  await connectDB();
  console.log("Worker connected to DB ...");

  const worker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const result = await processSubmissionJob(job.data);
      return result;
    },
    {
      connection: workerConnection,
      concurrency: runtimeConfig.SUBMISSION_WORKER_CONCURRENCY,
    }
  );

  worker.on("ready", () => {
    console.log(
      `Submission worker ready (concurrency=${runtimeConfig.SUBMISSION_WORKER_CONCURRENCY})`
    );
  });

  worker.on("completed", (job, result) => {
    console.log(`Processed job ${job.id} (${result?.type || "UNKNOWN"})`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id || "unknown"} failed:`, error.message);
  });

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    await workerConnection.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startWorker().catch((error) => {
  console.error("Worker boot error:", error.message);
  process.exit(1);
});
