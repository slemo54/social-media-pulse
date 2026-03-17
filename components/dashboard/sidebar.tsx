"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Mic,
  Settings,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  Menu,
  X,
  Podcast,
  BarChart3,
  Tag,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PLATFORMS, PLATFORM_NAMES, PLATFORM_COLORS } from "@/lib/constants";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [platformsOpen, setPlatformsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const mainNav: NavItem[] = [
    {
      href: "/dashboard",
      label: "Panoramica",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: "/dashboard/executive",
      label: "Report Esecutivo",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      href: "/dashboard/episodes",
      label: "Episodi",
      icon: <Mic className="h-4 w-4" />,
    },
    {
      href: "/dashboard/tags",
      label: "Analisi Tag",
      icon: <Tag className="h-4 w-4" />,
    },
    {
      href: "/dashboard/goals",
      label: "Obiettivi",
      icon: <Target className="h-4 w-4" />,
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Branding */}
      <div className="flex items-center gap-2 px-4 py-5">
        <Podcast className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-semibold text-sm leading-tight">
            Social Media
          </h1>
          <p className="text-xs text-muted-foreground leading-tight">Pulse</p>
        </div>
      </div>

      <Separator />

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {mainNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        {/* Platforms submenu */}
        <button
          onClick={() => setPlatformsOpen(!platformsOpen)}
          className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="flex items-center gap-3">
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                platformsOpen && "rotate-90"
              )}
            />
            Piattaforme
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              platformsOpen && "rotate-180"
            )}
          />
        </button>

        {platformsOpen && (
          <div className="ml-4 space-y-1">
            {PLATFORMS.map((platform) => {
              const href = `/dashboard/platforms/${platform}`;
              return (
                <Link
                  key={platform}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive(href)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: PLATFORM_COLORS[platform],
                    }}
                  />
                  {PLATFORM_NAMES[platform]}
                </Link>
              );
            })}
          </div>
        )}

        <Separator className="my-2" />

        <Link
          href="/dashboard/settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            isActive("/dashboard/settings")
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          Impostazioni
        </Link>
      </nav>

      {/* Dark mode toggle */}
      <div className="px-3 py-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === "dark" ? "Modalità Chiara" : "Modalità Scura"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transition-transform lg:translate-x-0 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
