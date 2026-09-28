import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // JSX нужен тестам UI-компонентов кабинета (.test.tsx).
  plugins: [react()],
  test: {
    // Форки вместо тредов: у каждого процесса своё SQLite-соединение,
    // что исключает борьбу за файлы БД и делает уборку каталогов надёжной на Windows.
    pool: 'forks',
    // Один воркер и последовательный запуск файлов.
    maxWorkers: 1,
    fileParallelism: false,
    // Серверные тесты работают в node; UI-тесты объявляют jsdom докблоком
    // `// @vitest-environment jsdom` в начале файла.
    environment: 'node',
  },
});
