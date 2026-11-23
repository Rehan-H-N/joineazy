import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, ShieldCheck, X } from 'lucide-react';
import type { StudentAssignmentView } from '../types/api';

interface TwoStepSubmissionModalProps {
  assignment: StudentAssignmentView;
  onClose: () => void;
  onConfirm: (payload: {
    assignmentId: string;
    confirmedStepOne: boolean;
    confirmedStepTwo: boolean;
    oneDriveProofNote: string;
  }) => Promise<void>;
}

export function TwoStepSubmissionModal({
  assignment,
  onClose,
  onConfirm,
}: TwoStepSubmissionModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [proofNote, setProofNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm({
        assignmentId: assignment._id,
        confirmedStepOne: true,
        confirmedStepTwo: true,
        oneDriveProofNote: proofNote.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record submission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-slate-500">
              {assignment.courseCode} · Step {step} of 2
            </p>
            <h2 id="submission-modal-title" className="font-display text-base font-semibold text-slate-900">
              Verify Assignment Submission
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close submission dialog"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
            <p className="text-xs text-slate-500">
              {assignment.assignmentType === 'group'
                ? `Group submission for ${assignment.myGroupName || 'your team'}`
                : 'Individual submission'}
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Before confirming:</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Make sure your deliverable files have finished uploading to the shared OneDrive submission folder.
                </p>
                <a
                  href={assignment.oneDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline pt-1"
                >
                  <span>Open OneDrive Submission Folder</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-sm font-semibold text-white inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Yes, I have submitted</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleFinalConfirm} className="space-y-4">
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Step 1 verified. Confirm below to lock this submission timestamp for grading.
                </span>
              </div>

              <div>
                <label htmlFor="onedrive-proof-note" className="block text-xs font-medium text-slate-700 mb-1.5">
                  OneDrive File / Folder Name (optional reference)
                </label>
                <input
                  id="onedrive-proof-note"
                  type="text"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  placeholder="e.g. CodeCrafters_DBMS_Report.pdf"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-sm font-semibold text-white"
                >
                  {submitting ? 'Confirming...' : 'Confirm Final Submission'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
