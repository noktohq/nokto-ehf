import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const shopDomain = "demo-shop.myshopify.com";
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: {
      shopDomain,
      accessToken: "demo-token",
      scopes: "read_orders,write_orders,read_customers",
      senderCompany: "Demo AS",
      senderOrgNr: "123456789",
      senderVatNr: "NO123456789MVA",
      senderAddress: "Storgata 1",
      senderZip: "0182",
      senderCity: "Oslo",
      senderCountry: "NO",
      senderEmail: "faktura@demo.no",
      senderPhone: "+47 22 00 00 00",
      senderBankAccount: "1234.56.78901",
      peppolParticipantId: "0192:123456789",
      invoicePrefix: "INV",
      invoiceStartNumber: 1000,
      defaultPaymentTermsDays: 14,
      invoiceMode: "MANUAL",
      billingPlanActive: true,
      billingMonthYear: "2026-02",
      subscriptionStatus: "active",
    },
  });
  console.log("Shop created:", shop.shopDomain);
  const customer = await prisma.b2bCustomer.upsert({
    where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: "gid://shopify/Customer/1" } },
    update: {},
    create: {
      shopId: shop.id,
      shopifyCustomerId: "gid://shopify/Customer/1",
      companyName: "Kunde AS",
      orgNr: "974760673",
      invoiceEmail: "regnskap@kunde.no",
      peppolParticipantId: "0192:974760673",
      reference: "IT-avd",
      paymentTermsDays: 30,
      kidFormat: "KID15",
      sendEmail: true,
      sendEhf: true,
    },
  });
  console.log("Customer created:", customer.companyName);
  await prisma.invoiceSequence.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, current: 999 },
  });
  console.log("Seeding complete!");
}
main().catch(console.error).finally(() => prisma.$disconnect());
