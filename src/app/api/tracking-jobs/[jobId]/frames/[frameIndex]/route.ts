import { NextResponse } from "next/server";
import { hasLabApiAccess } from "@/lib/lab-api-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; frameIndex: string }> }
) {
  if (!(await hasLabApiAccess())) {
    return NextResponse.json({ error: "Lab access is required" }, { status: 403 });
  }

  const aiUrl = process.env.LAB_AI_SERVICE_URL;
  if (!aiUrl) {
    return NextResponse.json({ error: "LAB_AI_SERVICE_URL is not configured" }, { status: 500 });
  }

  const { jobId, frameIndex } = await context.params;
  try {
    const response = await fetch(
      `${aiUrl}/tracking-jobs/${encodeURIComponent(jobId)}/frames/${encodeURIComponent(frameIndex)}`,
      {
        headers: process.env.AI_SERVICE_SHARED_TOKEN
          ? { "x-ai-service-token": process.env.AI_SERVICE_SHARED_TOKEN }
          : undefined
      }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return NextResponse.json(
        { error: `AI service returned ${response.status}: ${data?.detail || "No details"}` },
        { status: 502 }
      );
    }

    return new NextResponse(response.body, {
      headers: {
        "content-type": response.headers.get("content-type") || "image/jpeg",
        "cache-control": "private, max-age=3600"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ error: `Could not load tracking frame: ${message}` }, { status: 503 });
  }
}
