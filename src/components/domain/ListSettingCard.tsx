"use client";

import { useState } from "react";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { SectionCard } from "@/components/ui";
import { EmptyState, TagPill } from "@/components/ui/DataDisplay";
import type { Tone } from "@/components/ui/tone";
import { errorMessage } from "@/lib/api-client";

export type ListSettingItem = { id: string; text: string; meta?: string };

/**
 * One of the shared lists on Settings (payment tags, quick notes): where it
 * appears, an add field on top, then each entry with rename and delete. The
 * card owns the busy/error plumbing; the caller passes the three writes.
 */
export default function ListSettingCard({
  title,
  caption,
  icon,
  tone,
  usedIn,
  noun,
  items,
  maxItems,
  maxLength,
  emptyTitle,
  emptyText,
  asPill = false,
  onCreate,
  onRename,
  onDelete,
}: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  tone: Tone;
  /** The screens that offer this list, shown as pills. */
  usedIn: string[];
  /** "tag", "note": field labels, button names and errors. */
  noun: string;
  items: ListSettingItem[];
  maxItems: number;
  maxLength: number;
  emptyTitle: string;
  emptyText: string;
  /** Show each entry as a tag pill (tags) rather than plain text (notes). */
  asPill?: boolean;
  onCreate: (text: string) => Promise<unknown>;
  onRename: (id: string, text: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const router = useAppRouter();
  const [newText, setNewText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = { htmlInput: { maxLength } };
  const full = items.length >= maxItems;

  async function run(write: () => Promise<unknown>, failure: string): Promise<boolean> {
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
    if (await run(() => onCreate(newText), `Couldn't add that ${noun}.`)) setNewText("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { id, text } = editing;
    if (await run(() => onRename(id, text), `Couldn't save that ${noun}.`)) setEditing(null);
  }

  return (
    <SectionCard
      title={title}
      caption={caption}
      icon={icon}
      tone={tone}
      fill
      action={
        <Chip
          size="small"
          color={full ? "warning" : "default"}
          label={`${items.length} / ${maxItems}`}
          aria-label={`${items.length} of at most ${maxItems}`}
        />
      }
    >
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="caption" color="textSecondary">
          Used in
        </Typography>
        {usedIn.map((place) => (
          <TagPill key={place} label={place} />
        ))}
      </Stack>

      <Box component="form" onSubmit={add}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <TextField
            size="small"
            fullWidth
            required
            label={`Add a ${noun}`}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            disabled={full}
            helperText={full ? `At most ${maxItems}; delete one to add another.` : undefined}
            slotProps={limit}
          />
          <LoadingButton type="submit" variant="contained" startIcon={<AddRoundedIcon />} loading={busy} disabled={full}>
            Add
          </LoadingButton>
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {items.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} description={emptyText} />
      ) : (
        <Stack
          component="ul"
          sx={{ listStyle: "none", m: 0, p: 0, borderTop: "1px solid", borderColor: "divider" }}
        >
          {items.map((item) => (
            <Box
              key={item.id}
              component="li"
              sx={{
                py: 0.75,
                px: 1,
                mx: -1,
                borderRadius: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {editing?.id === item.id ? (
                <Stack component="form" onSubmit={saveEdit} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    required
                    label={noun[0].toUpperCase() + noun.slice(1)}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                    slotProps={limit}
                  />
                  <Button size="small" onClick={() => setEditing(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <LoadingButton type="submit" size="small" variant="contained" loading={busy}>
                    Save
                  </LoadingButton>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexGrow: 1, minWidth: 0 }}>
                    {asPill ? (
                      <TagPill label={item.text} />
                    ) : (
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {item.text}
                      </Typography>
                    )}
                    {item.meta ? (
                      <Typography variant="caption" color="textSecondary" noWrap>
                        {item.meta}
                      </Typography>
                    ) : null}
                  </Stack>
                  <IconButton
                    size="small"
                    aria-label={`Edit ${noun}: ${item.text}`}
                    disabled={busy}
                    onClick={() => setEditing({ id: item.id, text: item.text })}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Delete ${noun}: ${item.text}`}
                    disabled={busy}
                    onClick={() => run(() => onDelete(item.id), `Couldn't delete that ${noun}.`)}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}
