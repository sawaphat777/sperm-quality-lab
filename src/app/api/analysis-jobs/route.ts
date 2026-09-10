import { NextResponse } from "next/server";
import { hasLabApiAccess } from "@/lib/lab-api-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await hasLabApiAccess())) {
    return NextResponse.json({ error: "Lab access is required" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as {
    videoUrl?: string;
    micronsPerPixel?: number;
    minTrackLength?: number;
  } | null;
  if (!payload?.videoUrl) {
    return NextResponse.json({ error: "Missing signed video URL" }, { status: 400 });
  }

  const aiUrl = process.env.LAB_AI_SERVICE_URL;
  if (!aiUrl) {
    return NextResponse.json({ error: "LAB_AI_SERVICE_URL is not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`${aiUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.AI_SERVICE_SHARED_TOKEN
          ? { "x-ai-service-token": process.env.AI_SERVICE_SHARED_TOKEN }
          : {})
      },
      body: JSON.stringify({
        video_url: payload.videoUrl,
        microns_per_pixel: payload.micronsPerPixel ?? 0.5,
        min_track_length: payload.minTrackLength ?? 8
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: `AI service returned ${response.status}: ${data?.detail || "No details"}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ jobId: data.job_id, status: data.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ error: `Could not start AI analysis: ${message}` }, { status: 503 });
  }
}
