// app/routes/app.customers.$id.tsx
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  Checkbox,
  Text,
  BlockStack,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { validateOrgNr, generatePeppolId } from "~/lib/validators";
import { audit } from "~/lib/audit.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const customer = await db.b2bCustomer.findFirst({
    where: { id: params.id, shopId: shop.id },
  });

  if (!customer) throw new Response("Customer not found", { status: 404 });

  return json({ customer });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save") {
    const orgNr = formData.get("orgNr") as string;

    if (!validateOrgNr(orgNr)) {
      return json({ error: "Ugyldig organisasjonsnummer (MOD11 feilet)" });
    }

    const peppolId = (formData.get("peppolParticipantId") as string) || generatePeppolId(orgNr);

    await db.b2bCustomer.update({
      where: { id: params.id, shopId: shop.id },
      data: {
        companyName: formData.get("companyName") as string,
        orgNr,
        invoiceEmail: formData.get("invoiceEmail") as string,
        peppolParticipantId: peppolId,
        reference: (formData.get("reference") as string) ?? "",
        paymentTermsDays: parseInt(formData.get("paymentTermsDays") as string, 10),
        kidFormat: formData.get("kidFormat") as "NONE" | "KID10" | "KID15",
        sendEmail: formData.get("sendEmail") === "on",
        sendEhf: formData.get("sendEhf") === "on",
      },
    });

    await audit({
      shopId: shop.id,
      action: "customer.updated",
      entityType: "b2bCustomer",
      entityId: params.id,
    });

    return redirect("/app/customers");
  }

  if (intent === "delete") {
    await db.b2bCustomer.update({
      where: { id: params.id, shopId: shop.id },
      data: { isActive: false },
    });
    return redirect("/app/customers");
  }

  return json({ error: "Unknown action" });
}

export default function CustomerEditPage() {
  const { customer } = useLoaderData<typeof loader>();

  return (
    <Page
      title={`Rediger: ${customer.companyName}`}
      backAction={{ content: "B2B Kunder", url: "/app/customers" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">B2B-profil</Text>

                <TextField
                  label="Firmanavn"
                  name="companyName"
                  defaultValue={customer.companyName}
                  autoComplete="organization"
                />
                <InlineStack gap="300">
                  <TextField
                    label="Organisasjonsnummer"
                    name="orgNr"
                    defaultValue={customer.orgNr}
                    autoComplete="off"
                  />
                  <TextField
                    label="Faktura e-post"
                    name="invoiceEmail"
                    type="email"
                    defaultValue={customer.invoiceEmail}
                    autoComplete="email"
                  />
                </InlineStack>
                <TextField
                  label="Peppol Participant ID"
                  name="peppolParticipantId"
                  defaultValue={customer.peppolParticipantId}
                  autoComplete="off"
                  placeholder="0192:123456789"
                />
                <TextField
                  label="Referanse / Bestiller"
                  name="reference"
                  defaultValue={customer.reference}
                  autoComplete="off"
                />
                <TextField
                  label="Betalingsbetingelser (dager)"
                  name="paymentTermsDays"
                  type="number"
                  defaultValue={String(customer.paymentTermsDays)}
                  autoComplete="off"
                />
                <Select
                  label="KID-format"
                  name="kidFormat"
                  value={customer.kidFormat}
                  options={[
                    { label: "Ingen KID", value: "NONE" },
                    { label: "KID-10", value: "KID10" },
                    { label: "KID-15", value: "KID15" },
                  ]}
                />
                <Checkbox
                  label="Send e-post"
                  name="sendEmail"
                  defaultChecked={customer.sendEmail}
                />
                <Checkbox
                  label="Send EHF via Peppol"
                  name="sendEhf"
                  defaultChecked={customer.sendEhf}
                />

                <InlineStack gap="300">
                  <Button submit variant="primary">Lagre endringer</Button>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <Button submit tone="critical" variant="plain">
                      Deaktiver profil
                    </Button>
                  </Form>
                </InlineStack>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
