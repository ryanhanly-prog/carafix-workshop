import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatDate, formatMoney } from "@/lib/format"
import type { QuoteOutputModel } from "@/lib/quote-output"

// react-pdf primitives are NOT DOM elements; this is a parallel render tree
// that consumes the same QuoteOutputModel as customer-doc-html.tsx so the
// figures in front of the customer can never drift between screen and print.
// v1 uses the built-in Helvetica family — no font registration needed.

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingVertical: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#262626",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  workshopName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  abn: { fontSize: 8, color: "#525252", marginTop: 2 },
  contactBlock: { alignItems: "flex-end" },
  contactLine: { fontSize: 8, color: "#525252", marginBottom: 1 },

  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#737373",
    letterSpacing: 0.4,
  },
  metaRow: { flexDirection: "row", marginTop: 14 },
  metaCol: { flexBasis: "50%", paddingRight: 12 },
  metaValueLg: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 },
  metaValue: { fontSize: 10, marginTop: 3 },
  metaSub: { fontSize: 8, color: "#525252", marginTop: 1 },

  description: { marginTop: 14 },
  descriptionText: { marginTop: 3, fontSize: 10, lineHeight: 1.4 },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
    paddingVertical: 5,
    marginTop: 18,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#737373",
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    paddingVertical: 4,
  },
  // Customer line columns. Total widths sum to 100%.
  colNum: { width: "6%" },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "16%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },

  tdNum: { color: "#737373" },
  tdTotal: { fontFamily: "Helvetica-Bold" },
  labourSuffix: { color: "#525252" },

  divider: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingTop: 10,
    paddingBottom: 4,
  },
  dividerText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
    color: "#404040",
  },

  totals: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end" },
  totalsTable: { width: 220 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: { color: "#525252" },
  totalsGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
  },
  totalsGrandText: { fontFamily: "Helvetica-Bold", fontSize: 12 },

  validity: {
    marginTop: 28,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    fontSize: 9,
    color: "#525252",
  },
  terms: { marginTop: 10, fontSize: 9, color: "#525252", lineHeight: 1.5 },
  termsHeading: {
    fontFamily: "Helvetica-Bold",
    color: "#404040",
    marginBottom: 2,
  },

  footer: {
    marginTop: 22,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#525252",
  },
  footerName: { fontFamily: "Helvetica-Bold", color: "#404040" },
  footerRight: { alignItems: "flex-end" },
})

// Hardcoded customer-facing terms for v1 (per plan). Editable terms move to
// an organisations.terms_text column + settings UI in a future step.
const TERMS =
  "Payment due within 14 days of invoice. Parts subject to availability; " +
  "equivalent substitutions may be required where stock is unavailable. " +
  "Prices include GST where applicable. Acceptance of this quote authorises " +
  "the workshop to proceed with the described work. Any additional work " +
  "identified during repair will be quoted separately before commencement."

export function CustomerDocPdf({ model }: { model: QuoteOutputModel }) {
  const { workshop, quote, customer, vehicle, insurer, lines, totals } = model
  const vehicleLine = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(" ")
  const footerContact = [workshop.phone, workshop.email].filter(Boolean).join(" · ")
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.workshopName}>{workshop.name}</Text>
            {workshop.abn ? <Text style={s.abn}>ABN {workshop.abn}</Text> : null}
          </View>
          <View style={s.contactBlock}>
            {workshop.address ? (
              <Text style={s.contactLine}>{workshop.address}</Text>
            ) : null}
            {workshop.phone ? (
              <Text style={s.contactLine}>{workshop.phone}</Text>
            ) : null}
            {workshop.email ? (
              <Text style={s.contactLine}>{workshop.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.sectionLabel}>QUOTE</Text>
            <Text style={s.metaValueLg}>{quote.quoteNumber ?? "—"}</Text>
            <Text style={s.metaSub}>Issued {formatDate(quote.dateIssued)}</Text>
            <Text style={s.metaSub}>
              Status: {quote.status.replace(/_/g, " ")}
            </Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.sectionLabel}>BILL TO</Text>
            <Text style={s.metaValue}>{customer?.name ?? "—"}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.sectionLabel}>VEHICLE</Text>
            <Text style={s.metaValue}>
              {vehicleLine || "—"}
              {vehicle?.rego ? ` · ${vehicle.rego}` : ""}
            </Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.sectionLabel}>JOB</Text>
            <Text style={s.metaValue}>{quote.jobTypeName ?? "—"}</Text>
            {insurer ? (
              <Text style={s.metaSub}>Insurer: {insurer.name}</Text>
            ) : null}
          </View>
        </View>

        {quote.description ? (
          <View style={s.description}>
            <Text style={s.sectionLabel}>DESCRIPTION</Text>
            <Text style={s.descriptionText}>{quote.description}</Text>
          </View>
        ) : null}

        <View style={s.tableHead}>
          <Text style={[s.th, s.colNum]}>#</Text>
          <Text style={[s.th, s.colDesc]}>DESCRIPTION</Text>
          <Text style={[s.th, s.colQty]}>QUANTITY</Text>
          <Text style={[s.th, s.colPrice]}>UNIT PRICE</Text>
          <Text style={[s.th, s.colTotal]}>LINE TOTAL</Text>
        </View>

        {lines.length === 0 ? (
          <View style={s.tr}>
            <Text>No line items</Text>
          </View>
        ) : (
          lines.map((l, i) =>
            l.isDivider ? (
              <View key={i} style={s.divider}>
                <Text style={s.dividerText}>{l.description}</Text>
              </View>
            ) : (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.colNum, s.tdNum]}>{l.displayNumber}</Text>
                <View style={s.colDesc}>
                  <Text>
                    {l.description}
                    {l.labourSuffix ? (
                      <Text style={s.labourSuffix}>{l.labourSuffix}</Text>
                    ) : null}
                  </Text>
                </View>
                <Text style={s.colQty}>{l.quantity == null ? "—" : l.quantity}</Text>
                <Text style={s.colPrice}>{formatMoney(l.unitPrice)}</Text>
                <Text style={[s.colTotal, s.tdTotal]}>
                  {formatMoney(l.lineTotal)}
                </Text>
              </View>
            ),
          )
        )}

        <View style={s.totals}>
          <View style={s.totalsTable}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Parts</Text>
              <Text>{formatMoney(totals.parts)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Labour</Text>
              <Text>{formatMoney(totals.labour)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Consumables</Text>
              <Text>{formatMoney(totals.consumables)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Other</Text>
              <Text>{formatMoney(totals.other)}</Text>
            </View>
            <View style={s.totalsGrand}>
              <Text style={s.totalsGrandText}>Total</Text>
              <Text style={s.totalsGrandText}>{formatMoney(totals.total)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.validity}>
          This quote is valid for 30 days from the date issued.
        </Text>

        <View style={s.terms}>
          <Text style={s.termsHeading}>Terms</Text>
          <Text>{TERMS}</Text>
        </View>

        <View style={s.footer}>
          <View>
            <Text style={s.footerName}>
              {workshop.name}
              {workshop.abn ? ` · ABN ${workshop.abn}` : ""}
            </Text>
            {workshop.locationName ? <Text>{workshop.locationName}</Text> : null}
          </View>
          <View style={s.footerRight}>
            {workshop.address ? <Text>{workshop.address}</Text> : null}
            {footerContact ? <Text>{footerContact}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}
