import { useState, useCallback } from 'react';

export interface NotificationItem {
  id: number;
  msg: string;
  type: 'info' | 'success' | 'warning' | 'danger';
}

export function useNotifications() {
  const [list, setList] = useState<NotificationItem[]>([]);

  const push = useCallback(
    (msg: string, type: 'info' | 'success' | 'warning' | 'danger' = 'info') => {
      const id = Date.now() + Math.random();
      setList((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => setList((prev) => prev.filter((n) => n.id !== id)), 4500);
    },
    []
  );

  return { list, push };
}
