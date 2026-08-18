"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyAppPassword,
} from "@/lib/session";

export type LoginState = { error?: string };

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAuthConfigured()) {
    return { error: "Inloggen is nog niet geconfigureerd." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !verifyAppPassword(password)) {
    return { error: "Onjuist wachtwoord." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
