import { Suspense } from "react";
import Badge from "@mui/material/Badge";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import type { TenantAccount } from "@/lib/contracts";

// The tenant portal's Months icon in the phone bottom bar (A32): a dot while
// an ended month is unpaid, so the tenant sees where to look. It waits for
// the account on its own and shows the plain icon meanwhile, or if the
// account fails (the cards above then show the error), so the bar never waits.

async function MonthsBadge({ account }: { account: Promise<TenantAccount> }) {
  const unpaid = await account.then(
    (a) => a.balance.overdueMonths,
    () => 0
  );
  return (
    <Badge color="warning" variant="dot" invisible={unpaid === 0} overlap="circular">
      <CalendarMonthRoundedIcon />
    </Badge>
  );
}

export default function MonthsSectionIcon({ account }: { account: Promise<TenantAccount> }) {
  return (
    <Suspense fallback={<CalendarMonthRoundedIcon />}>
      <MonthsBadge account={account} />
    </Suspense>
  );
}
