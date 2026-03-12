// app/routes/app.customers.tsx
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Link,
  Modal,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Select,
  Checkbox,
  Banner,
  EmptyState,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { validateOrgNr, generatePeppolId } from "~/lib/validators";
import { audit } from "~/lib/audit.server";
import { z } from "zod";

const CustomerSchema = z.object({
  shopifyCustomerId: z.string().min(1),
  companyName: z.string().min(1),
  orgNr: z.string().regex(/^\d{9}$/),
  invoiceEmail: z.string().email(),
  peppolParticipantId: z.string().optional(),
  reference: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(1).max(365),
  kidFormat: z.enum(["NONE", "KID10", "KID15"]),
  sendEmail: z.coerce.boolean(),
  sendEhf: z.coerce.boolean(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ customers: [], error: null });

  const customers = await db.b2BCustomer.findMany({
    where: { shopId: shop.id, isActive: true },
    orderBy: { companyName: "asc" },
  });

  return json({ customers, error: null });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "upsert") {
    const raw = {
      shopifyCustomerId: formData.get("shopifyCustomerId"),
      companyName: formData.get("companyName"),
      orgNr: formData.get("orgNr"),
      invoiceEmail: formData.get("invoiceEmail"),
      peppolParticipantId: formData.get("peppolParticipantId") ?? "",
      reference: formData.get("reference") ?? "",
      paymentTermsDays: formData.get("paymentTermsDays"),
      kidFormat: formData.get("kidFormat"),
      sendEmail: formData.get("sendEmail") === "on" ? "true" : "false",
      sendEhf: formData.get("sendEhf") === "on" ? "true" : "false",
    };

    const parsed = CustomerSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }

    const data = parsed.data;

    // Validate orgNr
    if (!validateOrgNr(data.orgNr)) {
      return json({ error: "Ugyldig organisasjonsnummer (MOD11 feilet)" });
    }

    // Auto-generate Peppol ID if not set
    const peppolId = data.peppolParticipantId || generatePeppolId(data.orgNr);

    const customerId = `gid://shopify/Customer/${data.shopifyCustomerId.replace(/\D/g, "")}`;

    await db.b2BCustomer.upsert({
      where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: customerId } },
      update: {
        companyName: data.companyName,
        orgNr: data.orgNr,
        invoiceEmail: data.invoiceEmail,
        peppolParticipantId: peppolId,
        reference: data.reference ?? "",
        paymentTermsDays: data.paymentTermsDays,
        kidFormat: data.kidFormat,
        sendEmail: data.sendEmail,
        sendEhf: data.sendEhf,
      },
      create: {
        shopId: shop.id,
        shopifyCustomerId: customerId,
        companyName: data.companyName,
        orgNr: data.orgNr,
        invoiceEmail: data.invoiceEmail,
        peppolParticipantId: peppolId,
        reference: data.reference ?? "",
        paymentTermsDays: data.paymentTermsDays,
        kidFormat: data.kidFormat,
        sendEmail: data.sendEmail,
        sendEhf: data.sendEhf,
      },
    });

    await audit({
      shopId: shop.id,
      action: "customer.upsert",
      entityType: "b2bCustomer",
      details: { companyName: data.companyName, orgNr: data.orgNr },
    });

    return json({ error: null });
  }

  if (intent === "delete") {
    const customerId = formData.get("customerId") as string;
    await db.b2BCustomer.update({
      where: { id: customerId, shopId: shop.id },
      data: { isActive: false },
    });
    return json({ error: null });
  }

  return json({ error: "Unknown action" });
}

export default function CustomersPage() {
  const { customers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showModal, setShowModal] = useState(false);

  const rows = customers.map((c) => [
    c.companyName,
    c.orgNr,
    c.invoiceEmail,
    c.peppolParticipantId || "—",
    `${c.paymentTermsDays} dager`,
    <Link key={`edit-${c.id}`} url={`/app/customers/${c.id}`}>Rediger</Link>,
  ]);

  return (
    <Page
      title="B2B Kunder"
      primaryAction={{ content: "Legg til B2B-profil", onAction: () => setShowModal(true) }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">{actionData.error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {customers.length === 0 ? (
            <EmptyState
              heading="Ingen B2B-kunder ennå"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Legg til B2B-profil", onAction: () => setShowModal(true) }}
            >
              <p>Opprett B2B-profiler for kunder som skal motta EHF-faktura.</p>
            </EmptyState>
          ) : (
            <Card>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                headings={["Firma", "Org.nr", "E-post", "Peppol ID", "Betalingsfrist", ""]}
                rows={rows}
              />
            </Card>
          )}
        </Layout.Section>
      </Layout>

      <AddCustomerModal open={showModal} onClose={() => setShowModal(false)} />
    </Page>
  );
}

type BrregStatus = "idle" | "loading" | "found" | "not-found";

function AddCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [orgNr, setOrgNr] = useState("");
  const [orgNrError, setOrgNrError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [peppolId, setPeppolId] = useState("");
  const [brregStatus, setBrregStatus] = useState<BrregStatus>("idle");

  const handleOrgNrChange = async (val: string) => {
    setOrgNr(val);
    setOrgNrError("");
    if (val.length !== 9) { setBrregStatus("idle"); return; }
    if (!validateOrgNr(val)) { setOrgNrError("Ugyldig organisasjonsnummer"); return; }

    setBrregStatus("loading");
    try {
      const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${val}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyName(data.navn ?? "");
        setPeppolId(`0192:${val}`);
        setBrregStatus("found");
      } else {
        setBrregStatus("not-found");
      }
    } catch {
      setBrregStatus("not-found");
    }
  };

  const brregHelpText =
    brregStatus === "loading" ? "Henter fra Brønnøysundregistrene…" :
    brregStatus === "found"   ? "✓ Hentet fra Brønnøysundregistrene" :
    brregStatus === "not-found" ? "Fant ikke selskapet i Brønnøysundregistrene" : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Legg til B2B-profil"
      primaryAction={{ content: "Lagre", submit: true }}
      secondaryActions={[{ content: "Avbryt", onAction: onClose }]}
    >
      <Modal.Section>
        <Form method="post">
          <input type="hidden" name="intent" value="upsert" />
          <BlockStack gap="300">
            <TextField
              label="Shopify Customer ID"
              name="shopifyCustomerId"
              autoComplete="off"
              placeholder="123456789"
              helpText="Finn i Shopify Admin under Kunder"
            />
            <TextField
              label="Organisasjonsnummer"
              name="orgNr"
              value={orgNr}
              onChange={handleOrgNrChange}
              error={orgNrError}
              helpText={brregHelpText}
              autoComplete="off"
              placeholder="123456789"
            />
            <TextField
              label="Firmanavn"
              name="companyName"
              value={companyName}
              onChange={setCompanyName}
              autoComplete="organization"
            />
            <TextField label="Faktura e-post" name="invoiceEmail" type="email" autoComplete="email" />
            <TextField
              label="Peppol Participant ID"
              name="peppolParticipantId"
              value={peppolId}
              onChange={setPeppolId}
              autoComplete="off"
              placeholder="0192:123456789"
              helpText="Auto-fylt fra org.nr via Brønnøysundregistrene"
            />
            <TextField
              label="Referanse / Bestiller"
              name="reference"
              autoComplete="off"
            />
            <TextField
              label="Betalingsbetingelser (dager)"
              name="paymentTermsDays"
              type="number"
              autoComplete="off"
              defaultValue="14"
            />
            <Select
              label="KID-format"
              name="kidFormat"
              options={[
                { label: "Ingen KID", value: "NONE" },
                { label: "KID-10", value: "KID10" },
                { label: "KID-15", value: "KID15" },
              ]}
            />
            <Checkbox label="Send e-post" name="sendEmail" />
            <Checkbox label="Send EHF via Peppol" name="sendEhf" />
          </BlockStack>
        </Form>
      </Modal.Section>
    </Modal>
  );
}
