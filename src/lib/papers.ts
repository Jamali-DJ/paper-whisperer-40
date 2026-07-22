import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  KeyFinding,
  PaperReference,
  PaperStatus,
} from "@/lib/pipeline/types";

export type Paper = {
  id: string;
  user_id: string;
  title: string;
  authors: string | null;
  file_path: string;
  file_size: number | null;
  status: PaperStatus;
  summary: string | null;
  key_points: unknown;
  tags: string[] | null;
  abstract: string | null;
  page_count: number | null;
  keywords: string[] | null;
  extracted_text: string | null;
  key_findings: KeyFinding[] | null;
  methodology: string | null;
  conclusions: string | null;
  references: PaperReference[] | null;
  error_message: string | null;
  processing_progress: number | null;
  created_at: string;
  updated_at: string;
};

// Cast because the auto-generated Database type is empty until types are regenerated.
// The runtime table exists; this cast keeps the app type-safe from here on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: "papers") => any };

export async function listPapers(): Promise<Paper[]> {
  const { data, error } = await db
    .from("papers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Paper[];
}

export async function getPaper(id: string): Promise<Paper | null> {
  const { data, error } = await db.from("papers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Paper | null) ?? null;
}

export async function deletePaper(paper: Paper) {
  const { error: storageErr } = await supabase.storage.from("papers").remove([paper.file_path]);
  if (storageErr) throw storageErr;
  const { error } = await db.from("papers").delete().eq("id", paper.id);
  if (error) throw error;
}

export async function uploadPaper(file: File): Promise<Paper> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw userErr ?? new Error("Not signed in");
  const user = userRes.user;

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${Date.now()}-${cleanName}`;

  const { error: upErr } = await supabase.storage.from("papers").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/pdf",
  });
  if (upErr) throw upErr;

  const title = file.name.replace(/\.pdf$/i, "");
  const { data, error } = await db
    .from("papers")
    .insert({
      user_id: user.id,
      title,
      file_path: path,
      file_size: file.size,
      status: "uploading",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Paper;
}

export async function getSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from("papers").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

// Reference to keep the Database type import used (future typegen will expose 'papers').
export type _DbRef = Database;