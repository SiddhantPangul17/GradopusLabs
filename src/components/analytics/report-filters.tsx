import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { PERIOD_PRESETS, PRESET_LABELS, periodSearch, type AnalyticsQuery } from "@/lib/analytics/period";

/**
 * One filter row above everything it scopes: period (presets first, then a
 * custom range) and, where relevant, live/test payment mode. A plain GET form,
 * so the URL is shareable among admins and the server validates every value.
 */
export function ReportFilters({
  action,
  query,
  showMode = false,
  exports = [],
}: {
  action: string;
  query: AnalyticsQuery;
  showMode?: boolean;
  exports?: { report: string; label: string }[];
}) {
  const { period } = query;
  return (
    <div className="mb-8 rounded-card border border-border bg-surface p-4">
      <form method="get" action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
        <SelectField id="report-period" name="period" label="Period" defaultValue={period.preset}>
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </SelectField>
        <TextField id="report-from" name="from" type="date" label="From (custom)" defaultValue={period.preset === "custom" ? (period.fromDate ?? "") : ""} />
        <TextField id="report-to" name="to" type="date" label="To (custom)" defaultValue={period.preset === "custom" ? period.toDate : ""} />
        {showMode ? (
          <SelectField id="report-mode" name="mode" label="Payments" defaultValue={query.mode}>
            <option value="live">Live payments</option>
            <option value="test">Test-mode payments</option>
          </SelectField>
        ) : (
          query.mode === "test" && <input type="hidden" name="mode" value="test" />
        )}
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <p className="type-meta mt-3 text-muted">
        Showing <strong className="text-foreground">{period.label}</strong>
        {period.fromDate ? ` (${period.fromDate} to ${period.toDate}, India time)` : ` (up to ${period.toDate}, India time)`}.
        {showMode && ` ${query.mode === "live" ? "Live" : "Test-mode"} payments only; the two are never combined.`}
      </p>
      {exports.length > 0 && (
        <p className="type-supporting mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-muted">Download CSV:</span>
          {exports.map((item) => (
            <a key={item.report} href={`/api/admin/analytics/export?${periodSearch(query, { report: item.report })}`} className="font-semibold text-primary underline-offset-4 hover:underline">
              {item.label}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}
