"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { formatBytes } from "@/lib/proofImages";
import { SectionCard } from "./Surfaces";
import LoadingButton from "@/components/ui/Loading/LoadingButton";
import Loader from "@/components/ui/Loading/Loader";

/**
 * Section for attaching several files (photos, PDFs): a picker that also
 * takes drag-and-drop, then a removable list with image thumbnails. The
 * parent owns the list; `prepare` can transform each picked file first
 * (e.g. downscale a photo). Limits are shown and enforced on pick.
 */
export function FileAttachmentsField({
  title,
  caption,
  files,
  onChange,
  accept,
  maxFiles,
  maxTotalBytes,
  prepare,
  disabled = false,
}: {
  title: string;
  caption?: string;
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  maxFiles: number;
  maxTotalBytes: number;
  prepare?: (file: File) => Promise<File>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files]
  );
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const full = files.length >= maxFiles;

  async function add(picked: File[]) {
    setError(null);
    const accepted = accept.split(",");
    const usable = picked.filter((f) => accepted.includes(f.type) || (f.type === "" && /\.(heic|heif)$/i.test(f.name)));
    if (usable.length < picked.length) setError("Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be attached.");
    const room = maxFiles - files.length;
    if (usable.length > room) setError(`You can attach up to ${maxFiles} files.`);
    if (room <= 0 || usable.length === 0) return;

    setBusy(true);
    try {
      const prepared = await Promise.all(usable.slice(0, room).map((f) => (prepare ? prepare(f) : f)));
      const next = [...files];
      let total = totalBytes;
      for (const f of prepared) {
        if (total + f.size > maxTotalBytes) {
          setError(`"${f.name}" would take the attachments over ${formatBytes(maxTotalBytes)}.`);
          continue;
        }
        next.push(f);
        total += f.size;
      }
      onChange(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title={title}
      caption={caption}
      icon={<AttachFileRoundedIcon />}
      action={
        <Typography variant="caption" color="textSecondary">
          {files.length}/{maxFiles} · {formatBytes(totalBytes)} of {formatBytes(maxTotalBytes)}
        </Typography>
      }
    >
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !full) void add([...e.dataTransfer.files]);
        }}
        sx={{
          border: "2px dashed",
          borderColor: dragging ? "primary.main" : "divider",
          borderRadius: 1.5,
          p: 2,
          textAlign: "center",
          bgcolor: dragging ? "action.hover" : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = "";
            void add(picked);
          }}
        />
        <Stack spacing={1} sx={{ alignItems: "center" }}>
          <LoadingButton
            variant="outlined"
            startIcon={<AttachFileRoundedIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={disabled || full}
            loading={busy}
          >
            {full ? "Limit reached" : "Add photos or PDFs"}
          </LoadingButton>
          <Typography variant="caption" color="textSecondary">
            or drop files here
          </Typography>
        </Stack>
      </Box>

      {busy ? <Loader variant="bar" label="Preparing files" /> : null}
      {error ? (
        <Typography variant="caption" color="error" role="alert">
          {error}
        </Typography>
      ) : null}

      {files.length > 0 ? (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {files.map((f, i) => (
            <Stack
              key={`${f.name}-${f.size}-${i}`}
              component="li"
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", minWidth: 0 }}
            >
              <Avatar variant="rounded" src={previews[i] ?? undefined} alt="" sx={{ width: 40, height: 40 }}>
                <PictureAsPdfRoundedIcon fontSize="small" />
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={f.name}>
                  {f.name}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {formatBytes(f.size)}
                </Typography>
              </Box>
              <IconButton
                size="small"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  onChange(files.filter((_, j) => j !== i));
                }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </SectionCard>
  );
}
