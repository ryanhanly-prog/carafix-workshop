// Mechanic Desk CSV parsers.
//
// These are pure functions: CSV text in, typed rows + structured errors out. No
// database access here so they can be unit-tested and reused by the import
// orchestrator and the self-test harness alike.
//
// Parsing rules baked in (from real Mechanic Desk exports):
//  - Dates are DD/MM/YYYY; timestamps are DD/MM/YYYY HH:mm (a few system columns
//    use ISO "YYYY-MM-DD HH:mm:ss +1000"). Invalid dates become a ParseError, not
//    a silent null.
//  - Numbers: empty string -> null (NEVER 0). "0" -> 0. Negatives are real
//    (refunds/adjustments) and are kept.
//  - Booleans: Y/true -> true, N/false -> false, empty -> null (absence != "no").
//  - Stocks with empty stock_number or name are skipped with an error logged.
//  - The "Suppliers" column is semicolon-separated.
//  - stock_number === 'PART' is the Mechanic Desk free-text placeholder; imported
//    but flagged is_non_stock.

import Papa from "papaparse"
import { parse as parseDateFns, isValid, format as formatDate } from "date-fns"

export type ParsedRow<T> = { row: T; lineNumber: number }
export type ParseError = {
  lineNumber: number
  field?: string
  message: string
  rawValue?: string
}
export type ParseResult<T> = { rows: ParsedRow<T>[]; errors: ParseError[] }

type Raw = Record<string, string>

// ---------------------------------------------------------------------------
// Field coercion helpers
// ---------------------------------------------------------------------------

function str(v: string | undefined): string | null {
  const s = (v ?? "").trim()
  return s === "" ? null : s
}

function num(v: string | undefined): number | null {
  const s = (v ?? "").trim()
  if (s === "") return null // empty is NOT zero
  const n = Number(s.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

function bool(v: string | undefined): boolean | null {
  const s = (v ?? "").trim().toLowerCase()
  if (s === "") return null // absence is not "no"
  if (s === "y" || s === "yes" || s === "true" || s === "1") return true
  if (s === "n" || s === "no" || s === "false" || s === "0") return false
  return null
}

function toISODate(
  v: string | undefined,
  lineNumber: number,
  field: string,
  errors: ParseError[]
): string | null {
  const s = (v ?? "").trim()
  if (s === "") return null
  const d = parseDateFns(s, "dd/MM/yyyy", new Date())
  if (!isValid(d)) {
    errors.push({ lineNumber, field, message: "invalid date", rawValue: s })
    return null
  }
  return formatDate(d, "yyyy-MM-dd")
}

function toISOTimestamp(
  v: string | undefined,
  lineNumber: number,
  field: string,
  errors: ParseError[]
): string | null {
  const s = (v ?? "").trim()
  if (s === "") return null
  let d = parseDateFns(s, "dd/MM/yyyy HH:mm", new Date())
  if (!isValid(d)) d = parseDateFns(s, "dd/MM/yyyy", new Date())
  if (isValid(d)) return d.toISOString()
  // Fallback: ISO-ish "YYYY-MM-DD HH:mm:ss +1000"
  const native = new Date(s.replace(" ", "T"))
  if (!Number.isNaN(native.getTime())) return native.toISOString()
  errors.push({ lineNumber, field, message: "invalid timestamp", rawValue: s })
  return null
}

function parseCsv(csv: string): Raw[] {
  const result = Papa.parse<Raw>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  })
  return result.data
}

// ---------------------------------------------------------------------------
// Row shapes (mirror the DB insert columns, minus organisation_id / resolved FKs)
// ---------------------------------------------------------------------------

export type CustomerRow = {
  external_id: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
}

export type StockRow = {
  external_id: string | null
  stock_number: string
  name: string
  description: string | null
  category: string | null
  brand: string | null
  model: string | null
  buy_price: number | null
  sell_price: number | null
  markup_percentage: number | null
  taxable: boolean | null
  quantity: number | null
  allocated: number | null
  available: number | null
  ordered: number | null
  unit_of_measure: string | null
  bin_location: string | null
  last_sales_date: string | null
  last_purchase_date: string | null
  is_non_stock: boolean
  deactivated: boolean | null
  tags: string | null
  // Relationship hints, consumed by the orchestrator (not columns on stock_items):
  suppliers: string[]
  first_supplier_stock_number: string | null
}

export type InvoiceRow = {
  invoice_number: string
  customer_external_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  vehicle_external_id: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_registration: string | null
  job_number: string | null
  job_status: string | null
  job_start_date: string | null
  job_end_date: string | null
  first_job_type: string | null
  description: string | null
  issue_date: string | null
  due_date: string | null
  net_amount: number | null
  tax_amount: number | null
  total_amount: number | null
  total_cost: number | null
  paid_amount: number | null
  amount_due: number | null
  comments: string | null
  internal_notes: string | null
  mechanics: string | null
  created_at_external: string | null
}

export type InvoiceItemRow = {
  invoice_number: string
  description: string | null
  category: string | null
  details: string | null
  unit_price: number | null
  quantity: number | null
  discount_percentage: number | null
  net_amount: number | null
  tax_amount: number | null
  total_amount: number | null
  taxable: boolean | null
  stock_number: string | null
  stock_name: string | null
  stock_category: string | null
  unit_cost: number | null
  cogs: number | null
  salesperson: string | null
  created_at_external: string | null
}

export type QuoteRow = {
  quote_number: string
  description: string | null
  customer_external_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: string | null
  issue_date: string | null
  net_amount: number | null
  gst_amount: number | null
  total_amount: number | null
  status: string | null
  assessed_by: string | null
  estimated_by: string | null
  comments: string | null
}

export type QuoteItemRow = {
  quote_number: string
  description: string | null
  category: string | null
  unit_price: number | null
  quantity: number | null
  net_amount: number | null
  tax_amount: number | null
  total_amount: number | null
  taxable: boolean | null
  stock_number: string | null
  stock_name: string | null
  stock_category: string | null
  unit_cost: number | null
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseCustomers(csv: string): ParseResult<CustomerRow> {
  const rows: ParsedRow<CustomerRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2 // header is line 1
    const name = str(r["Name"])
    if (!name) {
      errors.push({ lineNumber, field: "Name", message: "customer skipped: empty name" })
      return
    }
    rows.push({
      lineNumber,
      row: {
        external_id: str(r["Customer ID"]),
        name,
        email: str(r["Email"]),
        phone: str(r["Mobile"]) ?? str(r["Phone"]),
        notes: str(r["Note"]),
      },
    })
  })
  return { rows, errors }
}

export function parseStocks(csv: string): ParseResult<StockRow> {
  const rows: ParsedRow<StockRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2
    const stock_number = str(r["Stock Number"])
    const name = str(r["Name"])
    if (!stock_number || !name) {
      errors.push({
        lineNumber,
        message: `stock skipped: missing ${!stock_number ? "stock number" : "name"}`,
      })
      return
    }
    const suppliers = (r["Suppliers"] ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const isNonStockCol = bool(r["Is non stock"])
    rows.push({
      lineNumber,
      row: {
        external_id: str(r["UUID"]),
        stock_number,
        name,
        description: str(r["Sale Description"]),
        category: str(r["Category"]),
        brand: str(r["Brand"]),
        model: str(r["Model"]),
        buy_price: num(r["Buy Price"]),
        sell_price: num(r["Sell Price"]),
        markup_percentage: num(r["Markup Percentage"]),
        taxable: bool(r["Taxable"]),
        quantity: num(r["Quantity"]),
        allocated: num(r["Allocated"]),
        available: num(r["Available"]),
        ordered: num(r["Ordered"]),
        unit_of_measure: str(r["Unit of Measure"]) ?? "EA",
        bin_location: str(r["Bin"]),
        last_sales_date: toISODate(r["Last Sales Date"], lineNumber, "Last Sales Date", errors),
        last_purchase_date: toISODate(r["Last Purchase Date"], lineNumber, "Last Purchase Date", errors),
        // 'PART' is the MD generic free-text placeholder -> always non-stock.
        is_non_stock: stock_number.toUpperCase() === "PART" ? true : isNonStockCol ?? false,
        deactivated: bool(r["Deactivated"]),
        tags: str(r["Tags"]),
        suppliers: Array.from(new Set(suppliers)),
        first_supplier_stock_number: str(r["First Supplier Stock Number"]),
      },
    })
  })
  return { rows, errors }
}

export function parseInvoicesSummary(csv: string): ParseResult<InvoiceRow> {
  const rows: ParsedRow<InvoiceRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2
    const invoice_number = str(r["Invoice Number"])
    if (!invoice_number) {
      errors.push({ lineNumber, field: "Invoice Number", message: "invoice skipped: no number" })
      return
    }
    rows.push({
      lineNumber,
      row: {
        invoice_number,
        customer_external_id: str(r["Customer ID"]),
        customer_name: str(r["Customer Name"]),
        customer_email: str(r["Customer Email"]),
        customer_phone: str(r["Customer Mobile"]),
        vehicle_external_id: str(r["Vehicle ID"]),
        vehicle_make: str(r["Vehicle Make"]),
        vehicle_model: str(r["Vehicle Model"]),
        vehicle_registration: str(r["Vehicle Registration Number"]),
        job_number: str(r["Job Number"]),
        job_status: str(r["Job Status"]),
        job_start_date: toISOTimestamp(r["Job Start Date"], lineNumber, "Job Start Date", errors),
        job_end_date: toISOTimestamp(r["Job End Date"], lineNumber, "Job End Date", errors),
        first_job_type: str(r["First Job Type"]),
        description: str(r["Description"]),
        issue_date: toISODate(r["Issue Date"], lineNumber, "Issue Date", errors),
        due_date: toISODate(r["Due Date"], lineNumber, "Due Date", errors),
        net_amount: num(r["Net Amount"]),
        tax_amount: num(r["Tax Amount"]),
        total_amount: num(r["Total Amount"]),
        total_cost: num(r["Total Cost"]),
        paid_amount: num(r["Paid Amount"]),
        amount_due: num(r["Amount Due"]),
        comments: str(r["Comments"]),
        internal_notes: str(r["Internal Notes"]),
        mechanics: str(r["Mechanics"]),
        created_at_external: toISOTimestamp(r["Created At"], lineNumber, "Created At", errors),
      },
    })
  })
  return { rows, errors }
}

export function parseInvoiceItems(csv: string): ParseResult<InvoiceItemRow> {
  const rows: ParsedRow<InvoiceItemRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2
    const invoice_number = str(r["Invoice Number"])
    if (!invoice_number) {
      errors.push({ lineNumber, field: "Invoice Number", message: "line item skipped: no invoice number" })
      return
    }
    rows.push({
      lineNumber,
      row: {
        invoice_number,
        description: str(r["Description"]),
        category: str(r["Category"]),
        details: str(r["Details"]),
        unit_price: num(r["Unit Price"]),
        quantity: num(r["Quantity"]),
        discount_percentage: num(r["Discount Percentage"]),
        net_amount: num(r["Net Amount"]),
        tax_amount: num(r["Tax Amount"]),
        total_amount: num(r["Total Amount"]),
        taxable: bool(r["Taxable"]),
        stock_number: str(r["Stock Number"]),
        stock_name: str(r["Stock Name"]),
        stock_category: str(r["Stock Category"]),
        unit_cost: num(r["Unit Cost"]),
        cogs: num(r["COGS"]),
        salesperson: str(r["Salesperson"]),
        created_at_external: toISOTimestamp(r["Created At"], lineNumber, "Created At", errors),
      },
    })
  })
  return { rows, errors }
}

export function parseQuotes(csv: string): ParseResult<QuoteRow> {
  const rows: ParsedRow<QuoteRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2
    const quote_number = str(r["Quote Number"])
    if (!quote_number) {
      errors.push({ lineNumber, field: "Quote Number", message: "quote skipped: no number" })
      return
    }
    rows.push({
      lineNumber,
      row: {
        quote_number,
        description: str(r["Description"]),
        customer_external_id: str(r["Customer ID"]),
        customer_name: str(r["Customer Name"]),
        customer_email: str(r["Customer Email"]),
        customer_phone: str(r["Customer Mobile"]) ?? str(r["Customer Phone"]),
        vehicle_make: str(r["Vehicle Make"]),
        vehicle_model: str(r["Vehicle Model"]),
        vehicle_year: str(r["Vehicle Year"]),
        issue_date: toISODate(r["Date"], lineNumber, "Date", errors),
        net_amount: num(r["Net Amount"]),
        gst_amount: num(r["GST Amount"]),
        total_amount: num(r["Total Amount"]),
        status: str(r["Status"]),
        assessed_by: str(r["Assessed By"]),
        estimated_by: str(r["Estimated By"]),
        comments: str(r["Comments"]),
      },
    })
  })
  return { rows, errors }
}

export function parseQuoteItems(csv: string): ParseResult<QuoteItemRow> {
  const rows: ParsedRow<QuoteItemRow>[] = []
  const errors: ParseError[] = []
  parseCsv(csv).forEach((r, i) => {
    const lineNumber = i + 2
    const quote_number = str(r["Quote Number"])
    if (!quote_number) {
      errors.push({ lineNumber, field: "Quote Number", message: "quote item skipped: no quote number" })
      return
    }
    rows.push({
      lineNumber,
      row: {
        quote_number,
        description: str(r["Description"]),
        category: str(r["Category"]),
        unit_price: num(r["Unit Price"]),
        quantity: num(r["Quantity"]),
        net_amount: num(r["Net Amount"]),
        tax_amount: num(r["Tax Amount"]),
        total_amount: num(r["Total Amount"]),
        taxable: bool(r["Taxable"]),
        stock_number: str(r["Stock Number"]),
        stock_name: str(r["Stock Name"]),
        stock_category: str(r["Stock Category"]),
        unit_cost: num(r["Unit Cost"]),
      },
    })
  })
  return { rows, errors }
}

// Maps the CSV filename (as it appears inside a Mechanic Desk export ZIP) to its
// parser kind. Unknown files are ignored by the orchestrator.
export const KNOWN_CSV_FILES = {
  "Customers.csv": "customers",
  "Stocks.csv": "stocks",
  "Invoices Summary.csv": "invoices",
  "Invoice Items.csv": "invoice_items",
  "Quotes.csv": "quotes",
  "Quote Items.csv": "quote_items",
} as const

export type CsvKind = (typeof KNOWN_CSV_FILES)[keyof typeof KNOWN_CSV_FILES]
