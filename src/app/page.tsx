import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getAppSession();
  if (session && session.tenantKey) {
    redirect(`/${session.tenantKey}/planning`);
  }
  redirect("/authenticating");
}

