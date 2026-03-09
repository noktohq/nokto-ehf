// app/lib/queue/queues.server.ts
import { Queue, Worker, type ConnectionOptions } from "bullmq";

function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  // Parse redis:// URL
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

export const connection = getRedisConnection();

export const QUEUE_NAMES = {
  INVOICE: "invoice",
  EHF_SEND: "ehf-send",
  EMAIL_SEND: "email-send",
  ACCOUNTING_SYNC: "accounting-sync",
  BILLING_RESET: "billing-reset",
  CLEANUP: "cleanup",
} as const;

// --- Queue instances (lazy singletons) ---
const queues: Record<string, Queue> = {};

export function getQueue(name: string): Queue {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queues[name];
}

export const invoiceQueue = () => getQueue(QUEUE_NAMES.INVOICE);
export const ehfSendQueue = () => getQueue(QUEUE_NAMES.EHF_SEND);
export const emailSendQueue = () => getQueue(QUEUE_NAMES.EMAIL_SEND);
export const accountingSyncQueue = () => getQueue(QUEUE_NAMES.ACCOUNTING_SYNC);

// --- Job payload types ---
export interface InvoiceJobData {
  shopId: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  triggeredBy: "webhook" | "manual";
}

export interface EhfSendJobData {
  shopId: string;
  invoiceId: string;
}

export interface EmailSendJobData {
  shopId: string;
  invoiceId: string;
}

export interface AccountingSyncJobData {
  shopId: string;
  invoiceId: string;
  operation: "customer" | "invoice" | "payment";
}
