"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { markModuleReadAction } from "@/lib/student/actions";
import type { FormResult } from "@/lib/student/action-types";

/** For reading-only modules: the server checks that the module really has no required tasks. */
export function MarkReadButton({ enrollmentId, moduleId }: { enrollmentId: string; moduleId: string }) {
  const [state, formAction, pending] = useActionState(markModuleReadAction.bind(null, enrollmentId, moduleId), { status: "idle" } as FormResult);
  return (
    <form action={formAction} className="space-y-3">
      <div role="status" aria-live="polite">
        {state.status === "error" && <Notice tone="error" title="Could not update progress">{state.message}</Notice>}
      </div>
      <Button type="submit" loading={pending} loadingText="Saving…">
        Mark module as complete
      </Button>
    </form>
  );
}
