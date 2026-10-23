import { ButtonLink } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="max-w-2xl py-8">
      <p className="type-eyebrow text-primary">Not found</p>
      <h1 className="type-page-title mt-2 text-foreground">That record does not exist</h1>
      <p className="type-lead mt-4 text-muted">It may have been removed, or the link is incorrect.</p>
      <ButtonLink href="/admin" variant="outline" className="mt-8">
        Back to the admin overview
      </ButtonLink>
    </div>
  );
}
