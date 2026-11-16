// client/src/components/DecisionModal.jsx
import { useEffect, useState } from 'react';
import { Field, Modal, SeverityBadge } from './ui.jsx';

export default function DecisionModal({ open, finding, onClose, onConfirm, pending }) {
  const [reason, setReason] = useState('');
  const [editedFix, setEditedFix] = useState('');

  useEffect(() => {
    if (finding) {
      setReason('');
      setEditedFix(finding.suggested_fix || '');
    }
  }, [finding]);

  if (!finding) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Override this finding"
      subtitle="Overrides always need a reason. The before and after are written to the audit log."
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm({ status: 'overridden', reason: reason.trim(), editedFix: editedFix.trim() || null })}
          >
            {pending ? 'Saving…' : 'Record override'}
          </button>
        </>
      }
    >
      <div className="stack-sm">
        <div className="row wrap">
          <SeverityBadge severity={finding.severity} />
          <span className="tiny muted">{finding.title || finding.category}</span>
        </div>
        <p className="tiny">{finding.explanation}</p>
        <Field label="Why are you overriding it?" htmlFor="override-reason" hint="Required. Reviewers and managers see this reason.">
          <textarea
            id="override-reason"
            className="textarea"
            style={{ minHeight: 82 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The guideline does not apply to this channel because…"
          />
        </Field>
        <Field label="Replacement suggestion" htmlFor="override-fix" hint="Optional. This replaces the suggested fix on the finding.">
          <textarea
            id="override-fix"
            className="textarea"
            style={{ minHeight: 70 }}
            value={editedFix}
            onChange={(e) => setEditedFix(e.target.value)}
          />
        </Field>
        {finding.source_reference ? (
          <div className="tiny muted">Source: {finding.source_reference}</div>
        ) : null}
      </div>
    </Modal>
  );
}
