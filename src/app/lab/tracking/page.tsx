"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Film, LoaderCircle, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";

type TrackingFrames = {
  jobId: string;
  fps: number;
  frame_count: number;
  metrics: {
    tracked_sperm_count: number;
    progressive_motility_percent: number;
    non_progressive_motility_percent: number;
    immotile_percent: number;
    total_motility_percent: number;
    average_annotated_objects?: number;
  };
  mode?: "prediction";
};

export default function TrackingStudioPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [video, setVideo] = useState<File | null>(null);
  const [microns, setMicrons] = useState("0.5");
  const [minTrackLength, setMinTrackLength] = useState("8");
  const [trackingFrames, setTrackingFrames] = useState<TrackingFrames | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [loadedFrameCount, setLoadedFrameCount] = useState(0);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dots, setDots] = useState(".");
  const [error, setError] = useState("");
  const frameUrlsRef = useRef<string[]>([]);

  function releaseFrameUrls() {
    for (const url of frameUrlsRef.current) URL.revokeObjectURL(url);
    frameUrlsRef.current = [];
    setFrameUrls([]);
  }

  useEffect(() => {
    async function checkLabAccess() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (data?.role !== "lab" && data?.role !== "admin") {
        router.replace("/home");
      }
    }

    checkLabAccess();
  }, [router, supabase]);

  useEffect(() => () => {
    for (const url of frameUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => {
      setDots((current) => (current.length >= 3 ? "." : `${current}.`));
    }, 450);
    return () => window.clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    if (!playing || !trackingFrames?.frame_count || frameUrls.length !== trackingFrames.frame_count) return;
    const frameDelay = Math.max(40, Math.round(1000 / Math.min(trackingFrames.fps || 12, 24)));
    const timer = window.setInterval(() => {
      setCurrentFrame((frame) => (frame + 1) % trackingFrames.frame_count);
    }, frameDelay);
    return () => window.clearInterval(timer);
  }, [playing, trackingFrames, frameUrls.length]);

  async function loadPlaybackFrames(jobId: string, frameCount: number) {
    setLoadingFrames(true);
    setLoadedFrameCount(0);
    const urls = new Array<string>(frameCount);
    let nextFrame = 0;

    async function loadWorker() {
      while (nextFrame < frameCount) {
        const frameIndex = nextFrame;
        nextFrame += 1;
        let frameBlob: Blob | null = null;
        let lastError = "Network request failed";
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const response = await fetch(
              `/api/tracking-jobs/${encodeURIComponent(jobId)}/frames/${frameIndex}`,
              { cache: "no-store" }
            );
            if (response.ok) {
              frameBlob = await response.blob();
              break;
            }
            const body = await response.json().catch(() => null);
            lastError = body?.error || `Server returned ${response.status}`;
          } catch (requestError) {
            lastError = requestError instanceof Error ? requestError.message : "Network request failed";
          }
          await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }
        if (!frameBlob) throw new Error(`Frame ${frameIndex + 1}: ${lastError}`);
        urls[frameIndex] = URL.createObjectURL(frameBlob);
        setLoadedFrameCount((count) => count + 1);
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, frameCount) }, () => loadWorker()));
      frameUrlsRef.current = urls;
      setFrameUrls(urls);
      setCurrentFrame(0);
      setPlaying(true);
    } catch (frameError) {
      for (const url of urls) if (url) URL.revokeObjectURL(url);
      const message = frameError instanceof Error ? frameError.message : "Unknown playback error";
      setError(`Tracking completed, but playback preparation failed: ${message}`);
    } finally {
      setLoadingFrames(false);
    }
  }

  async function processVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!video || processing) return;

    setError("");
    setProcessing(true);
    setPlaying(false);
    releaseFrameUrls();
    setTrackingFrames(null);
    setCurrentFrame(0);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Your session expired. Please log in again.");
        return;
      }

      const safeName = video.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const videoPath = `${user.id}/tracking-${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("lab-videos").upload(videoPath, video, {
        upsert: false,
        contentType: video.type || "video/mp4"
      });
      if (uploadError) {
        setError(`Video upload failed: ${uploadError.message}`);
        return;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("lab-videos")
        .createSignedUrl(videoPath, 60 * 60);
      if (signedError || !signedData?.signedUrl) {
        setError(`Could not prepare tracking video: ${signedError?.message || "Missing signed URL"}`);
        return;
      }

      const response = await fetch("/api/tracking-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: signedData.signedUrl,
          micronsPerPixel: Number(microns),
          minTrackLength: Number(minTrackLength),
          maxFrames: 120
        })
      });
      const startData = await response.json().catch(() => ({ error: "Could not start tracking" }));
      if (!response.ok || !startData.jobId) {
        setError(startData.error || "Could not start tracking");
        return;
      }

      const deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const statusResponse = await fetch(`/api/tracking-jobs/${encodeURIComponent(startData.jobId)}`, {
          cache: "no-store"
        });
        const statusData = await statusResponse.json().catch(() => ({ error: "Could not read tracking status" }));
        if (!statusResponse.ok) {
          setError(statusData.error || "Could not read tracking status");
          return;
        }
        if (statusData.status === "failed") {
          setError(statusData.error || "Tracking visualization failed");
          return;
        }
        if (statusData.status === "completed") {
          const completedTracking: TrackingFrames = {
            jobId: startData.jobId,
            fps: statusData.fps,
            frame_count: statusData.frame_count,
            metrics: statusData.metrics,
            mode: statusData.mode
          };
          setTrackingFrames(completedTracking);
          await loadPlaybackFrames(completedTracking.jobId, completedTracking.frame_count);
          return;
        }
      }
      setError("Tracking exceeded 15 minutes. Try a shorter video or a smaller frame size.");
    } catch (trackingError) {
      const message = trackingError instanceof Error ? trackingError.message : "Unknown browser error";
      setError(`Tracking request failed: ${message}`);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <div className="brand">AI Tracking Studio</div>
          <p className="muted">Visual review of detections, movement trails, track IDs, and estimated motility class</p>
        </div>
        <Link className="btn secondary" href="/lab">
          <ArrowLeft size={18} />
          Back to Lab
        </Link>
      </header>

      <section className="lab-main">
        <div className="grid two">
          <form className="lab-card form" onSubmit={processVideo}>
            <h2>
              <Film size={20} /> Tracking input
            </h2>
            <div className="field">
              <label htmlFor="tracking-video">Microscope video</label>
              <input
                id="tracking-video"
                className="input"
                type="file"
                accept="video/*"
                onChange={(event) => setVideo(event.target.files?.[0] ?? null)}
                required
                suppressHydrationWarning
              />
            </div>
            <div className="grid two">
              <div className="field">
                <label htmlFor="tracking-microns">Microns per pixel</label>
                <input
                  id="tracking-microns"
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={microns}
                  onChange={(event) => setMicrons(event.target.value)}
                  suppressHydrationWarning
                />
              </div>
              <div className="field">
                <label htmlFor="tracking-min-length">Minimum track frames</label>
                <input
                  id="tracking-min-length"
                  className="input"
                  type="number"
                  min="2"
                  value={minTrackLength}
                  onChange={(event) => setMinTrackLength(event.target.value)}
                  suppressHydrationWarning
                />
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn" type="submit" disabled={!video || processing} suppressHydrationWarning>
              {processing ? <LoaderCircle size={18} /> : <Play size={18} />}
              {processing ? `Processing${dots}` : "Process tracking view"}
            </button>
          </form>

          <section className="lab-card">
            <h2>How to read the overlay</h2>
            <div className="grid">
              <p className="muted">Head rings mark detections from the original PyTorch model.</p>
              <p className="muted">Rear axes estimate tail orientation from recent head movement.</p>
              <p className="muted">Arrows show smoothed movement direction and colored trails show recent paths.</p>
              <p className="muted">Track IDs help reviewers see whether AI is following the same object across frames.</p>
              <p className="muted">After enough frames, the overlay shows estimated class, velocity, and straightness.</p>
            </div>
          </section>
        </div>

        <section className="lab-card tracking-viewer" style={{ marginTop: 18 }}>
          <div className="inline-row">
            <h2>Tracking playback</h2>
            {trackingFrames && !loadingFrames && frameUrls.length === trackingFrames.frame_count && (
              <button className="btn secondary" type="button" onClick={() => setPlaying((value) => !value)}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
                {playing ? "Pause" : "Play"}
              </button>
            )}
          </div>
          {trackingFrames && loadingFrames ? (
            <div className="tracking-empty">
              Preparing smooth playback {loadedFrameCount} / {trackingFrames.frame_count}
            </div>
          ) : trackingFrames && frameUrls.length === trackingFrames.frame_count ? (
            <div className="frame-player">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="tracking-video"
                src={frameUrls[currentFrame]}
                alt="AI tracking overlay frame"
              />
              <div className="frame-controls">
                <span className="muted">
                  Frame {currentFrame + 1} / {trackingFrames.frame_count}
                </span>
                <input
                  className="frame-slider"
                  type="range"
                  min="0"
                  max={Math.max(0, trackingFrames.frame_count - 1)}
                  value={currentFrame}
                  onChange={(event) => {
                    setPlaying(false);
                    setCurrentFrame(Number(event.target.value));
                  }}
                />
              </div>
              <div className="grid three" style={{ marginTop: 18 }}>
                <div className="lab-card stat">
                  <span className="muted">Tracked</span>
                  <strong>{trackingFrames.metrics.tracked_sperm_count}</strong>
                </div>
                <div className="lab-card stat">
                  <span className="muted">Total motility</span>
                  <strong>
                    {`${trackingFrames.metrics.total_motility_percent.toFixed(1)}%`}
                  </strong>
                </div>
                <div className="lab-card stat">
                  <span className="muted">Immotile</span>
                  <strong>
                    {`${trackingFrames.metrics.immotile_percent.toFixed(1)}%`}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="tracking-empty">Upload a clip and process it to see AI tracking overlays.</div>
          )}
        </section>
      </section>
    </main>
  );
}
