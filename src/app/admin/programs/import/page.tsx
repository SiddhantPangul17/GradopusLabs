import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ProgramImportForm } from "@/components/admin/program-forms";
import { Notice } from "@/components/ui/notice";
import { importProgramAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Import program · Admin", robots: { index: false } };

async function ImportProgram() {
  await requireAdmin("/admin/programs/import");
  return (
    <>
      <AdminHeader
        title="Import a program"
        description="Create a complete program, with its learning modules and tasks, from one JSON file. It is saved as a draft: review it, then publish from the program page when the checklist is complete."
        breadcrumb={[{ label: "Programs", href: "/admin/programs" }]}
      />
      <div className="max-w-3xl space-y-8">
        <Notice title="What an import does">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              The JSON has a <code>program</code> (its details) and <code>modules</code> (each with its tasks), the same format as{" "}
              <code>npm run content:import</code>.
            </li>
            <li>A new slug creates a new draft program. Any status in the file is ignored: imports are always drafts.</li>
            <li>
              The same slug as an existing <strong>draft</strong> replaces its details and updates its modules and tasks in place, so student
              progress is kept. Modules and tasks missing from the file are hidden, never deleted.
            </li>
            <li>Published and archived programs cannot be imported over. File-upload tasks are refused.</li>
            <li>Nothing is saved if any part of the file is invalid.</li>
          </ul>
        </Notice>
        <ProgramImportForm action={importProgramAction} />
      </div>
    </>
  );
}

export default function ImportProgramPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ImportProgram />
    </Suspense>
  );
}
