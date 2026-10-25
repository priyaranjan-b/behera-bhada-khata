import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { routes } from "@/lib/routes";

export type AppTab =
  | "summary"
  | "properties"
  | "houses"
  | "tenants"
  | "defaulters"
  | "activity"
  | "addTenant"
  | "addHouse";

export const NAV_ITEMS: { tab: AppTab; href: string; label: string; icon: React.ReactNode }[] = [
  { tab: "summary", href: routes.home, label: "Summary", icon: <SpaceDashboardRoundedIcon /> },
  { tab: "properties", href: routes.properties.list, label: "Properties", icon: <ApartmentRoundedIcon /> },
  { tab: "houses", href: routes.houses.list(), label: "Houses", icon: <HomeWorkRoundedIcon /> },
  { tab: "tenants", href: routes.tenants.list(), label: "Tenants", icon: <PeopleRoundedIcon /> },
  { tab: "defaulters", href: routes.defaulters, label: "Defaulters", icon: <PendingActionsRoundedIcon /> },
  { tab: "activity", href: routes.activity, label: "Activity", icon: <HistoryRoundedIcon /> },
];

/** Shortcuts under the main menu: start a form without first opening a tower. */
export const QUICK_ADD_ITEMS: { tab: AppTab; href: string; label: string; icon: React.ReactNode }[] = [
  { tab: "addTenant", href: routes.tenants.new, label: "Add tenant", icon: <PersonAddAltRoundedIcon /> },
  { tab: "addHouse", href: routes.houses.new, label: "Add house", icon: <AddHomeWorkRoundedIcon /> },
];

export const SIDEBAR_WIDTH = 240;
/** Desktop top bar height; the side menu's brand block matches it so their bottom borders line up. */
export const TOPBAR_HEIGHT = 64;
