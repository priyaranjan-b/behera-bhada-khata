import Box, { type BoxProps } from "@mui/material/Box";

// Odia script with its own font and `lang` so screen readers and font
// fallback treat it as Odia rather than English (see --font-oriya in the root layout).
export function OdiaText({ sx, ...props }: Omit<BoxProps<"span">, "component">) {
  return (
    <Box
      component="span"
      lang="or"
      sx={[{ fontFamily: "var(--font-oriya), sans-serif" }, ...(Array.isArray(sx) ? sx : [sx])]}
      {...props}
    />
  );
}
