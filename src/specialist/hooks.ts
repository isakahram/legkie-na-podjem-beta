import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet' | 'laptop';

const detect = (width: number): Viewport => {
  if (width < 720) return 'phone';
  if (width < 1120) return 'tablet';
  return 'laptop';
};

/**
 * Текущий класс устройства.
 * Телефон — режим просмотра: редактирование скрывается, чтобы не плодить ошибочные правки.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() =>
    typeof window === 'undefined' ? 'laptop' : detect(window.innerWidth),
  );

  useEffect(() => {
    const onResize = (): void => setViewport(detect(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return viewport;
}

/** Значение состояния, сохраняемое между перезагрузками (период дашборда и т. п.). */
export function usePersistentState<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    return (window.localStorage.getItem(key) as T) || initial;
  });

  const update = (next: T): void => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // приватный режим браузера — просто держим значение в памяти
    }
  };

  return [value, update];
}
