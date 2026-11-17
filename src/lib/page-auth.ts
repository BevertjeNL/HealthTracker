import { redirect } from "next/navigation";
import { hasAuthenticatedSession } from "@/lib/session-server";

/** Authorize the page before its Server Component reads private data. */
export async function requirePageSession() {
  if (!(await hasAuthenticatedSession())) redirect("/login");
}
