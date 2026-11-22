import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The font sheet starts as media="print" so an unreachable font CDN cannot
// block the module script. Once the app is booting, let the fonts apply.
const fontSheet = document.getElementById("font-sheet")
if (fontSheet instanceof HTMLLinkElement) fontSheet.media = "all"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration is an enhancement; the app works without it.
    });
  });
}
