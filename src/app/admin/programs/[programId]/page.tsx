import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ProgramForm, ProgramStatusForm, type ProgramFormValues } from "@/components/admin/program-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { changeProgramStatusAction, updateProgramAction } from "@/lib/admin/actions";
import { paiseToRupees } from "@/lib/admin/form-parsing";
import { programStatusDisplay } from "@/lib/admin/labels";
import { canChangeProgramStatus } from "@/lib/admin/readiness";
import { requireAdmin } from "@/lib/auth/session";
import { PROGRAM_STATUSES } from "@/lib/constants";
import { getProgramForAdmin, type AdminProgramDetail } from "@/lib/services/admin-program-service";
import { formatMinorUnits } from "@/lib/utils";

export const metadata: Metadata = { title: "Program · Admin", robots: { index: false } };

function toFormValues(program: AdminProgramDetail): ProgramFormValues {
  return {
    title: program.title,
    slug: program.slug,
    shortDescription: program.shortDescription,
    description: program.description,
    category: program.category,
    difficulty: program.difficulty,
    durationWeeks: String(program.durationWeeks),
    weeklyEffort: program.weeklyEffort,
    deliveryFormat: program.deliveryFormat,
    priceRupees: paiseToRupees(program.price),
    currency: program.currency,
    learningOutcomes: program.learningOutcomes.join("\n"),
    prerequisites: program.prerequisites.join("\n"),
    audience: program.audience.join("\n"),
    syllabus: program.syllabus.map((item) => (item.topics.length ? `${item.title}: ${item.topics.join("; ")}` : item.title)).join("\n"),
    sampleTasks: program.sampleTasks.map((item) => (item.description ? `${item.title}: ${item.description}` : item.title)).join("\n"),
    finalProject: program.finalProject,
    inclusions: program.inclusions.join("\n"),
    completionCriteria: program.completionCriteria.join("\n"),
    availability: program.availability,
    featured: program.featured,
    displayOrder: String(program.displayOrder),
  };
}

async function ProgramDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/programs/[programId]">["params"];
  searchParams: PageProps<"/admin/programs/[programId]">["searchParams"];
}) {
  const { programId } = await params;
  const admin = await requireAdmin(`/admin/programs/${encodeURIComponent(programId)}`);
  const result = await getProgramForAdmin({ id: admin.id, role: admin.role }, programId);
  if (!result.ok) notFound();
  const program = result.data;
  const created = (await searchParams).created === "1";
  const status = programStatusDisplay[program.status];
  const targets = PROGRAM_STATUSES.filter((target) => canChangeProgramStatus(program.status, target));
  const activeStudents = program.stats.enrollments.active + program.stats.enrollments.pending;

  return (
    <>
      <AdminHeader
        title={program.title}
        breadcrumb={[{ label: "Programs", href: "/admin/programs" }]}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={status.status}>{status.label}</StatusBadge>
            <span>/{program.slug}</span>
            {program.status === "published" && (
              <Link href={`/programs/${program.slug}`} className="font-medium text-primary underline">
                View public page
              </Link>
            )}
          </span>
        }
        actions={<ButtonLink href={`/admin/programs/${program.id}/modules`}>Manage modules and tasks</ButtonLink>}
      />
      {created && <Notice tone="success" title="Draft program created" className="mb-6">Add learning modules next, then publish when the checklist below is complete.</Notice>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="details-heading" className="min-w-0">
          <h2 id="details-heading" className="type-section-title mb-6 text-foreground">
            Program details
          </h2>
          <ProgramForm action={updateProgramAction.bind(null, program.id)} initial={toFormValues(program)} submitLabel="Save changes" slugLocked={program.status !== "draft"} />
          {program.faqCount > 0 && (
            <p className="type-supporting mt-4 text-muted">This program has {program.faqCount} FAQ entries (managed through content import); they are kept when you save.</p>
          )}
        </section>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card as="section" aria-labelledby="publish-heading">
            <CardTitle as="h2" id="publish-heading">
              Publication
            </CardTitle>
            <p className="type-supporting mt-2 text-muted">
              Current status: <strong className="text-foreground">{status.label}</strong>. Programs are never deleted; archive them instead.
            </p>
            <div className="mt-4">
              <h3 className="type-label text-foreground">Publishing checklist</h3>
              {program.problems.length === 0 ? (
                <p className="type-supporting mt-2 text-success">Ready to publish.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 type-supporting text-foreground">
                  {program.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
            {program.status !== "draft" && activeStudents > 0 && (
              <p className="type-supporting mt-4 text-muted">{activeStudents} active or pending enrolments depend on this program.</p>
            )}
            <div className="mt-5 border-t border-border pt-5">
              <ProgramStatusForm action={changeProgramStatusAction.bind(null, program.id)} targets={targets} />
            </div>
          </Card>

          <Card as="section" aria-labelledby="stats-heading">
            <CardTitle as="h2" id="stats-heading">
              At a glance
            </CardTitle>
            <FactList
              className="mt-4"
              items={[
                { label: "Price", value: formatMinorUnits(program.price, program.currency) },
                { label: "Modules", value: `${program.stats.modules.published} published / ${program.stats.modules.total}` },
                { label: "Tasks", value: `${program.stats.tasks.published} published / ${program.stats.tasks.total}` },
                { label: "Active enrolments", value: String(program.stats.enrollments.active) },
                { label: "Completed", value: String(program.stats.enrollments.completed) },
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function AdminProgramPage({ params, searchParams }: PageProps<"/admin/programs/[programId]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ProgramDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
