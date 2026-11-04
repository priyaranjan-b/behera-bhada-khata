import { createContext } from "react";

/**
 * True inside a `BottomSheet` (the context bar's view options on phones), so
 * a form there stretches its fields across the sheet instead of keeping its
 * inline widths.
 */
export const InSheetContext = createContext(false);
