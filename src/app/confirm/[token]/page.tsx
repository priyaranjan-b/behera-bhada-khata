import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { loadPendingRecordByToken, maskPhone, type PendingRecordContext } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import ConfirmForm from "./ConfirmForm";

async function resolveContext(token: string): Promise<PendingRecordContext | null> {
  const payment = await loadPendingRecordByToken(token, "payment");
  if (payment) return payment;
  return loadPendingRecordByToken(token, "adjustment");
}

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await resolveContext(token);
  if (!context) notFound();

  const isExpired =
    context.record.status === "pending" && new Date(context.record.token_expires_at) < new Date();
  const isConfirmed = context.record.status === "confirmed";

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", minHeight: "100vh", px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {context.property.name}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {context.tenant.name}
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {context.recordType === "payment" ? "Payment" : "Adjustment"} details
          </Typography>
          <Stack spacing={0.75}>
            {context.lineItems.map((item) => (
              <Stack key={item.rentPeriodId} direction="row" sx={{ justifyContent: "space-between" }}>
                <Typography variant="body2">{item.label}</Typography>
                <Typography variant="body2">{formatMoney(item.amount)}</Typography>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" sx={{ justifyContent: "space-between", fontWeight: 700 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Total
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatMoney(context.record.amount)}
            </Typography>
          </Stack>
          <Typography variant="caption" color="textSecondary" sx={{ display: "block", mt: 1.5 }}>
            Date: {context.record.date}
            {context.record.mode ? ` · ${context.record.mode}` : ""}
          </Typography>
          {context.record.note ? (
            <Typography variant="caption" color="textSecondary" sx={{ display: "block", mt: 0.5 }}>
              {context.record.note}
            </Typography>
          ) : null}
        </Paper>

        {isConfirmed ? (
          <Alert severity="success" action={
            <Button color="inherit" size="small" href={`/api/confirm/${token}/receipt?recordType=${context.recordType}`}>
              View receipt
            </Button>
          }>
            Already confirmed.
          </Alert>
        ) : isExpired ? (
          <Alert severity="warning">This link has expired. Please contact the owner for a new one.</Alert>
        ) : (
          <ConfirmForm token={token} recordType={context.recordType} maskedPhone={maskPhone(context.tenant.phone)} />
        )}
      </Stack>
    </Box>
  );
}
