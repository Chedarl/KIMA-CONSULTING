/**
 * Ledger import for the DSF bridge.
 *
 * A firm's export (Sage, Excel, a CSV a bookkeeper assembled) is untrusted
 * input: columns move, amounts carry separators, and a chart may use accounts
 * this product has never seen. Nothing here guesses. An account that does not
 * map is reported as unmapped, an amount that is not a whole XAF figure is
 * reported as invalid, and the totals only sum what was actually read.
 */

import { mapAccount, type AccountMapping } from "./dsf-mapping";

export type LedgerRow = {
  /** 1-based line in the file, so a human can find it. */
  line: number;
  account: string;
  label: string;
  debitXaf: number;
  creditXaf: number;
};

export type ImportedRow = LedgerRow & {
  mapping: AccountMapping;
  issues: string[];
};

export type LedgerImport = {
  rows: ImportedRow[];
  totalDebitXaf: number;
  totalCreditXaf: number;
  unmappedCount: number;
  invalidCount: number;
};

export type ColumnMap = { account: number; label: number; debit: number; credit: number };

/** Split one CSV line, honouring double quotes around fields. */
export function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === separator && !quoted) {
      out.push(field); field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Find the columns by header name, in FR or EN. Null when a required one is missing. */
export function detectColumns(header: string[]): ColumnMap | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (candidates: string[]) => norm.findIndex((h) => candidates.some((c) => h.includes(c)));
  const account = find(["compte", "account", "n° compte", "numero"]);
  const label = find(["libell", "label", "intitul"]);
  const debit = find(["debit", "débit"]);
  const credit = find(["credit", "crédit"]);
  if (account < 0 || debit < 0 || credit < 0) return null;
  return { account, label: label >= 0 ? label : account, debit, credit };
}

/** Whole XAF only. Returns null rather than rounding a customer's money. */
export function parseXaf(raw: string): number | null {
  const cleaned = (raw ?? "").replace(/\s/g, "").replace(/XAF/gi, "");
  if (!cleaned) return 0;
  if (!/^-?[0-9][0-9 .,']*$/.test(cleaned)) return null;
  const normalised = cleaned.replace(/[.,']/g, "");
  const value = Number(normalised);
  return Number.isSafeInteger(value) ? value : null;
}

export function importLedger(csv: string, scheduleByRoot: Record<string, string>): LedgerImport {
  const lines = (csv ?? "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const empty: LedgerImport = { rows: [], totalDebitXaf: 0, totalCreditXaf: 0, unmappedCount: 0, invalidCount: 0 };
  if (lines.length < 2) return empty;

  const separator = lines[0].includes(";") ? ";" : ",";
  const header = splitCsvLine(lines[0], separator);
  const cols = detectColumns(header);
  if (!cols) return empty;

  const rows: ImportedRow[] = [];
  let totalDebitXaf = 0;
  let totalCreditXaf = 0;
  let unmappedCount = 0;
  let invalidCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], separator);
    if (cells.length <= cols.account) continue;
    const issues: string[] = [];
    const debit = parseXaf(cells[cols.debit] ?? "");
    const credit = parseXaf(cells[cols.credit] ?? "");
    if (debit === null || credit === null) { issues.push("amount_not_integer"); invalidCount++; }
    const debitXaf = debit ?? 0;
    const creditXaf = credit ?? 0;
    const mapping = mapAccount(cells[cols.account] ?? "", scheduleByRoot);
    if (mapping.status === "unmapped") unmappedCount++;
    totalDebitXaf += debitXaf;
    totalCreditXaf += creditXaf;
    rows.push({
      line: i + 1,
      account: (cells[cols.account] ?? "").trim(),
      label: (cells[cols.label] ?? "").trim(),
      debitXaf,
      creditXaf,
      mapping,
      issues,
    });
  }

  return { rows, totalDebitXaf, totalCreditXaf, unmappedCount, invalidCount };
}

/**
 * Export the imported ledger as CSV, with the mapping decision carried as its
 * own columns.
 *
 * This is not the DSF workbook: Kima fills the DGI's own locked template and
 * must not invent a format. What it produces is the working pack a preparer
 * takes into that template — every row, its account, its mapped schedule (or
 * empty), and the issues found, so nothing is silently repaired on the way out.
 */
export function exportLedgerCsv(rows: ImportedRow[]): string {
  const header = ["line", "account", "label", "debit_xaf", "credit_xaf", "root", "schedule", "issues"];
  const cell = (value: string) => {
    const needsQuotes = /[",;\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? '"' + escaped + '"' : escaped;
  };
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      String(row.line),
      cell(row.account),
      cell(row.label),
      String(row.debitXaf),
      String(row.creditXaf),
      row.mapping.root ?? "",
      cell(row.mapping.schedule ?? ""),
      cell(row.issues.join("|")),
    ].join(","));
  }
  return lines.join("\n") + "\n";
}
