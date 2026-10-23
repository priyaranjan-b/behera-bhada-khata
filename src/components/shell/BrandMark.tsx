import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import Link from "@/components/ui/Link";
import { OdiaText } from "@/components/ui/OdiaText";
import { brand } from "@/theme/themePrimitives";

// Glossy indigo tile, same treatment as the template's CustomIcon.
export function BrandIcon({ size = 36 }: { size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "10px",
        display: "grid",
        placeItems: "center",
        color: brand[50],
        backgroundImage: `linear-gradient(135deg, ${brand[600]} 0%, ${brand[700]} 100%)`,
        border: "1px solid",
        borderColor: brand[500],
        boxShadow: "inset 0 2px 5px rgba(255, 255, 255, 0.3)",
      }}
    >
      <MenuBookRoundedIcon sx={{ fontSize: size * 0.55 }} />
    </Box>
  );
}

export function BrandMark({ showOdia = true, iconSize = 36 }: { showOdia?: boolean; iconSize?: number }) {
  return (
    <Stack
      component={Link}
      href="/dashboard"
      direction="row"
      spacing={1.25}
      sx={{ alignItems: "center", minWidth: 0, textDecoration: "none", color: "inherit" }}
    >
      <BrandIcon size={iconSize} />
      <Box sx={{ minWidth: 0 }}>
        <Typography component="p" variant="subtitle2" noWrap color="textPrimary">
          Behera Bhada Khata
        </Typography>
        {showOdia && (
          <Typography variant="caption" color="textSecondary" component="p">
            <OdiaText>ବେହେରା ଭଡ଼ା ଖାତା</OdiaText>
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
