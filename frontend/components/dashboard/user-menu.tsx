"use client";

import { LogOutIcon } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "./nav-items";
import type { CurrentUser } from "@/lib/auth/current-user";

function initials(user: CurrentUser): string {
  const source = user.email ?? user.phoneNumber ?? user.systemId ?? "?";
  return source.charAt(0).toUpperCase();
}

function identityLabel(user: CurrentUser): string {
  return user.email ?? user.phoneNumber ?? user.systemId ?? "Unknown";
}

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials(user)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{identityLabel(user)}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {ROLE_LABEL[user.role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
