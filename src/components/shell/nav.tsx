import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";

export type AppTab = "summary" | "properties" | "tenants";


export const NAV_ITEMS: { tab: AppTab; href: string; label: string; icon: React.ReactNode }[] = [
  { tab: "summary", href: "/dashboard", label: "Summary", icon: <SpaceDashboardRoundedIcon /> },
  { tab: "properties", href: "/dashboard/properties", label: "Properties", icon: <ApartmentRoundedIcon /> },
  { tab: "tenants", href: "/dashboard/tenants", label: "Tenants", icon: <PeopleRoundedIcon /> },
];

export const SIDEBAR_WIDTH = 240;
/** Desktop top bar height; the side menu's brand block matches it so their bottom borders line up. */
export const TOPBAR_HEIGHT = 64;
