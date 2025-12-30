import { EventEmitter } from 'events';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number; // ミリ秒。0の場合は手動で閉じるまで表示
  timestamp: number;
}

/**
 * 通知管理サービス
 * トースト通知の作成、管理、削除を行う
 */
export class NotificationManager extends EventEmitter {
  private notifications: Map<string, Notification> = new Map();
  private notificationQueue: Notification[] = [];
  private maxNotifications = 5;

  /**
   * 通知を追加
   */
  addNotification(
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    duration: number = 3000
  ): string {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration,
      timestamp: Date.now(),
    };

    this.notifications.set(id, notification);
    this.notificationQueue.push(notification);

    // 最大数を超えた場合は古いものを削除
    if (this.notifications.size > this.maxNotifications) {
      const oldest = this.notificationQueue.shift();
      if (oldest) {
        this.notifications.delete(oldest.id);
      }
    }

    // リスナーに通知
    this.emit('notification-added', notification);

    // 自動削除タイマーを設定
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(id);
      }, duration);
    }

    return id;
  }

  /**
   * 成功通知
   */
  success(title: string, message: string, duration?: number): string {
    return this.addNotification('success', title, message, duration);
  }

  /**
   * エラー通知
   */
  error(title: string, message: string, duration?: number): string {
    return this.addNotification('error', title, message, duration ?? 5000);
  }

  /**
   * 情報通知
   */
  info(title: string, message: string, duration?: number): string {
    return this.addNotification('info', title, message, duration);
  }

  /**
   * 警告通知
   */
  warning(title: string, message: string, duration?: number): string {
    return this.addNotification('warning', title, message, duration ?? 4000);
  }

  /**
   * 通知を削除
   */
  removeNotification(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      this.notifications.delete(id);
      this.notificationQueue = this.notificationQueue.filter((n) => n.id !== id);
      this.emit('notification-removed', notification);
    }
  }

  /**
   * すべての通知を削除
   */
  clearAll(): void {
    this.notifications.forEach((notification) => {
      this.emit('notification-removed', notification);
    });
    this.notifications.clear();
    this.notificationQueue = [];
  }

  /**
   * 現在の通知一覧を取得
   */
  getNotifications(): Notification[] {
    return Array.from(this.notifications.values());
  }

  /**
   * 通知数を取得
   */
  getNotificationCount(): number {
    return this.notifications.size;
  }
}

// シングルトンインスタンス
let instance: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!instance) {
    instance = new NotificationManager();
  }
  return instance;
}
