// app/routes/app.settings.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  Text,
  BlockStack,
  Divider,
  Banner,
  InlineStack,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { encrypt, decrypt } from "~/lib/crypto.server";
import { audit } from "~/lib/audit.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  return json({
    shop: {
      senderCompany: shop.senderCompany,
      senderOrgNr: shop.senderOrgNr,
      senderVatNr: shop.senderVatNr,
      senderAddress: shop.senderAddress,
      senderZip: shop.senderZip,
      senderCity: shop.senderCity,
      senderEmail: shop.senderEmail,
      senderPhone: shop.senderPhone,
      senderBankAccount: shop.senderBankAccount,
      senderIBAN: shop.senderIBAN,
      senderBIC: shop.senderBIC,
      peppolParticipantId: shop.peppolParticipantId,
      invoicePrefix: shop.invoicePrefix,
      invoiceStartNumber: shop.invoiceStartNumber,
      defaultPaymentTermsDays: shop.defaultPaymentTermsDays,
      invoiceMode: shop.invoiceMode,
      defaultSendEmail: shop.defaultSendEmail,
      defaultSendEhf: shop.defaultSendEhf,
      ehfCustomizationId: shop.ehfCustomizationId,
      ehfProfileId: shop.ehfProfileId,
      peppolProviderApiUrl: shop.peppolProviderApiUrl,
      peppolProviderSenderId: shop.peppolProviderSenderId,
      smtpHost: shop.smtpHost,
      smtpPort: shop.smtpPort,
      smtpSecure: shop.smtpSecure,
      smtpUser: shop.smtpUser,
      smtpFrom: shop.smtpFrom,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_sender") {
    await db.shop.update({
      where: { id: shop.id },
      data: {
        senderCompany: formData.get("senderCompany") as string,
        senderOrgNr: formData.get("senderOrgNr") as string,
        senderVatNr: formData.get("senderVatNr") as string,
        senderAddress: formData.get("senderAddress") as string,
        senderZip: formData.get("senderZip") as string,
        senderCity: formData.get("senderCity") as string,
        senderEmail: formData.get("senderEmail") as string,
        senderPhone: formData.get("senderPhone") as string,
        senderBankAccount: formData.get("senderBankAccount") as string,
        senderIBAN: formData.get("senderIBAN") as string,
        senderBIC: formData.get("senderBIC") as string,
        peppolParticipantId: formData.get("peppolParticipantId") as string,
      },
    });
    await audit({ shopId: shop.id, action: "settings.sender_updated", entityType: "shop", entityId: shop.id });
  }

  if (intent === "save_invoice") {
    await db.shop.update({
      where: { id: shop.id },
      data: {
        invoicePrefix: formData.get("invoicePrefix") as string,
        invoiceStartNumber: parseInt(formData.get("invoiceStartNumber") as string, 10),
        defaultPaymentTermsDays: parseInt(formData.get("defaultPaymentTermsDays") as string, 10),
        invoiceMode: formData.get("invoiceMode") as "AUTO_ON_PAID" | "MANUAL",
        defaultSendEmail: formData.get("defaultSendEmail") === "on",
        defaultSendEhf: formData.get("defaultSendEhf") === "on",
        ehfCustomizationId: formData.get("ehfCustomizationId") as string,
        ehfProfileId: formData.get("ehfProfileId") as string,
      },
    });
    await audit({ shopId: shop.id, action: "settings.invoice_updated", entityType: "shop", entityId: shop.id });
  }

  if (intent === "save_peppol") {
    const apiKey = formData.get("peppolApiKey") as string;
    await db.shop.update({
      where: { id: shop.id },
      data: {
        peppolProviderApiUrl: formData.get("peppolProviderApiUrl") as string,
        peppolProviderSenderId: formData.get("peppolProviderSenderId") as string,
        ...(apiKey ? { peppolProviderApiKey: await encrypt(apiKey) } : {}),
      },
    });
    await audit({ shopId: shop.id, action: "settings.peppol_updated", entityType: "shop", entityId: shop.id });
  }

  if (intent === "save_smtp") {
    const smtpPass = formData.get("smtpPass") as string;
    await db.shop.update({
      where: { id: shop.id },
      data: {
        smtpHost: formData.get("smtpHost") as string,
        smtpPort: parseInt(formData.get("smtpPort") as string, 10),
        smtpSecure: formData.get("smtpSecure") === "on",
        smtpUser: formData.get("smtpUser") as string,
        smtpFrom: formData.get("smtpFrom") as string,
        ...(smtpPass ? { smtpPass: await encrypt(smtpPass) } : {}),
      },
    });
    await audit({ shopId: shop.id, action: "settings.smtp_updated", entityType: "shop", entityId: shop.id });
  }

  return json({ ok: true });
}

export default function SettingsPage() {
  const { shop } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";

  return (
    <Page title="Innstillinger">
      <Layout>
        {/* Sender info */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_sender" />
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Avsenderinformasjon</Text>
                <TextField label="Firmanavn" name="senderCompany" defaultValue={shop.senderCompany} autoComplete="organization" />
                <InlineStack gap="300">
                  <TextField label="Org.nr" name="senderOrgNr" defaultValue={shop.senderOrgNr} autoComplete="off" />
                  <TextField label="MVA-nr" name="senderVatNr" defaultValue={shop.senderVatNr} autoComplete="off" placeholder="NO123456789MVA" />
                </InlineStack>
                <TextField label="Adresse" name="senderAddress" defaultValue={shop.senderAddress} autoComplete="street-address" />
                <InlineStack gap="300">
                  <TextField label="Postnummer" name="senderZip" defaultValue={shop.senderZip} autoComplete="postal-code" />
                  <TextField label="By" name="senderCity" defaultValue={shop.senderCity} autoComplete="address-level2" />
                </InlineStack>
                <TextField label="E-post" name="senderEmail" type="email" defaultValue={shop.senderEmail} autoComplete="email" />
                <TextField label="Telefon" name="senderPhone" defaultValue={shop.senderPhone} autoComplete="tel" />
                <Divider />
                <Text variant="headingMd" as="h3">Bank</Text>
                <TextField label="Bankkontonummer (BBAN)" name="senderBankAccount" defaultValue={shop.senderBankAccount} autoComplete="off" />
                <TextField label="IBAN" name="senderIBAN" defaultValue={shop.senderIBAN} autoComplete="off" />
                <TextField label="BIC/SWIFT" name="senderBIC" defaultValue={shop.senderBIC} autoComplete="off" />
                <Divider />
                <TextField label="Peppol Participant ID (som avsender)" name="peppolParticipantId" defaultValue={shop.peppolParticipantId} autoComplete="off" placeholder="0192:123456789" />
                <Button submit loading={saving}>Lagre avsenderinfo</Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* Invoice settings */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_invoice" />
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Fakturanummerering og modus</Text>
                <InlineStack gap="300">
                  <TextField label="Prefiks" name="invoicePrefix" defaultValue={shop.invoicePrefix} autoComplete="off" />
                  <TextField label="Startnummer" name="invoiceStartNumber" type="number" defaultValue={String(shop.invoiceStartNumber)} autoComplete="off" />
                </InlineStack>
                <TextField label="Standard betalingsbetingelser (dager)" name="defaultPaymentTermsDays" type="number" defaultValue={String(shop.defaultPaymentTermsDays)} autoComplete="off" />
                <Select
                  label="Fakturamodus"
                  name="invoiceMode"
                  options={[
                    { label: "Manuell", value: "MANUAL" },
                    { label: "Automatisk ved betaling", value: "AUTO_ON_PAID" },
                  ]}
                  value={shop.invoiceMode}
                />
                <Checkbox label="Send e-post som standard" name="defaultSendEmail" defaultChecked={shop.defaultSendEmail} />
                <Checkbox label="Send EHF som standard" name="defaultSendEhf" defaultChecked={shop.defaultSendEhf} />
                <Divider />
                <Text variant="headingMd" as="h3">EHF/UBL ID-er</Text>
                <TextField label="EHF CustomizationID" name="ehfCustomizationId" defaultValue={shop.ehfCustomizationId} autoComplete="off" multiline />
                <TextField label="EHF ProfileID" name="ehfProfileId" defaultValue={shop.ehfProfileId} autoComplete="off" />
                <Button submit loading={saving}>Lagre fakturastillinger</Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* Peppol config */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_peppol" />
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Peppol/EHF Access Point</Text>
                <Banner>
                  <p>Leverandør konfigureres via PEPPOL_PROVIDER miljøvariabel (mock/storecove). API-detaljer her overstyrer env-defaults.</p>
                </Banner>
                <TextField label="Provider API URL" name="peppolProviderApiUrl" defaultValue={shop.peppolProviderApiUrl} autoComplete="off" />
                <TextField label="API nøkkel" name="peppolApiKey" type="password" autoComplete="new-password" placeholder="Latt tomt beholder eksisterende" />
                <TextField label="Sender ID" name="peppolProviderSenderId" defaultValue={shop.peppolProviderSenderId} autoComplete="off" />
                <Button submit loading={saving}>Lagre Peppol-config</Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* SMTP */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_smtp" />
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">E-post (SMTP)</Text>
                <InlineStack gap="300">
                  <TextField label="SMTP Host" name="smtpHost" defaultValue={shop.smtpHost} autoComplete="off" />
                  <TextField label="Port" name="smtpPort" type="number" defaultValue={String(shop.smtpPort)} autoComplete="off" />
                </InlineStack>
                <Checkbox label="TLS/SSL" name="smtpSecure" defaultChecked={shop.smtpSecure} />
                <TextField label="Brukernavn" name="smtpUser" defaultValue={shop.smtpUser} autoComplete="off" />
                <TextField label="Passord" name="smtpPass" type="password" autoComplete="new-password" placeholder="Latt tomt beholder eksisterende" />
                <TextField label="Fra-adresse" name="smtpFrom" type="email" defaultValue={shop.smtpFrom} autoComplete="email" />
                <Button submit loading={saving}>Lagre SMTP-config</Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
