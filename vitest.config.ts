import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Форки вместо тредов: у каждого процесса своё SQLite-соединение,
    // что исключает борьбу за файлы БД и делает уборку каталогов надёжной на Windows.
    pool: 'forks',
    // Vitest ≤3: один форк на все файлы.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Vitest ≥4: эквивалент singleFork — один воркер и последовательный запуск файлов.
    maxWorkers: 1,
    fileParallelism: false,
  },
});
