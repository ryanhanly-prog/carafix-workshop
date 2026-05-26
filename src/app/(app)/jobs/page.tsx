import { Suspense } from "react"

import { JobsView } from "@/components/jobs/jobs-view"

export default function JobsPage() {
  return (
    <Suspense>
      <JobsView />
    </Suspense>
  )
}
