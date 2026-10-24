import { redirect } from "next/navigation";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";

export default async function Home() {
  // No session -> serverApi sends the visitor to /login.
  await serverApi.auth.session();
  redirect(routes.home);
}
