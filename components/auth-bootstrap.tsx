"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Adopt any session carried in the URL hash, on every page.
 *
 * A magic link redirects to /fr#access_token=... and pages that never create
 * the Supabase client (the marketing shell) silently drop it: a user who just
 * signed in lands on the same signed-out site they started on, which is how a
 * real sign-in looks like a dead end. Creating the client here runs the hash
 * detection on every route and persists the session, so the next navigation
 * finds it.
 */
export function AuthBootstrap() {
  useEffect(() => {
    const client = supabase();
    if (typeof client.auth.initialize === "function") {
      void client.auth.initialize();
    } else {
      void client.auth.getSession();
    }
  }, []);
  return null;
}
