// app/lib/logger.server.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      "*.email",
      "*.invoiceEmail",
      "*.smtpPass",
      "*.accessToken",
      "*.apiKey",
      "*.phone",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}
