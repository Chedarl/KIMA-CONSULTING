import { NextResponse } from "next/server";
import { answerCopilot } from "@/lib/assistant/answer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { question?: string; locale?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const question = (body.question ?? "").trim();
  if (question.length < 3) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const locale = body.locale === "en" ? "en" : "fr";
  const answer = await answerCopilot(question, locale);
  return NextResponse.json(answer);
}
