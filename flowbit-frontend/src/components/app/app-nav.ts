import {
  faArrowTrendUp,
  faBoxArchive,
  faFileInvoice,
  faFolderOpen,
  faHeadset,
  faIdBadge,
  faLayerGroup,
  faPlus,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

export const primaryNavItems = [
  { label: "Dashboard", href: "/", icon: faArrowTrendUp },
  { label: "Create Tickets", href: "/tickets/create", icon: faPlus },
  { label: "Ledgers", href: "/ledgers", icon: faLayerGroup },
  { label: "Spill over", href: "/spill-over", icon: faTriangleExclamation },
  { label: "Tickets", href: "/tickets", icon: faFileInvoice },
  { label: "Profile", href: "/profile", icon: faIdBadge },
  { label: "Export Ledger", href: "/export-ledger", icon: faFolderOpen },
  { label: "Archive", href: "/archive", icon: faBoxArchive },
  { label: "Contact Support", href: "/contact-support", icon: faHeadset },
] as const;
