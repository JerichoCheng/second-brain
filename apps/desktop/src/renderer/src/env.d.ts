/// <reference types="vite/client" />
import type { BrainBridge } from '@shared/ipc'

declare global {
  interface Window {
    brain: BrainBridge
  }
}

export {}
