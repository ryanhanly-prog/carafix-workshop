import { formatDate, formatMoney } from "@/lib/format"
import type { QuoteOutputModel } from "@/lib/quote-output"

/**
 * Workshop-internal view of a quote. Same data as the customer view PLUS
 * cost / markup / unit_price / margin columns and an audit block at the
 * bottom (created by, created/updated timestamps, status). No customer-facing
 * terms or validity statement. An "INTERNAL USE ONLY" banner sits at the top
 * to prevent accidental hand-off to a customer.
 */
export function WorkshopDocHtml({ model }: { model: QuoteOutputModel }) {
  const { workshop, quote, customer, vehicle, insurer, audit, lines, totals } = model
  const vehicleLine = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ")
  const footerContact = [workshop.phone, workshop.email].filter(Boolean).join(" · ")
  const marginPctDisplay =
    totals.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`

  return (
    <article className="mx-auto max-w-6xl bg-white px-10 py-12 text-sm leading-relaxed text-neutral-900">
      <div className="mb-6 border border-red-300 bg-red-50 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-700">
        Internal use only — not for customer
      </div>

      <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Workshop Internal
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Quote {quote.quoteNumber ?? "—"}
          </h1>
          <p className="mt-1 text-xs text-neutral-600">
            {workshop.name}
            {workshop.abn ? ` · ABN ${workshop.abn}` : ""}
          </p>
        </div>
        <address className="not-italic text-right text-xs text-neutral-600">
          {workshop.locationName && (
            <p className="font-medium text-neutral-700">{workshop.locationName}</p>
          )}
          {workshop.address && <p>{workshop.address}</p>}
          {workshop.phone && <p>{workshop.phone}</p>}
          {workshop.email && <p>{workshop.email}</p>}
        </address>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-6">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Customer
          </h2>
          <p className="mt-1 font-medium">{customer?.name ?? "—"}</p>
        </div>
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
            <p className="text-xs text-neutral-600">
              Insurer: {insurer.name}
              {insurer.cappedLabourRate != null
                ? ` · capped $${insurer.cappedLabourRate}/hr`
                : ""}
            </p>
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

      <section className="mt-8 -mx-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-300 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Description</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-left">Unit</th>
              <th className="px-2 py-2 text-right">Unit cost</th>
              <th className="px-2 py-2 text-right">Markup %</th>
              <th className="px-2 py-2 text-right">Unit price</th>
              <th className="px-2 py-2 text-right">Line total</th>
              <th className="px-2 py-2 text-right">Margin $</th>
              <th className="px-2 py-2 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-neutral-500">
                  No line items
                </td>
              </tr>
            ) : (
              lines.map((l, i) =>
                l.isDivider ? (
                  <tr key={i}>
                    <td
                      colSpan={11}
                      className="border-b border-neutral-200 px-2 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-neutral-700"
                    >
                      {l.description}
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="border-b border-neutral-100 align-top">
                    <td className="px-2 py-2 text-neutral-500">{l.displayNumber}</td>
                    <td className="px-2 py-2">
                      {l.description}
                      {l.labourSuffix && (
                        <span className="text-neutral-600">{l.labourSuffix}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 capitalize text-neutral-600">
                      {l.lineType}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.quantity == null ? "—" : l.quantity}
                    </td>
                    <td className="px-2 py-2 text-neutral-600">{l.unit ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(l.unitCost)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.markupPct == null ? "—" : `${l.markupPct}%`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(l.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {formatMoney(l.lineTotal)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(l.marginDollars)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                      {l.marginPct == null ? "—" : `${l.marginPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-end">
        <dl className="w-full max-w-sm text-sm">
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
          <div className="mt-2 flex justify-between border-t border-dashed border-neutral-300 pt-2 text-sm">
            <dt className="text-neutral-700">Margin $</dt>
            <dd className="tabular-nums">{formatMoney(totals.marginDollars)}</dd>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <dt className="text-neutral-700">Margin %</dt>
            <dd className="tabular-nums">{marginPctDisplay}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-6 border-t border-neutral-300 pt-4 text-xs text-neutral-600">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Audit
          </h2>
          <p className="mt-1">
            <span className="text-neutral-500">Created by: </span>
            {audit.createdByName ?? "—"}
          </p>
          <p>
            <span className="text-neutral-500">Created: </span>
            {formatDate(audit.createdAt)}
          </p>
          <p>
            <span className="text-neutral-500">Last modified: </span>
            {formatDate(audit.updatedAt)}
          </p>
          <p className="capitalize">
            <span className="text-neutral-500">Status: </span>
            {audit.status.replace(/_/g, " ")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium text-neutral-700">{workshop.name}</p>
          {workshop.locationName && <p>{workshop.locationName}</p>}
          {workshop.address && <p>{workshop.address}</p>}
          {footerContact && <p>{footerContact}</p>}
        </div>
      </section>
    </article>
  )
}
