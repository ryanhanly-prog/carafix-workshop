import { cn } from "@/lib/utils"

// Renders a single match-reason chip emitted by find_similar_quotes. Strong
// signals (damage tags, description, job type) get prominent styling; vehicle and
// recency are muted, so James's eye is drawn to why a quote is genuinely similar.
export function MatchReasonBadge({ reason }: { reason: string }) {
  let label = reason
  let tone: "muted" | "strong" | "green" | "recent" = "muted"

  if (reason === "vehicle_make") label = "make"
  else if (reason === "vehicle_model") label = "model"
  else if (reason.startsWith("damage_tags:")) {
    label = "damage: " + reason.slice("damage_tags:".length).split(",").join(", ")
    tone = "strong"
  } else if (reason === "description_match") {
    label = "description match"
    tone = "strong"
  } else if (reason.startsWith("job_type:")) {
    label = "job type: " + reason.slice("job_type:".length)
    tone = "green"
  } else if (reason === "job_type") {
    label = "job type"
    tone = "green"
  } else if (reason === "recent") {
    label = "12 months"
    tone = "recent"
  }

  const cls = {
    muted: "bg-muted text-muted-foreground",
    strong: "border border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
    green: "border border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    recent: "bg-muted text-muted-foreground",
  }[tone]

  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>
      {label}
    </span>
  )
}
