// Client-callable server functions for AI analysis modules.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ANALYSIS_MODULE_KEYS } from "@/lib/ai/modules";

const moduleKeyEnum = z.enum(ANALYSIS_MODULE_KEYS as [string, ...string[]]);

const regenerateInput = z.object({
  paperId: z.string().uuid(),
  moduleKey: moduleKeyEnum,
});

const generateAllInput = z.object({
  paperId: z.string().uuid(),
});

export const regenerateAnalysisModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => regenerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runModuleForPaper } = await import("./ai/run.server");
    return runModuleForPaper({
      supabase: context.supabase,
      userId: context.userId,
      paperId: data.paperId,
      moduleKey: data.moduleKey as never,
    });
  });

export const generateAllAnalysisModulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateAllInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runAllModulesForPaper } = await import("./ai/run.server");
    return runAllModulesForPaper({
      supabase: context.supabase,
      userId: context.userId,
      paperId: data.paperId,
    });
  });