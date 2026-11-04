"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { BadgeRow, SectionCard } from "@/components/ui";
import { TagPill } from "@/components/ui/DataDisplay";
import { useAppRouter } from "@/components/ui/Loading";
import EditTagsDialog from "@/components/domain/EditTagsDialog";
import { api } from "@/lib/api-client";

/** Who paid an expense (0031), with an editor; the names are the shared tag suggestions. */
export default function PaidByCard({
  expenseId,
  summary,
  tags,
  suggestions,
}: {
  expenseId: string;
  summary: string;
  tags: string[];
  suggestions: string[];
}) {
  const router = useAppRouter();
  const [editing, setEditing] = useState(false);

  return (
    <SectionCard
      title="Paid by"
      action={
        <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      }
    >
      {tags.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          Not tagged yet.
        </Typography>
      ) : (
        <BadgeRow>
          {tags.map((t) => (
            <TagPill key={t} label={t} />
          ))}
        </BadgeRow>
      )}
      {editing ? (
        <EditTagsDialog
          title="Paid by"
          summary={summary}
          tags={tags}
          suggestions={suggestions}
          label="Paid by"
          helperText="Who paid it - pick one or type a new name"
          save={async (next) => (await api.dashboard.maintenance.setTags(expenseId, { tags: next })).tags}
          onClose={() => setEditing(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </SectionCard>
  );
}
