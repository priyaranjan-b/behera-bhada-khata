import { Suspense } from "react";
import Badge from "@mui/material/Badge";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import type { TenantDocumentView } from "@/lib/contracts";

// The tenant portal's Documents icon in the phone bottom bar (A32): how many
// documents there are. It waits for them on its own and shows the plain icon
// meanwhile, or if they fail (the tab then shows the error).

async function DocumentsBadge({ documents }: { documents: Promise<TenantDocumentView[]> }) {
  const count = await documents.then(
    (d) => d.length,
    () => 0
  );
  return (
    <Badge color="primary" badgeContent={count} max={9}>
      <FolderOpenRoundedIcon />
    </Badge>
  );
}

export default function DocumentsSectionIcon({ documents }: { documents: Promise<TenantDocumentView[]> }) {
  return (
    <Suspense fallback={<FolderOpenRoundedIcon />}>
      <DocumentsBadge documents={documents} />
    </Suspense>
  );
}
