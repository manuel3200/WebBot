export default function ConfirmModal({ isOpen, onClose, onConfirm, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex justify-center items-center">
      <div className="bg-[var(--panel)] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-[var(--sidebar)] animate-fadeIn">
        <h2 className="text-2xl font-black mb-6 text-[var(--primary)] drop-shadow">{title}</h2>
        <div className="mb-8 text-[var(--text)]">{children}</div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="button-secondary font-bold"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="button-main bg-gradient-to-r from-[var(--danger)] to-pink-500 hover:from-pink-500 hover:to-[var(--danger)]"
          >
            Confirmar Eliminación
          </button>
        </div>
      </div>
      <style jsx>{`
        .animate-fadeIn {
          animation: fadeInModal 0.24s cubic-bezier(0.4,0.3,0.2,1) both;
        }
        @keyframes fadeInModal {
          0% { opacity: 0; transform: scale(0.92);}
          100% { opacity: 1; transform: scale(1);}
        }
      `}</style>
    </div>
  );
}
