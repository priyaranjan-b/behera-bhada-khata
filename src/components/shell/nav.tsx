import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";

export type AppTab = "summary" | "properties" | "houses" | "tenants" | "defaulters" | "addTenant" | "addHouse";

export const NAV_ITEMS: { tab: AppTab; href: string; label: string; icon: React.ReactNode }[] = [
  { tab: "summary", href: "/dashboard", label: "Summary", icon: <SpaceDashboardRoundedIcon /> },
  { tab: "properties", href: "/dashboard/properties", label: "Properties", icon: <ApartmentRoundedIcon /> },
  { tab: "houses", href: "/dashboard/houses", label: "Houses", icon: <HomeWorkRoundedIcon /> },
  { tab: "tenants", href: "/dashboard/tenants", label: "Tenants", icon: <PeopleRoundedIcon /> },
  { tab: "defaulters", href: "/dashboard/defaulters", label: "Defaulters", icon: <PendingActionsRoundedIcon /> },
];

/** Shortcuts under the main menu: start a form without first opening a tower. */
export const QUICK_ADD_ITEMS: { tab: AppTab; href: string; label: string; icon: React.ReactNode }[] = [
  { tab: "addTenant", href: "/dashboard/tenants/new", label: "Add tenant", icon: <PersonAddAltRoundedIcon /> },
  { tab: "addHouse", href: "/dashboard/houses/new", label: "Add house", icon: <AddHomeWorkRoundedIcon /> },
];

export const SIDEBAR_WIDTH = 240;
/** Desktop top bar height; the side menu's brand block matches it so their bottom borders line up. */
export const TOPBAR_HEIGHT = 64;
