import { ButtonLink } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  totalPages: number;
  /** Builds the link for a page (keeps the current filters). */
  hrefFor: (page: number) => string;
  label: string;
  previousLabel?: string;
  nextLabel?: string;
};

/** Previous/next pagination with the current position stated in text. */
export function Pagination({ page, totalPages, hrefFor, label, previousLabel = "Previous", nextLabel = "Next" }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <ButtonLink href={hrefFor(page - 1)} variant="outline" size="sm">
          {previousLabel}
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="type-supporting text-muted">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <ButtonLink href={hrefFor(page + 1)} variant="outline" size="sm">
          {nextLabel}
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Builds "/path?key=value" from non-empty params. */
export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
