import { NextResponse } from "next/server";
import { hasLabApiAccess } from "@/lib/lab-api-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!(await hasLabApiAccess())) {
    return NextResponse.json({ error: "Lab access is required" }, { status: 403 });
  }

  const aiUrl = process.env.LAB_AI_SERVICE_URL;
  if (!aiUrl) {
    return NextResponse.json({ error: "LAB_AI_SERVICE_URL is not configured" }, { status: 500 });
  }

  const { jobId } = await context.params;
  try {
    const response = await fetch(`${aiUrl}/tracking-jobs/${encodeURIComponent(jobId)}`, {
      headers: process.env.AI_SERVICE_SHARED_TOKEN
        ? { "x-ai-service-token": process.env.AI_SERVICE_SHARED_TOKEN }
        : undefined,
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: `AI service returned ${response.status}: ${data?.detail || "No details"}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: data.status,
      error: data.error || null,
      ...(data.status === "completed" ? data.result : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ error: `Could not check tracking: ${message}` }, { status: 503 });
  }
}
