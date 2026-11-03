/**
 * A client submits one requested document.
 *
 * The five steps are one contract: if any step after the object is written
 * fails, the object, the row and the status change are compensated in reverse,
 * so a refusal can never leave an orphaned file or a row claiming a submission
 * that never completed.
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
  const db = supabase();
  const bucket = "kima-demo";
  const safe = input.file.name.replace(/[^\w.\-]/g, "_");
  const path = input.taxpayerId + "/" + input.requestId + "/" + Date.now() + "-" + safe;

  const removeObject = async () => {
    try { await db.storage.from(bucket).remove([path]); } catch { /* best effort */ }
  };
  const removeRow = async () => {
    try { await db.from("documents").delete().eq("storage_path", path); } catch { /* best effort */ }
  };
  const revertStatus = async () => {
    try {
      await updateById("document_requests", input.requestId, {
        status: input.previousStatus,
        updated_at: new Date().toISOString(),
      });
    } catch { /* best effort */ }
  };

  try {
    const { error: upErr } = await db.storage
      .from(bucket)
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
    if (docErr) {
      await removeObject();
      return { ok: false, reason: "document" };
    }

    const written = await updateById("document_requests", input.requestId, {
      status: "submitted",
      updated_at: new Date().toISOString(),
    });
    if (!written.ok) {
      await removeRow();
      await removeObject();
      return { ok: false, reason: "status" };
    }

    try {
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
    } catch {
      await revertStatus();
      await removeRow();
      await removeObject();
      return { ok: false, reason: "error" };
    }

    return { ok: true };
  } catch {
    await revertStatus();
    await removeRow();
    await removeObject();
    return { ok: false, reason: "error" };
  }
}
