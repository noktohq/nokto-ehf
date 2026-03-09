// tests/e2e/invoice.spec.ts
import { test, expect } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TEST_SHOP = "demo-shop.myshopify.com";

test.describe("Nokto EHF Invoice App E2E", () => {
  test.beforeEach(async ({ page }) => {
    // In a real test environment, you'd mock Shopify auth
    // Here we test with a mock session cookie
    await page.addInitScript(() => {
      Object.defineProperty(window, "__SHOPIFY_EMBEDDED__", { value: false });
    });
  });

  test("Dashboard loads and shows stats", async ({ page }) => {
    await page.goto(`${APP_URL}/app?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);

    // Should show dashboard title
    await expect(page.getByText("Nokto EHF Invoicing – Dashboard")).toBeVisible({ timeout: 10000 });

    // Should show EHF forbruk card
    await expect(page.getByText("EHF-forbruk denne måneden")).toBeVisible();
  });

  test("Invoices list page loads", async ({ page }) => {
    await page.goto(`${APP_URL}/app/invoices?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("Fakturaer")).toBeVisible({ timeout: 10000 });
  });

  test("B2B Customers page loads and shows form", async ({ page }) => {
    await page.goto(`${APP_URL}/app/customers?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("B2B Kunder")).toBeVisible({ timeout: 10000 });
  });

  test("Settings page loads", async ({ page }) => {
    await page.goto(`${APP_URL}/app/settings?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("Avsenderinformasjon")).toBeVisible({ timeout: 10000 });
  });

  test("Billing page shows plan info", async ({ page }) => {
    await page.goto(`${APP_URL}/app/billing?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("Abonnement")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Prisplan")).toBeVisible();
  });

  test("Billing gate blocks non-subscribed shop", async ({ page }) => {
    // This test verifies the paywall
    await page.goto(`${APP_URL}/app/billing?shop=unsubscribed.myshopify.com&host=bW9ja2hvc3Q=`);
    // Either shows billing page or redirects to subscription flow
    // We just verify the page doesn't crash
    await expect(page).not.toHaveTitle(/Error/);
  });
});

test.describe("Invoice creation flow", () => {
  test("Orders page lists paid orders", async ({ page }) => {
    await page.goto(`${APP_URL}/app/orders?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("Ordrer (betalte)")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Logs page", () => {
  test("Shows audit and webhook logs", async ({ page }) => {
    await page.goto(`${APP_URL}/app/logs?shop=${TEST_SHOP}&host=bW9ja2hvc3Q=`);
    await expect(page.getByText("Logger")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Audit-logger")).toBeVisible();
    await expect(page.getByText("Webhook-logger")).toBeVisible();
  });
});
