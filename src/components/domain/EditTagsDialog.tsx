"use client";

import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TagsField from "@/components/domain/TagsField";
import { FormActions } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";

/**
 * Adds or removes a record's tags: a payment's (0030, D34) or who paid a
 * maintenance expense (0031). Mount it with a `key` per record so it starts
 * from that record's tags. `save` writes them and returns them as saved;
 * `onSaved` then runs, to reload the table and learn any new names.
 */
export default function EditTagsDialog({
  title,
  summary,
  tags: initial,
  suggestions,
  label,
  helperText,
  save,
  onClose,
  onSaved,
}: {
  title: string;
  /** One line naming the record ("Asha · ₹5,000.00 on 03/02/2026"). */
  summary: string;
  tags: string[];
  suggestions: string[];
  label?: string;
  helperText?: string;
  save: (tags: string[]) => Promise<string[]>;
  onClose: () => void;
  /** The record's tags as saved. */
  onSaved: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await save(tags));
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the tags."));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack component="form" onSubmit={submit} spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            {summary}
          </Typography>
          <TagsField
            value={tags}
            onChange={setTags}
            suggestions={suggestions}
            disabled={busy}
            label={label}
            helperText={helperText}
          />
          <FormActions error={error} onCancel={onClose} submitLabel="Save" pendingLabel="Saving…" pending={busy} />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
