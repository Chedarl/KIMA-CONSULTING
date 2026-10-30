// Puts real files behind the synthetic seed's document rows.
//
// supabase/seed/synthetic.sql cannot do this: object bytes live in the storage
// service, not in Postgres, and inserting a `storage.objects` row with nothing
// behind it would make the document loop look proven while the bucket is empty.
// So the SQL seeds the rows and this script uploads the files.
//
// It uploads a generated one-page PDF per seeded document, then writes the real
// `byte_size` and `sha256` back onto the row, so the record and the file agree.
//
// SYNTHETIC ONLY. It touches the document ids the seed creates and nothing
// else, and it refuses to run without the same explicit opt-in the SQL seed
// demands. Never point it at production.
//
//   KIMA_ALLOW_SYNTHETIC_SEED=yes \
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npm run seed:storage

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "kima-demo";

// The seed's document rows, listed rather than matched by prefix: `id` is a
// uuid column, and asking Postgres for `id like '5e5d0000-%'` is a type error,
// not a filter. Keep this in step with supabase/seed/synthetic.sql — the
// uploader refusing to find a row is a better failure than it reaching for one
// it should not touch.
const SEED_DOCUMENT_IDS = ["5e5d0000-0000-4000-8000-00000000a700"];

/** A minimal valid one-page PDF, so what lands in the bucket really opens. */
function syntheticPdf(title) {
  const text = `${title} - SYNTHETIC, no tax value`;
  const body = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]" +
      " /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  const stream = `BT /F1 14 Tf 60 760 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  body.push(`5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const obj of body) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${body.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${body.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function main() {
  if (process.env.KIMA_ALLOW_SYNTHETIC_SEED !== "yes") {
    throw new Error(
      "Refusing to upload: set KIMA_ALLOW_SYNTHETIC_SEED=yes first. Never run this against production.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: documents, error } = await db
    .from("documents")
    .select("id, taxpayer_id, file_name, storage_path")
    .in("id", SEED_DOCUMENT_IDS)
    .not("storage_path", "is", null);
  if (error) throw new Error(`Could not read the seeded documents: ${error.message}`);
  if (!documents?.length) {
    console.log("No synthetic document rows found. Run the SQL seed first.");
    return;
  }
  if (documents.length !== SEED_DOCUMENT_IDS.length) {
    const found = new Set(documents.map((d) => d.id));
    const missing = SEED_DOCUMENT_IDS.filter((id) => !found.has(id));
    console.warn(
      `Warning: ${missing.length} seeded document id(s) not found or without a storage_path: ${missing.join(", ")}`,
    );
  }

  for (const doc of documents) {
    // The storage policy reads the taxpayer from the path's first segment, so a
    // mismatch here would upload a file its own owner cannot read.
    if (doc.storage_path.split("/")[0] !== doc.taxpayer_id) {
      throw new Error(
        `${doc.id}: storage_path must start with the taxpayer id, got "${doc.storage_path}".`,
      );
    }

    const bytes = syntheticPdf(doc.file_name);
    const up = await db.storage
      .from(BUCKET)
      .upload(doc.storage_path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`${doc.storage_path}: upload failed: ${up.error.message}`);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { error: rowErr } = await db
      .from("documents")
      .update({ byte_size: bytes.length, sha256 })
      .eq("id", doc.id);
    if (rowErr) throw new Error(`${doc.id}: could not record the file: ${rowErr.message}`);

    console.log(
      `uploaded ${doc.storage_path} (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}...)`,
    );
  }

  console.log(`\n${documents.length} file(s) in ${BUCKET}. The rows now match the bucket.`);
  console.log(
    "This does NOT prove the upload loop: no client has put a file there through the UI (phase 5).",
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
