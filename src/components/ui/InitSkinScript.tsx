import { INIT_SKIN_SCRIPT } from "@/theme/skin";

/** Restores the Glass skin before the first paint (A29). Server component. */
export function InitSkinScript() {
  return <script dangerouslySetInnerHTML={{ __html: INIT_SKIN_SCRIPT }} />;
}
