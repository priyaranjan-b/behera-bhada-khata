import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PropertyForm from "./PropertyForm";

export default function NewPropertyPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Add property
      </Typography>
      <PropertyForm />
    </Stack>
  );
}
