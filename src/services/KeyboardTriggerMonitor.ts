import { uIOhook, UiohookKey, UiohookKeyboardEvent } from 'uiohook-napi';

const DOUBLE_TAP_MS = 400;

export class KeyboardTriggerMonitor {
  private active = false;
  private lastCopyTime = 0;
  private onDoubleCopy: (() => void) | null = null;

  private readonly handleKeydown = (event: UiohookKeyboardEvent): void => {
    try {
      if (event.keycode !== UiohookKey.C || event.shiftKey || event.altKey) {
        return;
      }

      const hasCopyModifier = process.platform === 'darwin'
        ? event.metaKey === true && event.ctrlKey !== true
        : event.ctrlKey === true;

      if (!hasCopyModifier) {
        return;
      }

      const now = Date.now();
      if (this.lastCopyTime > 0 && now - this.lastCopyTime <= DOUBLE_TAP_MS) {
        this.lastCopyTime = 0;
        this.onDoubleCopy?.();
        return;
      }

      this.lastCopyTime = now;
    } catch (error) {
      console.error('[keyboard-trigger] keydown handler error:', error);
    }
  };

  start(onDoubleCopy: () => void): boolean {
    if (this.active) {
      return true;
    }

    try {
      this.onDoubleCopy = onDoubleCopy;
      uIOhook.on('keydown', this.handleKeydown);
      uIOhook.start();
      this.active = true;
      return true;
    } catch (error) {
      console.error('[keyboard-trigger] failed to start uIOhook:', error);
      try {
        uIOhook.removeListener('keydown', this.handleKeydown);
      } catch (cleanupError) {
        console.error('[keyboard-trigger] failed to clean up keydown listener:', cleanupError);
      }
      this.onDoubleCopy = null;
      this.lastCopyTime = 0;
      return false;
    }
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    try {
      uIOhook.removeListener('keydown', this.handleKeydown);
    } catch (error) {
      console.error('[keyboard-trigger] failed to remove keydown listener:', error);
    }

    try {
      uIOhook.stop();
    } catch (error) {
      console.error('[keyboard-trigger] failed to stop uIOhook:', error);
    } finally {
      this.active = false;
      this.onDoubleCopy = null;
      this.lastCopyTime = 0;
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

let instance: KeyboardTriggerMonitor | null = null;

export function getKeyboardTriggerMonitor(): KeyboardTriggerMonitor {
  if (!instance) {
    instance = new KeyboardTriggerMonitor();
  }
  return instance;
}
