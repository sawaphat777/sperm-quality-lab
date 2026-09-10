"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data ?? null);
      setFullName(data?.full_name ?? "");
      setNickname(data?.nickname ?? "");
      setPhone(data?.phone ?? "");
    }
    load();
  }, [supabase]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    let avatarUrl = profile?.avatar_url ?? null;
    if (avatar) {
      const path = `${user.id}/${Date.now()}-${avatar.name}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, { upsert: true });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrl = data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, nickname, phone, avatar_url: avatarUrl })
      .eq("id", user.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Profile updated.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setMessage("Password changed.");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Profile</h1>
          <p className="muted">Update your profile photo and account details.</p>
        </div>
      </div>

      <section className="grid two">
        <form className="card form" onSubmit={saveProfile}>
          {profile?.avatar_url ? (
            <Image className="profile-photo" src={profile.avatar_url} alt="Profile" width={94} height={94} />
          ) : (
            <div className="profile-photo" aria-label="Profile" />
          )}
          <div className="field">
            <label htmlFor="avatar">Profile photo</label>
            <input id="avatar" className="input" type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nickname">Nickname</label>
            <input id="nickname" className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn" type="submit">Save profile</button>
        </form>

        <div className="grid">
          <form className="card form" onSubmit={changePassword}>
            <h2>Change password</h2>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                className="input"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn" type="submit">Change password</button>
          </form>

          <div className="card">
            {message && <div className="notice">{message}</div>}
            {error && <p className="error">{error}</p>}
            <button className="btn danger" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      </section>
    </>
  );
}
