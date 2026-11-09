import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Alert from "@mui/material/Alert";
import { serverApi } from "@/lib/api-client/server";
import { formatDateKey } from "@/lib/dates";
import { TAB_PARAM, type TenantPortalTab } from "@/lib/routes";
import { PageHeader } from "@/components/ui/DataDisplay";
import AsyncSection from "@/components/ui/AsyncSection";
import PageTabs, { type PageTab } from "@/components/ui/PageTabs";
import { DetailCardSkeleton } from "@/components/ui/Skeletons";
import AccountStats, { AccountStatsSkeleton } from "@/components/domain/AccountStats";
import TenantDetailsCards from "@/components/domain/TenantDetailsCards";
import TenantDocumentsList from "@/components/domain/TenantDocumentsList";
import TenantLedgerTable from "@/components/domain/TenantLedgerTable";
import TenantPeriodsGrid from "@/components/domain/TenantPeriodsGrid";

// The tenant portal (A32): the signed-in tenant's own account, read-only. No
// id in the URL - the session says whose - and nothing on it changes
// anything: no Edit, Record payment, Adjust, Send link or Correct, only
// receipt, proof and document downloads. The same data and components as the
// owner's tenant page, in the tenant's own words, read through the tenant's
// own API. Documents only while they're a current tenant.

export default async function TenantPortalPage({ searchParams }: PageProps<"/tenant">) {
  const query = await searchParams;
  const tab = typeof query[TAB_PARAM] === "string" ? query[TAB_PARAM] : undefined;
  // A new version per server render resets the kept tabs (as on the owner's tenant page).
  // eslint-disable-next-line react-hooks/purity -- a per-render token, not data
  const version = Date.now();
  const { tenant } = await serverApi.tenant.profile();
  const active = tenant.status === "active";
  // Government rent paid to the owner directly (0016): no months, no dues, no payments here.
  const untracked = active && !tenant.rentTracked;
  const account = untracked ? null : serverApi.tenant.account();
  let documents: ReturnType<typeof serverApi.tenant.documents> | null = null;
  if (active) {
    documents = serverApi.tenant.documents();
    // Awaited only once the tab is opened; a failure before then mustn't be an unhandled rejection.
    documents.catch(() => undefined);
  }

  const tabs: (PageTab & { value: TenantPortalTab })[] = [
    { value: "details", label: "Details", content: <TenantDetailsCards tenant={tenant} audience="tenant" /> },
    ...(account
      ? ([
          { value: "ledger", label: "Payments", content: <TenantLedgerTable source="tenant" /> },
          { value: "months", label: "Months", content: <TenantPeriodsGrid source="tenant" /> },
        ] as const)
      : []),
    ...(documents
      ? ([
          {
            value: "documents",
            label: "Documents",
            content: (
              <AsyncSection title="Documents" fallback={<DetailCardSkeleton rows={3} />}>
                <TenantDocumentsList documents={documents} />
              </AsyncSection>
            ),
          },
        ] as const)
      : []),
  ];

  const movedOut = active ? null : tenant.movedOutOn ? `Moved out ${formatDateKey(tenant.movedOutOn)}` : "Moved out";

  return (
    <Stack spacing={2}>
      <PageHeader
        title={tenant.displayName}
        subtitle={
          [tenant.businessName ? `Contact: ${tenant.name}` : null, movedOut].filter(Boolean).join(" · ") ||
          "Your rent, payments and receipts"
        }
      />

      {untracked ? (
        <Alert severity="info">
          Your rent is paid to your landlord&apos;s bank directly under the agreement, so it isn&apos;t tracked here.
        </Alert>
      ) : null}

      {account ? (
        <Grid container spacing={2} columns={12}>
          <AsyncSection title="Account" fallback={<AccountStatsSkeleton />}>
            <AccountStats account={account} audience="tenant" />
          </AsyncSection>
        </Grid>
      ) : null}

      {/* Phones open Payments: what a tenant comes for is their receipts. */}
      <PageTabs tabs={tabs} value={tab} version={version} label="Your account" phoneDefault={account ? "ledger" : undefined} />
    </Stack>
  );
}
