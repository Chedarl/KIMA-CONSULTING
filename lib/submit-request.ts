/**
 * A client submits one requested document.
 *
 * The file is stored, a `documents` row points at it, and the request moves
 * to `submitted` — never to `accepted`. A client cannot approve their own
 * piece. The status write goes through `updateById`, so a zero-row refusal
 * is not shown as a success.
 */

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

    // The file upload and document insert are asynchronous. The request may
    // have been accepted, reassigned or revoked in the meantime. An ID-only
    // update would silently move that later decision back to "submitted".
    // Compare-and-swap on the exact tenant, request and original status.
    const statusQuery = db.from("document_requests")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", input.requestId)
      .eq("taxpayer_id", input.taxpayerId)
      .eq("organization_id", input.organizationId)
      .eq("status", input.previousStatus)
      .eq("responsible", "taxpayer");
    const { data: changed, error: statusError } = await (
      input.caseId ? statusQuery.eq("case_id", input.caseId) : statusQuery.is("case_id", null)
    ).select("id");
    // PostgREST may return no error for a zero-row RLS/CAS refusal.
    if (statusError || !changed?.length) return { ok: false, reason: "status" };

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
