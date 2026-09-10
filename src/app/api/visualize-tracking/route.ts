import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  }

  const aiUrl = process.env.LAB_AI_SERVICE_URL || "http://127.0.0.1:8000";
  const proxyForm = new FormData();
  proxyForm.append("video", file, file.name);
  proxyForm.append("microns_per_pixel", String(formData.get("microns_per_pixel") || "0.5"));
  proxyForm.append("min_track_length", String(formData.get("min_track_length") || "8"));

  const response = await fetch(`${aiUrl}/visualize`, {
    method: "POST",
    body: proxyForm
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text || "Tracking visualization failed" }, { status: 502 });
  }

  const body = await response.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": 'inline; filename="ai-tracking-overlay.mp4"'
    }
  });
}
