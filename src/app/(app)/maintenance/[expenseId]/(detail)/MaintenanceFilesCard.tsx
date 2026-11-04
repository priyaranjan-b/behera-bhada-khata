"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { FileAttachmentsField, SectionCard } from "@/components/ui";
import FileIcon from "@/components/ui/FileIcon";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import { api, apiHref, apiPaths, errorMessage } from "@/lib/api-client";
import type { MaintenanceFileView } from "@/lib/contracts";
import { dateKeyOf, formatDateKey } from "@/lib/dates";
import { formatBytes, prepareProofFile } from "@/lib/proofImages";
import { MAINTENANCE_FILE_LIMITS } from "@/lib/validation";

/**
 * An expense's receipts, bills and photos (0031): open, delete (after a
 * confirmation), or add more - photos are compressed in the browser first.
 */
export default function MaintenanceFilesCard({ expenseId, files: saved }: { expenseId: string; files: MaintenanceFileView[] }) {
  const router = useAppRouter();
  const [files, setFiles] = useState(saved);
  const [adding, setAdding] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MaintenanceFileView | null>(null);

  async function upload() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.dashboard.maintenance.addFiles(expenseId, adding);
      setFiles(result.files);
      setAdding([]);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload those files."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.maintenance.deleteFile(expenseId, toDelete.id);
      setFiles((current) => current.filter((f) => f.id !== toDelete.id));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that file."));
    } finally {
      setToDelete(null);
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <SectionCard title="Receipts & files" caption="Bills, invoices and photos, kept privately with this expense.">
        {error ? <Alert severity="error">{error}</Alert> : null}
        {files.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No files yet.
          </Typography>
        ) : (
          <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
            {files.map((f) => (
              <Stack key={f.id} component="li" direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
                <FileIcon contentType={f.contentType} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={f.fileName}>
                    {f.fileName}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" component="p">
                    {formatBytes(f.sizeBytes)} · {formatDateKey(dateKeyOf(f.uploadedAt))}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  component="a"
                  href={apiHref(apiPaths.dashboard.maintenance.file(expenseId, f.id))}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${f.fileName}`}
                >
                  <OpenInNewRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => setToDelete(f)} disabled={busy} aria-label={`Delete ${f.fileName}`}>
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </SectionCard>

      <FileAttachmentsField
        title="Add files"
        caption="Photos or PDFs."
        files={adding}
        onChange={setAdding}
        accept={MAINTENANCE_FILE_LIMITS.accept}
        maxFiles={MAINTENANCE_FILE_LIMITS.maxFiles}
        maxTotalBytes={MAINTENANCE_FILE_LIMITS.maxTotalBytes}
        prepare={prepareProofFile}
        disabled={busy}
      />
      {adding.length > 0 ? (
        <Box>
          <LoadingButton variant="contained" loading={busy} onClick={upload}>
            Upload {adding.length} file{adding.length === 1 ? "" : "s"}
          </LoadingButton>
        </Box>
      ) : null}

      <Dialog open={toDelete !== null} onClose={() => !busy && setToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this file?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{toDelete?.fileName} will be removed from this expense for good.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton variant="outlined" color="error" loading={busy} onClick={confirmDelete}>
            Delete
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
