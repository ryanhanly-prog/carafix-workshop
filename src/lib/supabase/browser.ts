"use client"

import { createClient } from "@/lib/supabase/client"

let client: ReturnType<typeof createClient> | undefined

/** Single browser Supabase client shared across hooks (avoids multiple GoTrue instances). */
export function getBrowserClient() {
  if (!client) {
    client = createClient()
  }
  return client
}
