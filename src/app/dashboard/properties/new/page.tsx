import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/DataComponents";
import PropertyForm from "./PropertyForm";

export default function NewPropertyPage() {
  return (
    <Stack spacing={2}>
      <PageHeader title="Add property" subtitle="A building or plot you rent out units in." />
      <PropertyForm />
    </Stack>
  );
}
