export function Loading({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading__bubble" />
      <span className="loading__bubble" />
      <span className="loading__bubble" />
      <span>{label}</span>
    </div>
  );
}
