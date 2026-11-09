import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";
import { apiHref, apiPaths } from "@/lib/api-client";
import type { TenantDocumentView } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";

/**
 * The tenant portal's Documents tab (A32): the files the owner keeps on the
 * signed-in tenant, each opening a short-lived link. View only - adding and
 * deleting stay on the owner's Edit tenant page.
 */
export default async function TenantDocumentsList({ documents }: { documents: Promise<TenantDocumentView[]> }) {
  const files = await documents;
  return (
    <SectionCard title="Documents" caption="Agreement, ID proof and other files your landlord keeps for you">
      {files.length === 0 ? (
        <EmptyState icon={<FolderOpenRoundedIcon />} title="No documents yet" description="Ask your landlord if you need a copy of your agreement." />
      ) : (
        <List disablePadding>
          {files.map((doc) => (
            <ListItemButton
              key={doc.id}
              component="a"
              href={apiHref(apiPaths.tenant.document(doc.id))}
              target="_blank"
              rel="noopener"
              divider
              aria-label={`Open ${doc.documentType}: ${doc.fileName}`}
            >
              <ListItemIcon>
                {doc.contentType === "application/pdf" ? <PictureAsPdfOutlinedIcon /> : <ImageOutlinedIcon />}
              </ListItemIcon>
              <ListItemText
                primary={doc.documentType}
                secondary={`${doc.fileName} · added ${formatDateTime(doc.uploadedAt)}`}
                slotProps={{ secondary: { noWrap: true } }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </SectionCard>
  );
}
