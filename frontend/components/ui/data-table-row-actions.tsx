import { Fragment } from "react";
import { MoreHorizontalIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  separatorBefore?: boolean;
}

// Generic action menu — every table's actions column renders one of these
// instead of loose buttons, and the DataTable toolbar reuses it for its own
// overflow ("⋯") menu (Export, etc.) so there's exactly one dropdown-menu
// pattern in the app, not two. Add/remove entries by passing a different
// `actions` list; nothing here is entity-specific.
export function DataTableRowActions({ actions }: { actions: RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
      >
        <MoreHorizontalIcon />
        <span className="sr-only">Open actions menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <Fragment key={action.label}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={action.variant}
              disabled={action.disabled}
              onSelect={action.onClick}
            >
              <action.icon />
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
