import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatDate, formatMoney } from "@/lib/format"
import type { QuoteOutputModel } from "@/lib/quote-output"

// Workshop-internal PDF. Mirrors workshop-doc-html.tsx exactly so screen and
// print never disagree on margin or audit detail. A4 *landscape* — eleven
// columns is too wide for portrait.

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 30,
    paddingVertical: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#262626",
  },
  banner: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    textAlign: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  internalKicker: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#737373",
    letterSpacing: 0.4,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  workshopLine: { fontSize: 8, color: "#525252", marginTop: 2 },
  contactBlock: { alignItems: "flex-end" },
  contactLine: { fontSize: 8, color: "#525252", marginBottom: 1 },
  locationLine: { fontSize: 8, color: "#404040", fontFamily: "Helvetica-Bold" },

  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#737373",
    letterSpacing: 0.4,
  },
  metaRow: { flexDirection: "row", marginTop: 12 },
  metaCol: { flexBasis: "33.33%", paddingRight: 12 },
  metaValue: { fontSize: 10, marginTop: 3 },
  metaSub: { fontSize: 8, color: "#525252", marginTop: 1 },

  description: { marginTop: 12 },
  descriptionText: { marginTop: 3, fontSize: 9, lineHeight: 1.4 },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
    paddingVertical: 5,
    marginTop: 14,
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
    paddingVertical: 3,
  },
  // Landscape widths — sum to 100%.
  colNum: { width: "4%", paddingHorizontal: 2 },
  colDesc: { width: "22%", paddingHorizontal: 2 },
  colType: { width: "8%", paddingHorizontal: 2 },
  colQty: { width: "6%", paddingHorizontal: 2, textAlign: "right" },
  colUnit: { width: "6%", paddingHorizontal: 2 },
  colUnitCost: { width: "9%", paddingHorizontal: 2, textAlign: "right" },
  colMarkup: { width: "7%", paddingHorizontal: 2, textAlign: "right" },
  colUnitPrice: { width: "9%", paddingHorizontal: 2, textAlign: "right" },
  colLineTotal: { width: "9%", paddingHorizontal: 2, textAlign: "right" },
  colMarginDollars: { width: "10%", paddingHorizontal: 2, textAlign: "right" },
  colMarginPct: { width: "10%", paddingHorizontal: 2, textAlign: "right" },

  tdMuted: { color: "#737373" },
  tdBold: { fontFamily: "Helvetica-Bold" },
  labourSuffix: { color: "#525252" },

  divider: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  dividerText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
    color: "#404040",
  },

  totals: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totalsTable: { width: 240 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: { color: "#525252" },
  totalsGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 5,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
  },
  totalsGrandText: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  marginBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
    borderStyle: "dashed",
  },
  marginLabel: { color: "#404040" },

  auditRow: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#525252",
  },
  auditCol: { flexBasis: "50%" },
  auditLineMuted: { color: "#737373" },
  auditRight: { alignItems: "flex-end" },
  auditNameLine: { fontFamily: "Helvetica-Bold", color: "#404040" },
})

export function WorkshopDocPdf({ model }: { model: QuoteOutputModel }) {
  const { workshop, quote, customer, vehicle, insurer, audit, lines, totals } = model
  const vehicleLine = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(" ")
  const footerContact = [workshop.phone, workshop.email].filter(Boolean).join(" · ")
  const marginPctDisplay =
    totals.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.banner}>INTERNAL USE ONLY — NOT FOR CUSTOMER</Text>

        <View style={s.headerRow}>
          <View>
            <Text style={s.internalKicker}>WORKSHOP INTERNAL</Text>
            <Text style={s.title}>Quote {quote.quoteNumber ?? "—"}</Text>
            <Text style={s.workshopLine}>
              {workshop.name}
              {workshop.abn ? ` · ABN ${workshop.abn}` : ""}
            </Text>
          </View>
          <View style={s.contactBlock}>
            {workshop.locationName ? (
              <Text style={s.locationLine}>{workshop.locationName}</Text>
            ) : null}
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
            <Text style={s.sectionLabel}>CUSTOMER</Text>
            <Text style={s.metaValue}>{customer?.name ?? "—"}</Text>
          </View>
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
              <Text style={s.metaSub}>
                Insurer: {insurer.name}
                {insurer.cappedLabourRate != null
                  ? ` · capped $${insurer.cappedLabourRate}/hr`
                  : ""}
              </Text>
            ) : null}
            <Text style={s.metaSub}>
              Issued {formatDate(quote.dateIssued)}
              {" · Status: "}
              {quote.status.replace(/_/g, " ")}
            </Text>
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
          <Text style={[s.th, s.colType]}>TYPE</Text>
          <Text style={[s.th, s.colQty]}>QTY</Text>
          <Text style={[s.th, s.colUnit]}>UNIT</Text>
          <Text style={[s.th, s.colUnitCost]}>UNIT COST</Text>
          <Text style={[s.th, s.colMarkup]}>MARKUP %</Text>
          <Text style={[s.th, s.colUnitPrice]}>UNIT PRICE</Text>
          <Text style={[s.th, s.colLineTotal]}>LINE TOTAL</Text>
          <Text style={[s.th, s.colMarginDollars]}>MARGIN $</Text>
          <Text style={[s.th, s.colMarginPct]}>MARGIN %</Text>
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
                <Text style={[s.colNum, s.tdMuted]}>{l.displayNumber}</Text>
                <View style={s.colDesc}>
                  <Text>
                    {l.description}
                    {l.labourSuffix ? (
                      <Text style={s.labourSuffix}>{l.labourSuffix}</Text>
                    ) : null}
                  </Text>
                </View>
                <Text style={[s.colType, s.tdMuted]}>{l.lineType}</Text>
                <Text style={s.colQty}>{l.quantity == null ? "—" : l.quantity}</Text>
                <Text style={[s.colUnit, s.tdMuted]}>{l.unit ?? "—"}</Text>
                <Text style={s.colUnitCost}>{formatMoney(l.unitCost)}</Text>
                <Text style={s.colMarkup}>
                  {l.markupPct == null ? "—" : `${l.markupPct}%`}
                </Text>
                <Text style={s.colUnitPrice}>{formatMoney(l.unitPrice)}</Text>
                <Text style={[s.colLineTotal, s.tdBold]}>
                  {formatMoney(l.lineTotal)}
                </Text>
                <Text style={s.colMarginDollars}>
                  {formatMoney(l.marginDollars)}
                </Text>
                <Text style={[s.colMarginPct, s.tdMuted]}>
                  {l.marginPct == null ? "—" : `${l.marginPct.toFixed(1)}%`}
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
            <View style={s.marginBlock}>
              <Text style={s.marginLabel}>Margin $</Text>
              <Text>{formatMoney(totals.marginDollars)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.marginLabel}>Margin %</Text>
              <Text>{marginPctDisplay}</Text>
            </View>
          </View>
        </View>

        <View style={s.auditRow}>
          <View style={s.auditCol}>
            <Text>
              <Text style={s.auditLineMuted}>Created by: </Text>
              {audit.createdByName ?? "—"}
            </Text>
            <Text>
              <Text style={s.auditLineMuted}>Created: </Text>
              {formatDate(audit.createdAt)}
            </Text>
            <Text>
              <Text style={s.auditLineMuted}>Last modified: </Text>
              {formatDate(audit.updatedAt)}
            </Text>
            <Text>
              <Text style={s.auditLineMuted}>Status: </Text>
              {audit.status.replace(/_/g, " ")}
            </Text>
          </View>
          <View style={[s.auditCol, s.auditRight]}>
            <Text style={s.auditNameLine}>{workshop.name}</Text>
            {workshop.locationName ? <Text>{workshop.locationName}</Text> : null}
            {workshop.address ? <Text>{workshop.address}</Text> : null}
            {footerContact ? <Text>{footerContact}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}
