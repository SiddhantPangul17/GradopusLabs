import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { EMPTY_PROGRAM, ProgramForm } from "@/components/admin/program-forms";
import { createProgramAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New program · Admin", robots: { index: false } };

async function NewProgram() {
  await requireAdmin("/admin/programs/new");
  return (
    <>
      <AdminHeader
        title="New program"
        description="New programs are saved as drafts. Add learning modules, then publish from the program page when the checklist is complete."
        breadcrumb={[{ label: "Programs", href: "/admin/programs" }]}
      />
      <div className="max-w-3xl">
        <ProgramForm action={createProgramAction} initial={EMPTY_PROGRAM} submitLabel="Create draft program" slugLocked={false} />
      </div>
    </>
  );
}

export default function NewProgramPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <NewProgram />
    </Suspense>
  );
}
