import { formatDate, formatMoney } from "@/lib/format"
import type { QuoteOutputModel } from "@/lib/quote-output"

/**
 * Customer-facing quote document, HTML version. Mirrors the PDF document
 * built in commit 4 — same view-model in, same numbers out. Hides cost,
 * markup, and unit cost columns; shows section dividers as full-row bold
 * subheadings (no number / no totals); labour lines append the
 * "(N hrs @ $rate/hr)" suffix to the stored description verbatim.
 */
export function CustomerDocHtml({ model }: { model: QuoteOutputModel }) {
  const { workshop, quote, customer, vehicle, insurer, lines, totals } = model
  const vehicleLine = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ")
  const footerContact = [workshop.phone, workshop.email].filter(Boolean).join(" · ")
  return (
    <article className="mx-auto max-w-3xl bg-white px-10 py-12 text-sm leading-relaxed text-neutral-900">
      <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{workshop.name}</h1>
          {workshop.abn && (
            <p className="mt-1 text-xs text-neutral-600">ABN {workshop.abn}</p>
          )}
        </div>
        <address className="not-italic text-right text-xs text-neutral-600">
          {workshop.address && <p>{workshop.address}</p>}
          {workshop.phone && <p>{workshop.phone}</p>}
          {workshop.email && <p>{workshop.email}</p>}
        </address>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Quote
          </h2>
          <p className="mt-1 text-base font-semibold">{quote.quoteNumber ?? "—"}</p>
          <p className="text-xs text-neutral-600">Issued {formatDate(quote.dateIssued)}</p>
          <p className="text-xs capitalize text-neutral-600">
            Status: {quote.status.replace(/_/g, " ")}
          </p>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Bill to
          </h2>
          <p className="mt-1 font-medium">{customer?.name ?? "—"}</p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Vehicle
          </h2>
          <p className="mt-1">
            {vehicleLine || "—"}
            {vehicle?.rego ? (
              <span className="text-neutral-600"> · {vehicle.rego}</span>
            ) : null}
          </p>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Job
          </h2>
          <p className="mt-1">{quote.jobTypeName ?? "—"}</p>
          {insurer && (
            <p className="text-xs text-neutral-600">Insurer: {insurer.name}</p>
          )}
        </div>
      </section>

      {quote.description && (
        <section className="mt-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Description
          </h2>
          <p className="mt-1 whitespace-pre-wrap">{quote.description}</p>
        </section>
      )}

      <section className="mt-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              <th className="w-10 py-2 text-left">#</th>
              <th className="py-2 text-left">Description</th>
              <th className="w-20 py-2 text-right">Quantity</th>
              <th className="w-28 py-2 text-right">Unit price</th>
              <th className="w-28 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No line items
                </td>
              </tr>
            ) : (
              lines.map((l, i) =>
                l.isDivider ? (
                  <tr key={i}>
                    <td
                      colSpan={5}
                      className="border-b border-neutral-200 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-neutral-700"
                    >
                      {l.description}
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="border-b border-neutral-100 align-top">
                    <td className="py-2 text-neutral-500">{l.displayNumber}</td>
                    <td className="py-2">
                      {l.description}
                      {l.labourSuffix && (
                        <span className="text-neutral-600">{l.labourSuffix}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {l.quantity == null ? "—" : l.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(l.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatMoney(l.lineTotal)}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs text-sm">
          <div className="flex justify-between py-1">
            <dt className="text-neutral-600">Parts</dt>
            <dd className="tabular-nums">{formatMoney(totals.parts)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-neutral-600">Labour</dt>
            <dd className="tabular-nums">{formatMoney(totals.labour)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-neutral-600">Consumables</dt>
            <dd className="tabular-nums">{formatMoney(totals.consumables)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-neutral-600">Other</dt>
            <dd className="tabular-nums">{formatMoney(totals.other)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-600">
        <p>This quote is valid for 30 days from the date issued.</p>
      </section>

      <section className="mt-4 text-xs text-neutral-600">
        <h2 className="font-semibold text-neutral-700">Terms</h2>
        {/* Hardcoded for v1 (per plan); editable terms move to org/location
            settings in a future step. */}
        <p className="mt-1">
          Payment due within 14 days of invoice. Parts subject to availability;
          equivalent substitutions may be required where stock is unavailable.
          Prices include GST where applicable. Acceptance of this quote
          authorises the workshop to proceed with the described work. Any
          additional work identified during repair will be quoted separately
          before commencement.
        </p>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-300 pt-4 text-xs text-neutral-600">
        <div>
          <p className="font-medium text-neutral-700">
            {workshop.name}
            {workshop.abn ? ` · ABN ${workshop.abn}` : ""}
          </p>
          {workshop.locationName && <p>{workshop.locationName}</p>}
        </div>
        <div className="text-right">
          {workshop.address && <p>{workshop.address}</p>}
          {footerContact && <p>{footerContact}</p>}
        </div>
      </footer>
    </article>
  )
}
