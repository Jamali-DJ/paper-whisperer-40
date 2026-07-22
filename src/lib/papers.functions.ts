// Server functions that run the paper processing pipeline. Kept thin:
// declarations only, so the code-splitter can strip handlers from the client
// bundle. All heavy / server-only work lives in ./pipeline/*.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const processInput = z.object({ paperId: z.string().uuid() });

export const processPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => processInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runPipeline } = await import("./pipeline/run.server");
    return runPipeline({
      paperId: data.paperId,
      supabase: context.supabase,
      userId: context.userId,
    });
  });