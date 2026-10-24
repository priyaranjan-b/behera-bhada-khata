"use client";

import { useRef, useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { SectionCard } from "@/components/ui";
import { api, apiHref, apiPaths, errorMessage } from "@/lib/api-client";
import type { TenantDocumentView } from "@/lib/contracts";
import { dateKeyOf } from "@/lib/dates";
import { formatBytes, prepareProofFile } from "@/lib/proofImages";
import { DOCUMENT_LIMITS, TENANT_DOCUMENT_TYPES } from "@/lib/validation";
import LoadingButton from "@/components/ui/Loading/LoadingButton";
import Loader from "@/components/ui/Loading/Loader";

/** A file added on the Edit tenant page with its own type; uploaded when the form is saved. */
export interface PendingDocument {
  file: File;
  documentType: string;
}

function FileIcon({ contentType }: { contentType: string }) {
  return (
    <Avatar variant="soft" sx={{ width: 36, height: 36 }}>
      {contentType === "application/pdf" ? (
        <PictureAsPdfOutlinedIcon fontSize="small" />
      ) : (
        <ImageOutlinedIcon fontSize="small" />
      )}
    </Avatar>
  );
}

/**
 * The Edit tenant page's documents (0011). "+ Add files" adds files to
 * `pending`, one row per file with its own type (pick or type your own) -
 * file and type map one to one. TenantForm uploads them when the form is
 * saved. Deleting an already-saved document happens straight away, after a
 * confirmation. Photos are compressed in the browser as they're added.
 */
export default function TenantDocumentsCard({
  tenantId,
  documents: saved,
  pending,
  onPendingChange,
  disabled = false,
}: {
  tenantId: string;
  documents: TenantDocumentView[];
  pending: PendingDocument[];
  onPendingChange: (pending: PendingDocument[]) => void;
  disabled?: boolean;
}) {
  const router = useAppRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(saved);
  const [preparing, setPreparing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<TenantDocumentView | null>(null);
  const busy = disabled || preparing || deleting;
  const pendingBytes = pending.reduce((sum, d) => sum + d.file.size, 0);

  async function add(picked: File[]) {
    setError(null);
    const room = DOCUMENT_LIMITS.maxFiles - pending.length;
    if (picked.length > room) {
      setError(`You can add up to ${DOCUMENT_LIMITS.maxFiles} files per save.`);
      picked = picked.slice(0, Math.max(room, 0));
    }
    if (picked.length === 0) return;
    setPreparing(true);
    try {
      const prepared = await Promise.all(picked.map(prepareProofFile));
      const next = [...pending];
      let total = pendingBytes;
      for (const file of prepared) {
        if (total + file.size > DOCUMENT_LIMITS.maxTotalBytes) {
          setError(`"${file.name}" would take this save over ${formatBytes(DOCUMENT_LIMITS.maxTotalBytes)}; save, then add it.`);
          continue;
        }
        next.push({ file, documentType: "" });
        total += file.size;
      }
      onPendingChange(next);
    } finally {
      setPreparing(false);
    }
  }

  function setType(index: number, documentType: string) {
    onPendingChange(pending.map((d, i) => (i === index ? { ...d, documentType } : d)));
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.dashboard.tenants.deleteDocument(tenantId, toDelete.id);
      setDocuments((docs) => docs.filter((d) => d.id !== toDelete.id));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that document."));
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title="Documents"
      caption="ID proof, passport photo, rent agreement… Photos or PDFs, kept privately with this tenant."
      icon={<DescriptionOutlinedIcon />}
      action={
        <LoadingButton
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={busy || pending.length >= DOCUMENT_LIMITS.maxFiles}
          loading={preparing}
        >
          Add files
        </LoadingButton>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_LIMITS.accept}
        multiple
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          void add(picked);
        }}
      />
      {preparing ? <Loader variant="bar" label="Preparing files" /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      {pending.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="caption" color="textSecondary">
            New - uploaded when you save ({pending.length}/{DOCUMENT_LIMITS.maxFiles} · {formatBytes(pendingBytes)} of{" "}
            {formatBytes(DOCUMENT_LIMITS.maxTotalBytes)})
          </Typography>
          {pending.map((doc, i) => (
            // One row per file: name on the left, its type on the right, centred on one line
            // (the type drops under the name on phones).
            <Stack
              key={`${doc.file.name}-${doc.file.size}-${i}`}
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { xs: "stretch", sm: "center" } }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                <FileIcon contentType={doc.file.type} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={doc.file.name}>
                    {doc.file.name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" component="p">
                    {formatBytes(doc.file.size)}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  fullWidth
                  options={TENANT_DOCUMENT_TYPES as readonly string[]}
                  inputValue={doc.documentType}
                  onInputChange={(_e, value) => setType(i, value)}
                  disabled={busy}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Document type"
                      placeholder="Pick one or type your own"
                      required
                      // Inside the tenant form: Enter here mustn't submit it.
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                  )}
                />
                <IconButton
                  size="small"
                  aria-label={`Remove ${doc.file.name}`}
                  disabled={busy}
                  onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>
      ) : null}

      {documents.length === 0 && pending.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No documents yet. Use &quot;Add files&quot;, then Save.
        </Typography>
      ) : null}
      {documents.length > 0 ? (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {documents.map((doc) => (
            <Stack key={doc.id} component="li" direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
              <FileIcon contentType={doc.contentType} />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {doc.documentType}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap component="p" title={doc.fileName}>
                  {doc.fileName} · {formatBytes(doc.sizeBytes)} · {dateKeyOf(doc.uploadedAt)}
                </Typography>
              </Box>
              <IconButton
                size="small"
                component="a"
                href={apiHref(apiPaths.dashboard.tenants.document(tenantId, doc.id))}
                target="_blank"
                rel="noopener"
                aria-label={`Open ${doc.documentType}: ${doc.fileName}`}
              >
                <OpenInNewRoundedIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setToDelete(doc)}
                disabled={busy}
                aria-label={`Delete ${doc.documentType}: ${doc.fileName}`}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      ) : null}

      <Dialog open={Boolean(toDelete)} onClose={() => !deleting && setToDelete(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this document?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary">
            {toDelete ? `${toDelete.documentType} - ${toDelete.fileName}` : ""} will be removed for good, straight away.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <LoadingButton variant="contained" color="error" onClick={confirmDelete} loading={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
