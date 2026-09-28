import type { ShadCNComponents } from '@blocknote/shadcn'
import type { ReactNode } from 'react'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { Toggle } from '@/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

// The shadcn primitives BlockNote's shadcn adapters render, all twelve groups
// from ui/ (BlockNoteView merges by group, so a group is given whole). This is
// the one place that knows the groups' shape; single-editor-view.tsx hands the
// map to BlockNoteView. Avatar and Skeleton stay the package's: only the
// comments UI, which Plumo does not mount, reads them.

// BlockNote's link form is a react-hook-form FormProvider fed `useForm()`; no
// adapter reads the form state, so the shim drops the methods and renders the
// fields. Typed against the package's group so the contract stays checked.
// eslint-disable-next-line react-refresh/only-export-components -- the map is the module's product, the shim its one component
function Form({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

// BlockNote's Toolbar (formatting and link) wraps itself in the map's
// TooltipProvider with `delayDuration={0}`, and a Radix provider shadows the
// one above it for everything inside. The map hands over a provider that makes
// no context, so a toolbar tooltip reads the one Provider in main.tsx and waits
// and fades like every other.
// eslint-disable-next-line react-refresh/only-export-components -- see Form
function TooltipProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export const blockNoteShadCNComponents: Partial<ShadCNComponents> = {
  Badge: { Badge },
  Button: { Button },
  Card: { Card, CardContent },
  DropdownMenu: {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
  },
  Form: { Form: Form as ShadCNComponents['Form']['Form'] },
  Input: { Input },
  Label: { Label },
  Popover: { Popover, PopoverContent, PopoverTrigger },
  Select: { Select, SelectContent, SelectItem, SelectTrigger, SelectValue },
  Tabs: { Tabs, TabsContent, TabsList, TabsTrigger },
  Toggle: { Toggle },
  Tooltip: { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger },
}
