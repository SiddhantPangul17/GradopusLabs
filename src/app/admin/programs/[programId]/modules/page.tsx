import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ModuleForm } from "@/components/admin/content-forms";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { createModuleAction, moveModuleAction, setModulePublishedAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { listModulesForAdmin } from "@/lib/services/admin-content-service";

export const metadata: Metadata = { title: "Modules · Admin", robots: { index: false } };

async function Modules({ params }: { params: PageProps<"/admin/programs/[programId]/modules">["params"] }) {
  const { programId } = await params;
  const admin = await requireAdmin(`/admin/programs/${encodeURIComponent(programId)}/modules`);
  const result = await listModulesForAdmin({ id: admin.id, role: admin.role }, programId);
  if (!result.ok) notFound();
  const { program, modules } = result.data;

  return (
    <>
      <AdminHeader
        title="Modules"
        breadcrumb={[
          { label: "Programs", href: "/admin/programs" },
          { label: program.title, href: `/admin/programs/${program.id}` },
        ]}
        description="Students see published modules in this order. Edits never reset students' progress or submissions; hiding a module removes it from progress until it is published again."
      />

      <section aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="sr-only">
          Modules in order
        </h2>
        {modules.length === 0 ? (
          <EmptyState title="No modules yet" description="Add the first module below." />
        ) : (
          <ol className="space-y-3">
            {modules.map((module, index) => (
              <li key={module.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="type-meta text-muted">Module {index + 1}</p>
                      <Link href={`/admin/programs/${program.id}/modules/${module.id}`} className="type-card-title wrap-anywhere text-primary hover:underline">
                        {module.title}
                      </Link>
                      <p className="type-meta mt-1 text-muted">
                        {module.slug} · {module.tasks.published} of {module.tasks.total} tasks published
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <StatusBadge status={module.isPublished ? "success" : "neutral"}>{module.isPublished ? "Published" : "Hidden (draft)"}</StatusBadge>
                      <ActionButton
                        action={setModulePublishedAction.bind(null, program.id, module.id, !module.isPublished)}
                        label={module.isPublished ? "Hide" : "Publish"}
                        ariaLabel={`${module.isPublished ? "Hide" : "Publish"} module ${module.title}`}
                      />
                      {index > 0 && (
                        <ActionButton action={moveModuleAction.bind(null, program.id, module.id, "up")} label="↑" ariaLabel={`Move ${module.title} up`} variant="ghost" />
                      )}
                      {index < modules.length - 1 && (
                        <ActionButton action={moveModuleAction.bind(null, program.id, module.id, "down")} label="↓" ariaLabel={`Move ${module.title} down`} variant="ghost" />
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Card as="section" aria-labelledby="add-module-heading" className="mt-10 max-w-3xl">
        <CardTitle as="h2" id="add-module-heading">
          Add a module
        </CardTitle>
        <div className="mt-5">
          <ModuleForm
            action={createModuleAction.bind(null, program.id)}
            idPrefix="new-module"
            submitLabel="Add module"
            initial={{ title: "", slug: "", description: "", content: "", estimatedDurationMinutes: "", isPublished: false }}
          />
        </div>
      </Card>
    </>
  );
}

export default function ModulesPage({ params }: PageProps<"/admin/programs/[programId]/modules">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Modules params={params} />
    </Suspense>
  );
}
