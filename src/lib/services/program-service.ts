import "server-only";
import { revalidateTag } from "next/cache";
import type { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongodb";
import { ConflictError, isDuplicateKeyError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { isValidSlug } from "@/lib/validation/common";
import { programInputSchema } from "@/lib/validation/program";
import { ProgramModel, type ProgramRecord } from "@/models/program";
import type { Program } from "@/types";

/** Cache tag for every cached read of program data (see src/lib/programs.ts). */
export const PROGRAMS_CACHE_TAG = "programs";

/**
 * Expires cached public program data immediately, so catalogue changes made in
 * the admin dashboard (publish, archive, edits) are visible on the next request.
 */
export function invalidatePublicPrograms(): void {
  revalidateTag(PROGRAMS_CACHE_TAG, { expire: 0 });
}

type ProgramDocument = ProgramRecord & { _id: Types.ObjectId };

/** Only published programs are ever returned by the public queries below. */
const PUBLISHED = { status: "published" } as const;

/**
 * Converts a database record into the stable `Program` shape used by the
 * pages. Internal fields (ids, status, timestamps, ordering) are not exposed.
 */
export function toProgram(doc: ProgramDocument): Program {
  return {
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    summary: doc.shortDescription,
    overview: doc.description
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    level: doc.difficulty,
    durationWeeks: doc.duration.weeks,
    weeklyEffort: doc.duration.weeklyEffort,
    deliveryFormat: doc.deliveryFormat,
    pricePaise: doc.price,
    currency: doc.currency,
    availability: doc.availability,
    featured: doc.featured,
    audience: [...doc.audience],
    prerequisites: [...doc.prerequisites],
    outcomes: [...doc.learningOutcomes],
    modules: doc.modules.map((module) => ({ title: module.title, topics: [...module.topics] })),
    tasks: doc.tasks.map((task) => ({ title: task.title, description: task.description })),
    finalProject: doc.finalProject ?? "",
    inclusions: [...doc.inclusions],
    completionCriteria: [...doc.completionCriteria],
    faqs: doc.faqs.map((faq) => ({ id: `faq-${faq._id.toString()}`, question: faq.question, answer: [...faq.answer] })),
  };
}

export async function findPublishedPrograms(): Promise<Program[]> {
  await connectToDatabase();
  const docs = await ProgramModel.find(PUBLISHED).sort({ displayOrder: 1, createdAt: 1 }).lean<ProgramDocument[]>();
  return docs.map(toProgram);
}

export async function findPublishedProgramBySlug(slug: string): Promise<Program | null> {
  // Validating first also guarantees only a plain string reaches the query.
  if (!isValidSlug(slug)) return null;
  await connectToDatabase();
  const doc = await ProgramModel.findOne({ ...PUBLISHED, slug }).lean<ProgramDocument>();
  return doc ? toProgram(doc) : null;
}

export async function findPublishedProgramSlugs(): Promise<string[]> {
  await connectToDatabase();
  const docs = await ProgramModel.find(PUBLISHED).select({ slug: 1, _id: 0 }).lean<{ slug: string }[]>();
  return docs.map((doc) => doc.slug);
}

/**
 * Creates a program. Admin only: `actor` must come from a verified session.
 * Not exposed through any route yet; the admin dashboard will call it.
 * Throws ZodError for invalid input and ConflictError for a duplicate slug.
 */
export async function createProgram(input: unknown, actor: Actor): Promise<{ id: string; slug: string }> {
  assertAdmin(actor);
  const data = programInputSchema.parse(input);

  await connectToDatabase();
  await ProgramModel.init(); // ensures the unique slug index exists (rejects if index creation failed)
  let created;
  try {
    created = await ProgramModel.create(data);
  } catch (error) {
    // Rely on the unique index rather than a racy "check then insert".
    if (isDuplicateKeyError(error)) throw new ConflictError("A program with this slug already exists.");
    throw error;
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "program.created",
    entityType: "program",
    entityId: created._id,
    metadata: { slug: created.slug, status: created.status },
  });
  invalidatePublicPrograms();

  return { id: created._id.toString(), slug: created.slug };
}
