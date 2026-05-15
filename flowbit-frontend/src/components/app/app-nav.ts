import {
  faArrowTrendUp,
  faBoxArchive,
  faFileInvoice,
  faFolderOpen,
  faHeadset,
  faIdBadge,
  faLayerGroup,
  faCalendarDays,
  faBell,
  faPlus,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

export const primaryNavItems = [
  { label: "Dashboard", href: "/", icon: faArrowTrendUp },
  { label: "Create Tickets", href: "/tickets/create", icon: faPlus },
  { label: "Period", href: "/periods", icon: faCalendarDays },
  { label: "Ledgers", href: "/ledgers", icon: faLayerGroup },
  { label: "Spill over", href: "/spill-over", icon: faTriangleExclamation },
  { label: "Tickets", href: "/tickets", icon: faFileInvoice },
  { label: "Notifications", href: "/notifications", icon: faBell },
  { label: "Profile", href: "/profile", icon: faIdBadge },
  { label: "Export", href: "/export-ledger", icon: faFolderOpen },
  { label: "Archive", href: "/archive", icon: faBoxArchive },
  { label: "Customer Service", href: "/contact-support", icon: faHeadset },
] as const;
