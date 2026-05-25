"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type LoginResult = { error: string } | undefined

export async function login(values: {
  email: string
  password: string
}): Promise<LoginResult> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: values.email,
    password: values.password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect("/")
}
