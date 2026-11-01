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
import { api, errorMessage } from "@/lib/api-client";
import type { PaymentNotePresetView } from "@/lib/contracts";
import { PAYMENT_NOTE_LIMITS } from "@/lib/validation";

const textLimit = { htmlInput: { maxLength: PAYMENT_NOTE_LIMITS.maxLength } };

/** The quick notes offered under "Note" when recording a payment: add, rename or delete them. */
export default function PaymentNotesCard({ notes }: { notes: PaymentNotePresetView[] }) {
  const router = useAppRouter();
  const [newText, setNewText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
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
    if (await run(() => api.dashboard.createPaymentNote({ text: newText }), "Couldn't add that note.")) setNewText("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { id, text } = editing;
    if (await run(() => api.dashboard.updatePaymentNote(id, { text }), "Couldn't save that note.")) setEditing(null);
  }

  const full = notes.length >= PAYMENT_NOTE_LIMITS.maxPresets;

  return (
    <SectionCard
      title="Quick payment notes"
      caption="Offered under Note when you record a payment. Changing one here doesn't change payments already saved."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}

      {notes.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No quick notes yet. Add the ones you write most often.
        </Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {notes.map((note) =>
            editing?.id === note.id ? (
              <Stack key={note.id} component="li">
                <Stack component="form" onSubmit={saveEdit} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    required
                    label="Note"
                    value={editing.text}
                    onChange={(e) => setEditing({ id: note.id, text: e.target.value })}
                    slotProps={textLimit}
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
              <Stack key={note.id} component="li" direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                  {note.text}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Edit note: ${note.text}`}
                  disabled={busy}
                  onClick={() => setEditing({ id: note.id, text: note.text })}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Delete note: ${note.text}`}
                  disabled={busy}
                  onClick={() => run(() => api.dashboard.deletePaymentNote(note.id), "Couldn't delete that note.")}
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
            label="New note"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            disabled={full}
            helperText={full ? `At most ${PAYMENT_NOTE_LIMITS.maxPresets} notes; delete one to add another.` : undefined}
            slotProps={textLimit}
          />
          <LoadingButton type="submit" size="small" startIcon={<AddRoundedIcon />} loading={busy} disabled={full}>
            Add
          </LoadingButton>
        </Stack>
      </Box>
    </SectionCard>
  );
}
