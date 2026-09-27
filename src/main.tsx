import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/ui/tooltip'
import { AppPreferencesProvider } from '@/lib/use-app-preferences'
import './index.css'
import App from './app.tsx'
import { applyStoredThemeMode } from '@/shell/theme-mode'
import { installMockVault, isTauri } from '@/platform/tauri'
import { installNativeContextMenuSuppression } from '@/shell/native-context-menu'

function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  if (dataTransfer.files.length > 0) return true
  if (Array.from(dataTransfer.types).includes('Files')) return true

  return Array.from(dataTransfer.items).some((item) => item.kind === 'file')
}

function preventFileDropNavigation(event: DragEvent): void {
  if (!dataTransferHasFiles(event.dataTransfer)) return

  event.preventDefault()
}

document.addEventListener('dragover', preventFileDropNavigation, true)
document.addEventListener('drop', preventFileDropNavigation, true)

if (isTauri()) {
  installNativeContextMenuSuppression(document)
}

applyStoredThemeMode(document, window.localStorage)

// Outside Tauri the in-memory Folder fixture stands in for the Rust side; the
// smoke specs reach it through window.__plumoMockVault.
if (import.meta.env.DEV && !isTauri()) {
  installMockVault()
}

function getRequiredRootElement(): HTMLElement {
  const root = document.getElementById('root')
  if (!root) throw new Error('Plumo root element is missing')
  return root
}

createRoot(getRequiredRootElement()).render(
  <StrictMode>
    <AppPreferencesProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </AppPreferencesProvider>
  </StrictMode>,
)
