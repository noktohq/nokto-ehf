// app/routes/app.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { isBillingActive } from "~/lib/billing/shopify-billing.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true, billingPlanActive: true, subscriptionStatus: true, trialEndsAt: true },
  });

  const billingActive = shop ? await isBillingActive(shop.id) : false;

  return json({
    apiKey: process.env.SHOPIFY_API_KEY!,
    billingActive,
  });
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/invoices">Fakturaer</Link>
        <Link to="/app/customers">B2B Kunder</Link>
        <Link to="/app/orders">Ordrer</Link>
        <Link to="/app/settings">Innstillinger</Link>
        <Link to="/app/billing">Abonnement</Link>
        <Link to="/app/logs">Logger</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return boundary.error(error);
}

export const headers = boundary.headers;
