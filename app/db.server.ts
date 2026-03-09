// app/db.server.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // Prevent multiple instances during hot reload in development
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

let db: PrismaClient;

if (process.env.NODE_ENV === "production") {
  db = new PrismaClient({ log: ["error"] });
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient({
      log: ["query", "error", "warn"],
    });
  }
  db = global.__db__;
}

export { db };
