import Avatar from "@mui/material/Avatar";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";

/** A saved file's icon in a list: PDF or photo (tenant documents, maintenance receipts). */
export default function FileIcon({ contentType }: { contentType: string }) {
  return (
    <Avatar variant="soft" sx={{ width: 36, height: 36 }}>
      {contentType === "application/pdf" ? <PictureAsPdfOutlinedIcon fontSize="small" /> : <ImageOutlinedIcon fontSize="small" />}
    </Avatar>
  );
}
