import type { PaidDirectState } from "@/lib/contracts";
import type { PaidDirectView } from "@/lib/types";
import AsyncSection from "@/components/ui/AsyncSection";
import PaidDirectSwitch from "@/components/domain/PaidDirectSwitch";

/**
 * "Include Govt paid direct" as a context bar option (A11, A24): streams in on
 * its own call, shows nothing while loading or on error, and remounts when
 * the view changes.
 */
export default function PaidDirectOption({ view, state }: { view: PaidDirectView; state: Promise<PaidDirectState> }) {
  return (
    <AsyncSection key={view} title="Include Govt paid direct" fallback={null} silent>
      <PaidDirectSwitch state={state} />
    </AsyncSection>
  );
}
