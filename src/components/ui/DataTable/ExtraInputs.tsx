import Box from "@mui/material/Box";
import { pillControlSx } from "./styles";

/** The caller's own toolbar inputs (e.g. dates) as pills; `fill` stretches them across the phone filter sheet. */
export default function ExtraInputs({ fill = false, children }: { fill?: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        ...pillControlSx,
        "& .MuiInputBase-root": { borderRadius: 999, height: 36 },
        ...(fill ? { "& > *": { width: "100%" }, "& .MuiTextField-root": { flex: 1, minWidth: 0 } } : {}),
      }}
    >
      {children}
    </Box>
  );
}
