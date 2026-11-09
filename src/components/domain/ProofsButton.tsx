"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import type { LedgerProof } from "@/lib/domain/tenantLedger";
import { apiHref, apiPaths } from "@/lib/api-client";

/**
 * "📎 2" for a payment's proof files; each opens in a new tab via a
 * short-lived signed URL. `source`: the owner's API, or the signed-in
 * tenant's own (the portal, A32).
 */
export default function ProofsButton({
  paymentId,
  proofs,
  source = "owner",
}: {
  paymentId: string;
  proofs: LedgerProof[];
  source?: "owner" | "tenant";
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (proofs.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        startIcon={<AttachFileRoundedIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`${proofs.length} proof file${proofs.length === 1 ? "" : "s"}`}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
      >
        {proofs.length}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {proofs.map((proof) => (
          <MenuItem
            key={proof.id}
            component="a"
            href={apiHref(
              source === "tenant"
                ? apiPaths.tenant.proof(paymentId, proof.id)
                : apiPaths.dashboard.payments.proof(paymentId, proof.id)
            )}
            target="_blank"
            rel="noopener"
            onClick={() => setAnchor(null)}
          >
            <ListItemIcon>
              {proof.contentType === "application/pdf" ? (
                <PictureAsPdfOutlinedIcon fontSize="small" />
              ) : (
                <ImageOutlinedIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText slotProps={{ primary: { noWrap: true, sx: { maxWidth: 260 } } }}>{proof.fileName}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
