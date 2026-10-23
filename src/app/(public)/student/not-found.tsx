import { ButtonLink } from "@/components/ui/button";

/** Shown for student resources that do not exist OR belong to someone else (deliberately indistinguishable). */
export default function StudentNotFound() {
  return (
    <div className="max-w-2xl py-8">
      <p className="type-eyebrow text-primary">Not found</p>
      <h1 className="type-page-title mt-2 text-foreground">We could not find that page</h1>
      <p className="type-lead mt-4 text-muted">
        It may have been removed, or it is not part of your account. Check your programs or submissions instead.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/student/programs">My programs</ButtonLink>
        <ButtonLink href="/student" variant="outline">
          Dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
