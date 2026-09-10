import { NextResponse } from "next/server";
import { buildClinicalSummary } from "@/lib/report";
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
    const response = await fetch(`${aiUrl}/analysis-jobs/${encodeURIComponent(jobId)}`, {
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

    if (data.status === "completed" && data.result) {
      return NextResponse.json({
        status: "completed",
        result: { metrics: data.result, ...buildClinicalSummary(data.result) }
      });
    }
    return NextResponse.json({ status: data.status, error: data.error || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ error: `Could not check AI analysis: ${message}` }, { status: 503 });
  }
}
