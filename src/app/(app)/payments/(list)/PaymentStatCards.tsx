"use client";

import { use } from "react";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LocalAtmRoundedIcon from "@mui/icons-material/LocalAtmRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import type { GridFilterModel } from "@mui/x-data-grid";
import { isCardFilterOn, toggleCardFilter, type CardFilter } from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import type { PaymentTotals } from "@/lib/contracts";
import { isCashMode, paymentModeLabel } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/types";

/** A card's filter on the Mode column, which the database compares as the label shown (A28). */
const modeFilter = (modes: readonly PaymentMode[]): CardFilter =>
  modes.length === 1
    ? { field: "mode", operator: "is", value: paymentModeLabel(modes[0]) }
    : { field: "mode", operator: "isAnyOf", value: modes.map(paymentModeLabel) };
/** Each card shows the payments it counts: Received is every cash mode (no set-offs, A22). */
const CARD_FILTERS = {
  received: modeFilter(PAYMENT_MODES.filter(isCashMode)),
  cash: modeFilter(["cash"]),
  upi: modeFilter(["upi"]),
  bank: modeFilter(["bank_transfer"]),
  chequeOther: modeFilter(["cheque", "other"]),
  setOff: modeFilter(["set_off"]),
} as const;

/** "All 12 payments", "1 payment", "No payments": the Received caption says it counts the whole period. */
const countText = (count: number) => (count === 0 ? "No payments" : count === 1 ? "1 payment" : `All ${count} payments`);

/** "32% of received", or nothing when nothing was received. */
const shareOf = (part: number, totals: PaymentTotals) =>
  totals.amount > 0 ? `${Math.round((part / totals.amount) * 100)}% of received` : "Nothing received";

/**
 * The Payments stat cards: money per mode for the days, on their own call, so
 * the table's search, filters and a tapped card never change them (A18). A card
 * filters the table to the payments it counts; tapped again, it clears that
 * filter (A28). Six cards of PaymentsView's StatCardRow, which also holds Govt
 * paid direct: a failed totals call takes these six, not that one.
 */
export default function PaymentStatCards({
  totals: totalsPromise,
  filter,
  setFilter,
  rangeLabel,
}: {
  totals: Promise<PaymentTotals>;
  /** The table's filter model, which the cards toggle their Mode filter in. */
  filter: GridFilterModel;
  setFilter: (filter: GridFilterModel) => unknown;
  /** The days, "October 2026": the cards say they count all of them, not just the filtered rows. */
  rangeLabel: string;
}) {
  const totals = use(totalsPromise);
  const { byMode } = totals;
  const cardFilter = (key: keyof typeof CARD_FILTERS) => ({
    onClick: () => void setFilter(toggleCardFilter(filter, CARD_FILTERS[key])),
    selected: isCardFilterOn(filter, CARD_FILTERS[key]),
  });

  return (
    <>
      <StatCard
        title="Received"
        icon={<PaymentsRoundedIcon />}
        tone="primary"
        variant="gradient"
        value={formatMoney(totals.amount)}
        {...cardFilter("received")}
        // The count is of the payments in this amount (no set-offs), so a tap shows that many rows.
        caption={`${countText(totals.count)} in ${rangeLabel}${
          byMode.set_off > 0 ? ` · + ${formatMoney(byMode.set_off)} set off` : ""
        }`}
      />
      <StatCard title="Cash" icon={<LocalAtmRoundedIcon />} value={formatMoney(byMode.cash)} caption={shareOf(byMode.cash, totals)} {...cardFilter("cash")} />
      <StatCard title="UPI" icon={<QrCode2RoundedIcon />} value={formatMoney(byMode.upi)} caption={shareOf(byMode.upi, totals)} {...cardFilter("upi")} />
      <StatCard
        title="Bank transfer"
        icon={<AccountBalanceRoundedIcon />}
        value={formatMoney(byMode.bank_transfer)}
        caption={shareOf(byMode.bank_transfer, totals)}
        {...cardFilter("bank")}
      />
      <StatCard
        title="Cheque & other"
        icon={<DescriptionRoundedIcon />}
        value={formatMoney(byMode.cheque + byMode.other)}
        caption={shareOf(byMode.cheque + byMode.other, totals)}
        {...cardFilter("chequeOther")}
      />
      <StatCard
        title="Set-off"
        icon={<SwapHorizRoundedIcon />}
        value={formatMoney(byMode.set_off)}
        caption="Not cash · kept back by tenants"
        {...cardFilter("setOff")}
      />
    </>
  );
}
