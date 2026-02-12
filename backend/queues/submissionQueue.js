import { Queue, QueueEvents } from "bullmq";
import { createRedisClient } from "../config/redis.js";
import { runtimeConfig } from "../config/runtime.js";
import { SUBMISSION_QUEUE_NAME } from "./constants.js";

const queueConnection = createRedisClient({ forBull: true });
const queueEventsConnection = createRedisClient({ forBull: true });

export const submissionQueue = new Queue(SUBMISSION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: runtimeConfig.SUBMISSION_QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: runtimeConfig.SUBMISSION_QUEUE_REMOVE_ON_FAIL,
    attempts: 1,
  },
});

export const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
  connection: queueEventsConnection,
});

export async function enqueueSubmissionJob(payload) {
  const job = await submissionQueue.add("submission", payload, {
    jobId: payload.jobId,
  });

  return job;
}

export async function getSubmissionJob(jobId) {
  return submissionQueue.getJob(jobId);
}
