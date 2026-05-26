"use server"

import JSZip from "jszip"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { KNOWN_CSV_FILES } from "@/lib/import/mechanic-desk"
import { runImport, type ImportFile } from "@/lib/import/run-import"

export type ImportActionResult = {
  ok: boolean
  batchId?: string
  message?: string
  totals?: { inserted: number; updated: number; failed: number }
}

const KNOWN_BASENAMES = new Set(Object.keys(KNOWN_CSV_FILES))

// Pull every known CSV out of a single Mechanic Desk export ZIP.
async function extractCsvs(buffer: ArrayBuffer): Promise<ImportFile[]> {
  const zip = await JSZip.loadAsync(buffer)
  const out: ImportFile[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const base = entry.name.split("/").pop() ?? entry.name
    if (!KNOWN_BASENAMES.has(base)) continue
    const content = await entry.async("string")
    out.push({ name: base, content })
  }
  return out
}

export async function importMechanicDeskZip(
  formData: FormData
): Promise<ImportActionResult> {
  const supabase = await createClient()

  // Always verify auth inside the action (it is reachable via direct POST).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { data: profile } = await supabase
    .from("app_users")
    .select("organisation_id")
    .eq("id", user.id)
    .single()
  const organisationId = profile?.organisation_id
  if (!organisationId) return { ok: false, message: "No organisation for user." }

  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File)
  if (uploads.length === 0) return { ok: false, message: "No files uploaded." }

  // Open the batch record up front so it is visible (as 'processing') while the
  // work runs and survives a failure as an audit trail.
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      organisation_id: organisationId,
      source: "mechanic_desk",
      uploaded_by: user.id,
      status: "processing",
      files_uploaded: uploads.map((f) => f.name),
    })
    .select("id")
    .single()
  if (batchError || !batch) {
    return { ok: false, message: `Could not start import: ${batchError?.message}` }
  }

  try {
    const files: ImportFile[] = []
    for (const upload of uploads) {
      const buf = await upload.arrayBuffer()
      files.push(...(await extractCsvs(buf)))
    }
    if (files.length === 0) {
      throw new Error("No recognised Mechanic Desk CSVs found in the uploaded ZIP(s).")
    }

    const result = await runImport(supabase, organisationId, files)

    await supabase
      .from("import_batches")
      .update({
        status: "completed",
        stats: result.stats as unknown as Record<string, unknown>,
        rows_inserted: result.totals.inserted,
        rows_updated: result.totals.updated,
        rows_failed: result.totals.failed,
        error_message:
          result.dbErrors.length > 0 ? result.dbErrors.slice(0, 5).join("; ") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id)

    revalidatePath("/imports")
    revalidatePath("/parts/catalogue")
    revalidatePath("/parts/suppliers")
    return { ok: true, batchId: batch.id, totals: result.totals }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from("import_batches")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", batch.id)
    revalidatePath("/imports")
    return { ok: false, batchId: batch.id, message }
  }
}
