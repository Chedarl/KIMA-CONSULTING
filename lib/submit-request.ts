/**
 * A client submits one requested document.
 *
 * The file is stored, a `documents` row points at it, and the request moves
 * to `submitted` — never to `accepted`. A client cannot approve their own
 * piece. The status write goes through `updateById`, so a zero-row refusal
 * is not shown as a success.
 */

import { updateById } from "./db-write";
import { recordCaseEvent } from "./record-event";
import { audit, supabase } from "./supabase";

export async function submitRequestFile(input: {
  requestId: string;
  file: File;
  taxpayerId: string;
  organizationId: string;
  caseId: string | null;
  label: string;
  actorLabel: string;
  previousStatus: string;
}): Promise<{ ok: true } | { ok: false; reason: "storage" | "document" | "status" | "error" }> {
  try {
    const db = supabase();
    const safe = input.file.name.replace(/[^\w.\-]/g, "_");
    const path = `${input.taxpayerId}/${input.requestId}/${Date.now()}-${safe}`;

    const { error: upErr } = await db.storage
      .from("kima-demo")
      .upload(path, input.file, { cacheControl: "3600", upsert: false });
    if (upErr) return { ok: false, reason: "storage" };

    const { error: docErr } = await db.from("documents").insert({
      request_id: input.requestId,
      taxpayer_id: input.taxpayerId,
      file_name: input.file.name,
      storage_path: path,
      byte_size: input.file.size,
      mime_type: input.file.type || "application/octet-stream",
      uploaded_by: "taxpayer",
      arrived_via: "upload",
      review_status: "pending",
    });
    if (docErr) return { ok: false, reason: "document" };

    const written = await updateById("document_requests", input.requestId, {
      status: "submitted",
      updated_at: new Date().toISOString(),
    });
    if (!written.ok) return { ok: false, reason: "status" };

    await recordCaseEvent({
      taxpayerId: input.taxpayerId,
      organizationId: input.organizationId,
      caseId: input.caseId,
      actor: { role: "client", label: input.actorLabel },
      kind: "document_uploaded",
      from: input.previousStatus,
      to: "submitted",
      subject: input.label,
    });

    await audit({
      taxpayerId: input.taxpayerId,
      organizationId: input.organizationId,
      actor: "taxpayer",
      action: "document.uploaded",
      resourceType: "document_request",
      resourceId: input.requestId,
      before: { status: input.previousStatus },
      after: { status: "submitted", file: input.file.name },
    });

    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
