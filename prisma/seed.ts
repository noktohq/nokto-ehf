import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function seedShop(shopDomain: string, opts: {
  company: string;
  orgNr: string;
  vatNr: string;
  address: string;
  zip: string;
  city: string;
  email: string;
  phone: string;
  bankAccount: string;
  peppolId: string;
  accessToken?: string;
}) {
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {
      senderCompany: opts.company,
      senderOrgNr: opts.orgNr,
      senderVatNr: opts.vatNr,
      senderAddress: opts.address,
      senderZip: opts.zip,
      senderCity: opts.city,
      senderEmail: opts.email,
      senderPhone: opts.phone,
      senderBankAccount: opts.bankAccount,
      peppolParticipantId: opts.peppolId,
      billingPlanActive: true,
      subscriptionStatus: "active",
    },
    create: {
      shopDomain,
      accessToken: opts.accessToken ?? "dev-token",
      scopes: "read_orders,write_orders,read_customers,write_customers,read_products",
      senderCompany: opts.company,
      senderOrgNr: opts.orgNr,
      senderVatNr: opts.vatNr,
      senderAddress: opts.address,
      senderZip: opts.zip,
      senderCity: opts.city,
      senderCountry: "NO",
      senderEmail: opts.email,
      senderPhone: opts.phone,
      senderBankAccount: opts.bankAccount,
      peppolParticipantId: opts.peppolId,
      invoicePrefix: "INV",
      invoiceStartNumber: 1,
      defaultPaymentTermsDays: 14,
      invoiceMode: "MANUAL",
      defaultSendEmail: true,
      defaultSendEhf: true,
      billingPlanActive: true,
      subscriptionStatus: "active",
      billingMonthYear: new Date().toISOString().slice(0, 7),
    },
  });
  console.log("Shop upserted:", shop.shopDomain);
  return shop;
}

async function seedCustomer(shopId: string, shopifyCustomerId: string, opts: {
  companyName: string;
  orgNr: string;
  email: string;
  peppolId: string;
}) {
  const customer = await prisma.b2bCustomer.upsert({
    where: { shopId_shopifyCustomerId: { shopId, shopifyCustomerId } },
    update: {
      companyName: opts.companyName,
      orgNr: opts.orgNr,
      invoiceEmail: opts.email,
      peppolParticipantId: opts.peppolId,
      sendEhf: true,
    },
    create: {
      shopId,
      shopifyCustomerId,
      companyName: opts.companyName,
      orgNr: opts.orgNr,
      invoiceEmail: opts.email,
      peppolParticipantId: opts.peppolId,
      reference: "Test",
      paymentTermsDays: 14,
      kidFormat: "NONE",
      sendEmail: true,
      sendEhf: true,
    },
  });
  console.log("Customer upserted:", customer.companyName);
  return customer;
}

async function main() {
  // Dev-shop (nokto-dev.myshopify.com)
  const devShop = await seedShop("nokto-dev.myshopify.com", {
    company: "NOKTO AS",
    orgNr: "123456789",
    vatNr: "NO123456789MVA",
    address: "Testgata 1",
    zip: "0182",
    city: "Oslo",
    email: "faktura@nokto.no",
    phone: "+47 00 00 00 00",
    bankAccount: "1234.56.78901",
    peppolId: "0192:123456789",
  });

  await prisma.invoiceSequence.upsert({
    where: { shopId: devShop.id },
    update: {},
    create: { shopId: devShop.id, current: 0 },
  });

  // Test-kunde på dev-shopen
  await seedCustomer(devShop.id, "gid://shopify/Customer/1", {
    companyName: "Testkunde AS",
    orgNr: "974760673",
    email: "regnskap@testkunde.no",
    peppolId: "0192:974760673",
  });

  // Demo-shop (for lokal utvikling uten Shopify)
  const demoShop = await seedShop("demo-shop.myshopify.com", {
    company: "Demo AS",
    orgNr: "123456789",
    vatNr: "NO123456789MVA",
    address: "Storgata 1",
    zip: "0182",
    city: "Oslo",
    email: "faktura@demo.no",
    phone: "+47 22 00 00 00",
    bankAccount: "1234.56.78901",
    peppolId: "0192:123456789",
    accessToken: "demo-token",
  });

  await prisma.invoiceSequence.upsert({
    where: { shopId: demoShop.id },
    update: {},
    create: { shopId: demoShop.id, current: 999 },
  });

  await seedCustomer(demoShop.id, "gid://shopify/Customer/1", {
    companyName: "Kunde AS",
    orgNr: "974760673",
    email: "regnskap@kunde.no",
    peppolId: "0192:974760673",
  });

  console.log("Seeding complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
