import { Feather, Menu, Search, Settings } from 'lucide-react'

import { NAV_ITEMS } from '@/app/layout/nav-items'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VisuallyHidden } from '@/components/common/visually-hidden'
import { useEditorStore } from '@/stores/editor-store'
import { useUiStore } from '@/stores/ui-store'

import { NavRailLink } from './nav-rail'

export function MobileTopBar() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNavOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const activeProjectId = useEditorStore((s) => s.projectId)

  return (
    <header
      data-edge-chrome
      className="pad-safe-top flex min-h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 shadow-[0_8px_24px_-18px_oklch(0%_0_0/0.6)] lg:hidden"
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
          <VisuallyHidden>
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
          </VisuallyHidden>
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md brand-gradient-surface brand-mark-neon text-primary-foreground shadow-sm">
              <Feather className="size-4" strokeWidth={2} />
            </div>
            <span className="font-serif text-base font-semibold tracking-tight">Inkwell</span>
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setCommandPaletteOpen(true)
              }}
              className="flex h-10 w-full items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 text-left">Jump to…</span>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
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
                collapsed={false}
                className="h-11 text-base"
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>

          <div className="flex items-center gap-1 border-t border-border p-3">
            <ThemeToggle />
            <NavRailLink
              to="/settings"
              label="Settings"
              icon={Settings}
              collapsed={false}
              className="h-11 flex-1 text-base"
              onNavigate={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md brand-gradient-surface brand-mark-neon text-primary-foreground">
          <Feather className="size-3.5" strokeWidth={2} />
        </div>
        <span className="font-serif text-sm font-semibold tracking-tight text-sidebar-foreground">
          Inkwell
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search className="size-4" />
      </Button>
    </header>
  )
}
