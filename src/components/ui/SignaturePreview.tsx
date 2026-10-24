import Box from "@mui/material/Box";

/** A signature image on white, as it prints on the receipt (so dark ink shows in dark mode too). */
export function SignaturePreview({ src, height = 80 }: { src: string; height?: number }) {
  return (
    <Box sx={{ bgcolor: "common.white", borderRadius: 1, border: "1px solid", borderColor: "divider", p: 1 }}>
      <Box component="img" src={src} alt="Signature" sx={{ display: "block", height, maxWidth: "100%", objectFit: "contain" }} />
    </Box>
  );
}
