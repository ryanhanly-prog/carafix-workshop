export function PageStub({
  title,
  description = "This section is coming in a later build step.",
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
