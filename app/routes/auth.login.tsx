// app/routes/auth.login.tsx
// Required by @shopify/shopify-app-remix when unstable_newEmbeddedAuthStrategy is enabled.
// The SDK redirects unauthenticated requests to /auth/login; this route must call
// shopify.login() (not authenticate.admin()) to initiate the OAuth flow.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};
