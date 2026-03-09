// app/shopify.server.ts
import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { db } from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(",") ?? [
    "read_orders",
    "write_orders",
    "read_customers",
    "write_customers",
    "read_products",
  ],
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });

      // Upsert shop record
      const { encrypt } = await import("./lib/crypto.server");
      await db.shop.upsert({
        where: { shopDomain: session.shop },
        update: {
          accessToken: await encrypt(session.accessToken ?? ""),
          scopes: session.scope ?? "",
          isActive: true,
          uninstalledAt: null,
        },
        create: {
          shopDomain: session.shop,
          accessToken: await encrypt(session.accessToken ?? ""),
          scopes: session.scope ?? "",
          billingMonthYear: new Date().toISOString().slice(0, 7),
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    },
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    ORDERS_PAID: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    ORDERS_CREATE: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    REFUNDS_CREATE: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    // Mandatory GDPR compliance webhooks (required by Shopify App Store)
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    SHOP_REDACT: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
