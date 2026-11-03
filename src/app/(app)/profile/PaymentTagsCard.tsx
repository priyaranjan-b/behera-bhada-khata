"use client";

import { useState } from "react";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { SectionCard } from "@/components/ui";
import { TagPill } from "@/components/ui/DataDisplay";
import { api, errorMessage } from "@/lib/api-client";
import type { PaymentTagView } from "@/lib/contracts";
import { PAYMENT_TAG_LIMITS } from "@/lib/validation";

const nameLimit = { htmlInput: { maxLength: PAYMENT_TAG_LIMITS.maxLength } };

const usedOn = (count: number) => (count === 0 ? "Not used yet" : count === 1 ? "On 1 payment" : `On ${count} payments`);

/**
 * The tags offered when recording or editing a payment (0030, D34): add,
 * rename or delete them. Each payment keeps its own copy of its tag names,
 * so nothing here changes a payment already tagged.
 */
export default function PaymentTagsCard({ tags }: { tags: PaymentTagView[] }) {
  const router = useAppRouter();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(write: () => Promise<void>, failure: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await write();
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err, failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => api.dashboard.createPaymentTag({ name: newName }), "Couldn't add that tag.")) setNewName("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { id, name } = editing;
    if (await run(() => api.dashboard.updatePaymentTag(id, { name }), "Couldn't rename that tag.")) setEditing(null);
  }

  const full = tags.length >= PAYMENT_TAG_LIMITS.maxTags;

  return (
    <SectionCard
      title="Payment tags"
      caption="Offered under Tags when you record a payment or edit its tags on Payments, e.g. who received it. Renaming or deleting one here doesn't change payments already tagged."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}

      {tags.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No tags yet. Add the names of the people who collect rent.
        </Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {tags.map((tag) =>
            editing?.id === tag.id ? (
              <Stack key={tag.id} component="li">
                <Stack component="form" onSubmit={saveEdit} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    required
                    label="Tag"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: tag.id, name: e.target.value })}
                    slotProps={nameLimit}
                  />
                  <Button size="small" onClick={() => setEditing(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <LoadingButton type="submit" size="small" variant="contained" loading={busy}>
                    Save
                  </LoadingButton>
                </Stack>
              </Stack>
            ) : (
              <Stack key={tag.id} component="li" direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexGrow: 1, minWidth: 0 }}>
                  <TagPill label={tag.name} />
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {usedOn(tag.paymentCount)}
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  aria-label={`Rename tag: ${tag.name}`}
                  disabled={busy}
                  onClick={() => setEditing({ id: tag.id, name: tag.name })}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Delete tag: ${tag.name}`}
                  disabled={busy}
                  onClick={() => run(() => api.dashboard.deletePaymentTag(tag.id), "Couldn't delete that tag.")}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            )
          )}
        </Stack>
      )}

      <Box component="form" onSubmit={add}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <TextField
            size="small"
            fullWidth
            required
            label="New tag"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={full}
            helperText={full ? `At most ${PAYMENT_TAG_LIMITS.maxTags} tags; delete one to add another.` : undefined}
            slotProps={nameLimit}
          />
          <LoadingButton type="submit" size="small" startIcon={<AddRoundedIcon />} loading={busy} disabled={full}>
            Add
          </LoadingButton>
        </Stack>
      </Box>
    </SectionCard>
  );
}
