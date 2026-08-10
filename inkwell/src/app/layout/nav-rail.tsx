import { ChevronsLeft, ChevronsRight, Download, Feather, Search, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { NAV_ITEMS } from '@/app/layout/nav-items'
import { ExternalLink } from '@/components/common/external-link'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'
import { useUiStore } from '@/stores/ui-store'

/** Where the newest Windows installer always lives. */
const WINDOWS_APP_URL = 'https://github.com/ash6677-cyber/ink/releases/latest'

export function NavRail() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const activeProjectId = useEditorStore((s) => s.projectId)

  return (
    <aside
      className={cn(
        'pad-safe-top hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-[8px_0_32px_-20px_oklch(0%_0_0/0.6)] transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md brand-gradient-surface brand-mark-neon text-primary-foreground shadow-sm">
          <Feather className="size-4" strokeWidth={2} />
        </div>
        {!collapsed && (
          <span className="font-serif text-base font-semibold tracking-tight text-sidebar-foreground">
            Inkwell
          </span>
        )}
      </div>

      <div className={cn('px-2 pb-1', collapsed && 'px-2')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open command palette"
              className={cn(
                'flex h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed && 'justify-center border-none bg-transparent px-0',
              )}
            >
              <Search className="size-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Jump to…</span>
                  <kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px]">
                    Ctrl K
                  </kbd>
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Jump to… (Ctrl+K)</TooltipContent>}
        </Tooltip>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <NavRailLink
            key={item.to}
            to={
              item.projectScoped && activeProjectId
                ? `${item.to}?project=${activeProjectId}`
                : item.to
            }
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
          />
        ))}

        {/* In the browser this is the way in; in the installed app it is
            the way to the releases page — the installer for another PC,
            a copy for a friend, and the notes on what changed. */}
        <div className="mt-auto pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <ExternalLink
                href={WINDOWS_APP_URL}
                className={cn(
                  'group flex h-9 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Download className="size-4 shrink-0" strokeWidth={1.9} />
                {!collapsed && (
                  <span className="truncate">
                    {isTauriRuntime() ? 'Desktop app releases' : 'Get the desktop app'}
                  </span>
                )}
              </ExternalLink>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isTauriRuntime()
                ? 'The installer and release notes — for another PC or a friend'
                : 'Free desktop app — works offline, updates itself'}
            </TooltipContent>
          </Tooltip>
        </div>
      </nav>

      <div
        className={cn(
          'flex items-center gap-1 border-t border-sidebar-border p-2',
          collapsed && 'flex-col',
        )}
      >
        <ThemeToggle />
        <NavRailLink
          to="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
          className="flex-1"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {collapsed ? (
                <ChevronsRight className="size-4" />
              ) : (
                <ChevronsLeft className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

export function NavRailLink({
  to,
  label,
  icon: Icon,
  collapsed,
  className,
  onNavigate,
}: {
  to: string
  label: string
  icon: typeof Feather
  collapsed: boolean
  className?: string
  onNavigate?: () => void
}) {
  const link = (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-0',
          isActive && 'bg-accent text-accent-foreground shadow-sm ring-1 ring-primary/15',
          className,
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
          )}
          <Icon className="size-4 shrink-0" strokeWidth={1.9} />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
