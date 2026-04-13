'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '../../lib/i18n';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'danger',
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        border: 'none',
        background: 'transparent',
        padding: 0,
        maxWidth: 'none',
        maxHeight: 'none',
        width: '100vw',
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        zIndex: 200,
      }}
    >
      <div
        className="confirmation-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel || t('common.delete')}
          </button>
        </div>
      </div>

      <style jsx>{`
        dialog::backdrop {
          background: rgba(26, 26, 46, 0.4);
          backdrop-filter: blur(4px);
        }
      `}</style>
    </dialog>
  );
}
