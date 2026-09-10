import { NextResponse } from "next/server";
import { buildClinicalSummary } from "@/lib/report";
import { hasLabApiAccess } from "@/lib/lab-api-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasLabApiAccess())) {
    return NextResponse.json({ error: "Lab access is required" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  }

  const aiUrl = process.env.LAB_AI_SERVICE_URL || "http://localhost:8000";
  const proxyForm = new FormData();
  proxyForm.append("video", file, file.name);
  proxyForm.append("microns_per_pixel", String(formData.get("microns_per_pixel") || "0.5"));
  proxyForm.append("min_track_length", String(formData.get("min_track_length") || "8"));

  const response = await fetch(`${aiUrl}/analyze`, {
    method: "POST",
    body: proxyForm,
    headers: process.env.AI_SERVICE_SHARED_TOKEN
      ? { "x-ai-service-token": process.env.AI_SERVICE_SHARED_TOKEN }
      : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text || "AI analysis failed" }, { status: 502 });
  }

  const metrics = await response.json();
  const summary = buildClinicalSummary(metrics);

  return NextResponse.json({ metrics, ...summary });
}
