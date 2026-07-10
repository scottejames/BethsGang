interface UndoToastStackProps {
  items: { id: string; label: string }[];
  onUndo: (id: string) => void;
}

// Fixed bottom-right — top-center is the reminder banner, bottom-center is the
// now-playing bar, top-right/top-left are the Energy/Account buttons.
export function UndoToastStack({ items, onUndo }: UndoToastStackProps) {
  if (items.length === 0) return null;

  return (
    <div className="undo-toast-stack">
      {items.map((item) => (
        <div key={item.id} className="undo-toast-item" role="status">
          <span className="undo-toast-text">"{item.label}" deleted.</span>
          <button type="button" onClick={() => onUndo(item.id)}>
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
