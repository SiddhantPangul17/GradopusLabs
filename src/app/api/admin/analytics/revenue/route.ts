import { analyticsGet } from "@/lib/analytics/route";
import { getRevenueReport } from "@/lib/services/analytics-service";

/** GET /api/admin/analytics/revenue?period=30d|today|7d|90d|365d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&mode=live|test (admins only). */
export function GET(request: Request) {
  return analyticsGet(request, getRevenueReport);
}
