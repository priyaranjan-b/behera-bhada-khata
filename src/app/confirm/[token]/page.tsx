import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import { apiHref, apiPaths } from "@/lib/api-client";
import { serverApi } from "@/lib/api-client/server";
import { formatMoney } from "@/lib/money";
import { BrandMark } from "@/components/shell/BrandMark";
import { StatusBadge } from "@/components/DataComponents";
import { StatusChip } from "@/components/StatusChip";
import {
  DetailList,
  DetailRow,
  PublicHeading,
  PublicLayout,
  SectionCard,
  SummaryLine,
} from "@/components/ui";
import ConfirmForm from "./ConfirmForm";

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await serverApi.confirm.detail(token);
  const { isExpired } = record;
  const isConfirmed = record.status === "confirmed";
  const recordLabel = record.recordType === "payment" ? "Payment" : "Adjustment";

  return (
    <PublicLayout width="md" align="top">
      <Stack spacing={3}>
        <BrandMark />

        <PublicHeading
          title={`Confirm ${recordLabel.toLowerCase()}`}
          subtitle="Check the details below, then sign and verify with the code sent to your phone."
        />

        <SectionCard
          title={`${recordLabel} details`}
          icon={<ReceiptLongRoundedIcon />}
          action={
            isExpired ? <StatusBadge tone="warning" label="Link expired" /> : <StatusChip status={record.status} />
          }
        >
          <DetailList>
            <DetailRow label="Property">{record.propertyName}</DetailRow>
            <DetailRow label="Tenant">{record.tenantName}</DetailRow>
          </DetailList>

          <Divider />

          <DetailList>
            {record.lineItems.map((item) => (
              <DetailRow key={item.rentPeriodId} label={item.label}>
                {formatMoney(item.amount)}
              </DetailRow>
            ))}
          </DetailList>

          <Divider />

          <SummaryLine label="Total" value={formatMoney(record.amount)} emphasis="total" />

          <DetailList>
            <DetailRow label="Date">{record.date}</DetailRow>
            {record.mode ? <DetailRow label="Mode">{record.mode}</DetailRow> : null}
          </DetailList>

          {record.note ? (
            <Typography variant="caption" component="p" color="textSecondary">
              {record.note}
            </Typography>
          ) : null}
        </SectionCard>

        {isConfirmed ? (
          <Stack spacing={2}>
            <Alert severity="success">
              <AlertTitle>Already confirmed</AlertTitle>
              This {recordLabel.toLowerCase()} has been signed and verified.
            </Alert>
            <Button
              variant="contained"
              size="large"
              fullWidth
              href={apiHref(apiPaths.confirm.receipt(token, record.recordType))}
            >
              View receipt
            </Button>
          </Stack>
        ) : isExpired ? (
          <Alert severity="warning">
            <AlertTitle>Link expired</AlertTitle>
            This link has expired. Please contact the owner for a new one.
          </Alert>
        ) : (
          <ConfirmForm token={token} recordType={record.recordType} maskedPhone={record.maskedPhone} />
        )}
      </Stack>
    </PublicLayout>
  );
}
