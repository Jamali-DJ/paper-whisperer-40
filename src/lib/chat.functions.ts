// Server functions for chat: ensure a paper is indexed for RAG on demand.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const paperIdInput = z.object({ paperId: z.string().uuid() });

export const ensurePaperIndexed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paperIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: paper, error } = await context.supabase
      .from("papers")
      .select("id, user_id, extracted_text, page_count")
      .eq("id", data.paperId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!paper) throw new Error("Paper not found");
    if (paper.user_id !== context.userId) throw new Error("Forbidden");
    if (!paper.extracted_text) return { ok: false as const, reason: "not_extracted" };

    const { count } = await context.supabase
      .from("paper_chunks")
      .select("id", { count: "exact", head: true })
      .eq("paper_id", data.paperId);
    if ((count ?? 0) > 0) return { ok: true as const, chunks: count ?? 0, indexed: false };

    const { indexPaperForRAG } = await import("./rag/index-paper.server");
    const result = await indexPaperForRAG({
      supabase: context.supabase,
      paperId: data.paperId,
      userId: context.userId,
      text: paper.extracted_text as string,
      pageCount: (paper.page_count as number | null) ?? null,
    });
    return { ok: true as const, chunks: result.count, indexed: true };
  });