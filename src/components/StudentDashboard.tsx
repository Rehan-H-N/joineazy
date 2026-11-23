import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FolderCheck,
  LayoutDashboard,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MAX_GROUP_MEMBERS } from '../shared/rules';
import type {
  HydratedGroupView,
  StudentAssignmentView,
  StudentDirectoryEntry,
} from '../types/api';
import { LayoutShell, type NavItem } from './LayoutShell';
import { TwoStepSubmissionModal } from './TwoStepSubmissionModal';

type StudentTab = 'overview' | 'assignments' | 'groups';

export function StudentDashboard() {
  const { user, authFetch, realtimeTick } = useAuth();
  const [activeTab, setActiveTab] = useState<StudentTab>('overview');
  const [assignments, setAssignments] = useState<StudentAssignmentView[]>([]);
  const [groups, setGroups] = useState<HydratedGroupView[]>([]);
  const [directory, setDirectory] = useState<StudentDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'group' | 'individual'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Two-step submission modal
  const [submissionTarget, setSubmissionTarget] = useState<StudentAssignmentView | null>(null);

  // Create group modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAssignmentId, setNewGroupAssignmentId] = useState('');
  const [initialInviteInput, setInitialInviteInput] = useState('');
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Per-group member invite & note inputs
  const [inviteInputs, setInviteInputs] = useState<Record<string, string>>({});
  const [groupFeedback, setGroupFeedback] = useState<Record<string, { type: 'error' | 'ok'; text: string }>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [checklistInputs, setChecklistInputs] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const [asgRes, grpRes, dirRes] = await Promise.all([
        authFetch<{ assignments: StudentAssignmentView[] }>('/api/assignments'),
        authFetch<{ groups: HydratedGroupView[] }>('/api/groups'),
        authFetch<{ students: StudentDirectoryEntry[] }>('/api/students/directory'),
      ]);
      setAssignments(asgRes.assignments);
      setGroups(grpRes.groups);
      setDirectory(dirRes.students);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadData();
  }, [loadData, realtimeTick]);

  // Derived progress stats
  const progress = useMemo(() => {
    const total = assignments.length;
    const submitted = assignments.filter((a) => Boolean(a.submission)).length;
    const graded = assignments.filter((a) => a.submission?.status === 'graded').length;
    const completionPct = total > 0 ? Math.round((submitted / total) * 100) : 0;

    const gradeValues = assignments
      .filter((a) => a.submission?.status === 'graded' && typeof a.submission.grade === 'number')
      .map((a) => ((a.submission!.grade || 0) / Math.max(a.maxPoints, 1)) * 100);
    const avgGrade =
      gradeValues.length > 0
        ? Math.round((gradeValues.reduce((s, v) => s + v, 0) / gradeValues.length) * 10) / 10
        : null;

    return { total, submitted, graded, completionPct, avgGrade };
  }, [assignments]);

  const groupAssignmentsWithoutTeam = useMemo(() => {
    const myGroupAssignmentIds = new Set(groups.map((g) => g.assignmentId));
    return assignments.filter(
      (a) => a.assignmentType === 'group' && !myGroupAssignmentIds.has(a._id)
    );
  }, [assignments, groups]);

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments.filter((a) => {
      if (typeFilter !== 'all' && a.assignmentType !== typeFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.courseCode.toLowerCase().includes(q) ||
        a.professorDisplayName.toLowerCase().includes(q)
      );
    });
  }, [assignments, typeFilter, searchQuery]);

  const handleConfirmSubmission = async (payload: {
    assignmentId: string;
    confirmedStepOne: boolean;
    confirmedStepTwo: boolean;
    oneDriveProofNote: string;
  }) => {
    await authFetch('/api/submissions/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadData();
  };

  const openCreateGroupModal = (preselectAssignmentId?: string) => {
    setCreateGroupError(null);
    setNewGroupName('');
    setInitialInviteInput('');
    const fallbackId =
      preselectAssignmentId ||
      groupAssignmentsWithoutTeam[0]?._id ||
      assignments.find((a) => a.assignmentType === 'group')?._id ||
      '';
    setNewGroupAssignmentId(fallbackId);
    setShowCreateGroup(true);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateGroupError(null);
    setCreatingGroup(true);
    try {
      const identifiers = initialInviteInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await authFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName,
          assignmentId: newGroupAssignmentId,
          memberIdentifiers: identifiers,
        }),
      });
      setShowCreateGroup(false);
      await loadData();
      setActiveTab('groups');
    } catch (err) {
      setCreateGroupError(err instanceof Error ? err.message : 'Unable to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddMember = async (groupId: string, e: React.FormEvent) => {
    e.preventDefault();
    const identifier = (inviteInputs[groupId] || '').trim();
    if (!identifier) return;
    setGroupFeedback((prev) => ({ ...prev, [groupId]: { type: 'ok', text: '' } }));
    try {
      await authFetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setInviteInputs((prev) => ({ ...prev, [groupId]: '' }));
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'ok', text: 'Member added to group.' },
      }));
      await loadData();
    } catch (err) {
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'error', text: err instanceof Error ? err.message : 'Could not add member.' },
      }));
    }
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    try {
      await authFetch(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'ok', text: 'Roster updated.' },
      }));
      await loadData();
    } catch (err) {
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'error', text: err instanceof Error ? err.message : 'Could not remove member.' },
      }));
    }
  };

  const handlePostNote = async (groupId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = (noteInputs[groupId] || '').trim();
    if (!text) return;
    try {
      await authFetch(`/api/groups/${groupId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setNoteInputs((prev) => ({ ...prev, [groupId]: '' }));
      await loadData();
    } catch (err) {
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'error', text: err instanceof Error ? err.message : 'Failed to post note.' },
      }));
    }
  };

  const handleToggleChecklist = async (groupId: string, itemId: string) => {
    try {
      await authFetch(`/api/groups/${groupId}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ itemId }),
      });
      await loadData();
    } catch (err) {
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'error', text: err instanceof Error ? err.message : 'Failed to update checklist.' },
      }));
    }
  };

  const handleAddChecklistItem = async (groupId: string, e: React.FormEvent) => {
    e.preventDefault();
    const newLabel = (checklistInputs[groupId] || '').trim();
    if (!newLabel) return;
    try {
      await authFetch(`/api/groups/${groupId}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ newLabel }),
      });
      setChecklistInputs((prev) => ({ ...prev, [groupId]: '' }));
      await loadData();
    } catch (err) {
      setGroupFeedback((prev) => ({
        ...prev,
        [groupId]: { type: 'error', text: err instanceof Error ? err.message : 'Failed to add checklist item.' },
      }));
    }
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'assignments', label: 'Assignments', icon: BookOpen, badge: assignments.length },
    { id: 'groups', label: 'My Groups', icon: Users, badge: groups.length },
  ];

  const tabTitles: Record<StudentTab, string> = {
    overview: 'Student Overview',
    assignments: 'Assignments & Submissions',
    groups: 'Group Formation & Collaboration',
  };

  return (
    <LayoutShell
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(id) => setActiveTab(id as StudentTab)}
      breadcrumbTitle={tabTitles[activeTab]}
      primaryAction={
        <button
          type="button"
          onClick={() => openCreateGroupModal()}
          className="h-9 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Group</span>
        </button>
      }
    >
      {error && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Completion Progress Banner */}
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Overall Submission Progress
                    </h2>
                    <p className="text-sm text-slate-600">
                      {progress.submitted} of {progress.total} assigned tasks confirmed via OneDrive verification
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                      {progress.completionPct}%
                    </span>
                    <p className="text-xs text-slate-500">Completed</p>
                  </div>
                </div>

                <div
                  className="w-full h-3 bg-slate-100 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress.completionPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Assignment completion progress"
                >
                  <div
                    className="h-full bg-blue-700 transition-all duration-300"
                    style={{ width: `${progress.completionPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Assigned Tasks</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-slate-900 mt-0.5">
                      {progress.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Confirmed</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-emerald-700 mt-0.5">
                      {progress.submitted}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Graded Average</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-slate-900 mt-0.5">
                      {progress.avgGrade !== null ? `${progress.avgGrade}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Active Groups</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-slate-900 mt-0.5">
                      {groups.length}
                    </p>
                  </div>
                </div>
              </section>

              {/* Two-column summary: Pending Assignments & Active Groups */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Upcoming & Active Assignments
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('assignments')}
                      className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                    >
                      View all
                    </button>
                  </div>

                  {assignments.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      No assignments posted yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {assignments.slice(0, 5).map((asg) => {
                        const isSubmitted = Boolean(asg.submission);
                        return (
                          <div key={asg._id} className="px-6 py-4 flex items-center justify-between gap-4">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono font-medium text-slate-700">{asg.courseCode}</span>
                                <span aria-hidden="true">·</span>
                                <span>{asg.assignmentType === 'group' ? 'Group Task' : 'Individual Task'}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Due {new Date(asg.dueDate).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900 truncate">{asg.title}</p>
                            </div>

                            <div className="shrink-0 flex items-center gap-3">
                              {isSubmitted ? (
                                <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                                  {asg.submission?.status === 'graded'
                                    ? `Graded ${asg.submission.grade}/${asg.maxPoints}`
                                    : 'Submitted'}
                                </span>
                              ) : asg.assignmentType === 'group' && !asg.myGroupId ? (
                                <button
                                  type="button"
                                  onClick={() => openCreateGroupModal(asg._id)}
                                  className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap"
                                >
                                  Form Group
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSubmissionTarget(asg)}
                                  className="h-8 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white whitespace-nowrap"
                                >
                                  Confirm Upload
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900">Your Groups</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('groups')}
                      className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                    >
                      Manage teams
                    </button>
                  </div>

                  {groups.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-sm text-slate-500">You have not joined any groups yet.</p>
                      <button
                        type="button"
                        onClick={() => openCreateGroupModal()}
                        className="h-9 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white"
                      >
                        Create Your First Group
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {groups.map((grp) => {
                        const pct = Math.round((grp.memberCount / MAX_GROUP_MEMBERS) * 100);
                        return (
                          <div key={grp._id} className="p-5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900 truncate">{grp.name}</p>
                              <span className="font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                                {grp.memberCount}/{MAX_GROUP_MEMBERS} members
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {grp.courseCode} · {grp.assignmentTitle}
                            </p>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-800" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-slate-600">
                              {grp.submission
                                ? grp.submission.status === 'graded'
                                  ? `Graded: ${grp.submission.grade}/${grp.maxPoints}`
                                  : `Submitted by ${grp.submission.confirmedByName}`
                                : `${grp.checklist.filter((c) => c.done).length}/${grp.checklist.length} milestones complete`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="space-y-6">
              {/* Filter toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
                  {(['all', 'group', 'individual'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTypeFilter(tab)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        typeFilter === tab
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab === 'all' ? 'All Tasks' : tab === 'group' ? 'Group Tasks' : 'Individual Tasks'}
                    </button>
                  ))}
                </div>

                <div className="w-full sm:w-72">
                  <label htmlFor="student-asg-search" className="sr-only">
                    Search assignments
                  </label>
                  <input
                    id="student-asg-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by course, title, or instructor..."
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {filteredAssignments.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No assignments match your current filter.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAssignments.map((asg) => {
                    const isSubmitted = Boolean(asg.submission);
                    const isGraded = asg.submission?.status === 'graded';
                    const needsGroup = asg.assignmentType === 'group' && !asg.myGroupId;

                    return (
                      <article
                        key={asg._id}
                        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          <div className="space-y-2 max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono font-semibold text-slate-800">{asg.courseCode}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {asg.assignmentType === 'group' ? 'Group Assignment (Max 4)' : 'Individual Assignment'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Instructor: {asg.professorDisplayName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                Due {new Date(asg.dueDate).toLocaleDateString()}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{asg.maxPoints} pts</span>
                            </div>

                            <h3 className="font-display text-lg font-semibold text-slate-900">{asg.title}</h3>
                            <p className="text-sm leading-relaxed text-slate-600">{asg.description}</p>
                          </div>

                          <div className="shrink-0 flex flex-wrap items-center gap-2.5">
                            <a
                              href={asg.oneDriveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span>Open OneDrive Link</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            {isSubmitted ? (
                              <div className="h-10 px-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 inline-flex items-center gap-1.5 whitespace-nowrap">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                <span>
                                  {isGraded
                                    ? `Graded: ${asg.submission!.grade}/${asg.maxPoints}`
                                    : 'Submission Confirmed'}
                                </span>
                              </div>
                            ) : needsGroup ? (
                              <button
                                type="button"
                                onClick={() => openCreateGroupModal(asg._id)}
                                className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap"
                              >
                                Create Group to Submit
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSubmissionTarget(asg)}
                                className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <FolderCheck className="w-4 h-4" />
                                <span>Yes, I have submitted</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {(asg.myGroupName || asg.submission) && (
                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center gap-3">
                              {asg.myGroupName && (
                                <span>
                                  Team: <strong className="text-slate-900">{asg.myGroupName}</strong>
                                </span>
                              )}
                              {asg.submission && (
                                <span>
                                  Confirmed by <strong className="text-slate-900">{asg.submission.confirmedByName}</strong> on{' '}
                                  <span className="font-mono tabular-nums">
                                    {new Date(asg.submission.submittedAt).toLocaleString()}
                                  </span>
                                  {asg.submission.oneDriveProofNote ? ` · Ref: ${asg.submission.oneDriveProofNote}` : ''}
                                </span>
                              )}
                            </div>

                            {asg.submission?.feedback && (
                              <span className="text-slate-700">
                                Instructor feedback: <em>{asg.submission.feedback}</em>
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="space-y-1">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Group Formation Rules
                  </h2>
                  <p className="text-xs text-slate-600">
                    Each group accepts up to {MAX_GROUP_MEMBERS} students. A student cannot join multiple groups for the same assignment task.
                  </p>
                </div>
              </div>

              {groups.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600">You are not part of any assignment groups yet.</p>
                  <button
                    type="button"
                    onClick={() => openCreateGroupModal()}
                    className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white"
                  >
                    Create Your First Group
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map((grp) => {
                    const isFull = grp.memberCount >= MAX_GROUP_MEMBERS;
                    const isLocked = Boolean(grp.submission);
                    const isLeader = grp.leaderId === user?._id;
                    const pct = Math.round((grp.memberCount / MAX_GROUP_MEMBERS) * 100);
                    const feedback = groupFeedback[grp._id];

                    return (
                      <section
                        key={grp._id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono font-semibold text-slate-800">{grp.courseCode}</span>
                              <span aria-hidden="true">·</span>
                              <span>{grp.assignmentTitle}</span>
                            </div>
                            <h3 className="font-display text-lg font-semibold text-slate-900">{grp.name}</h3>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                                {grp.memberCount} / {MAX_GROUP_MEMBERS} Students
                              </p>
                              <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                                <div
                                  className={`h-full ${isFull ? 'bg-emerald-600' : 'bg-blue-700'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            {grp.submission && (
                              <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                                {grp.submission.status === 'graded'
                                  ? `Graded ${grp.submission.grade}/${grp.maxPoints}`
                                  : 'Submitted'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                          {/* Roster + Invite */}
                          <div className="lg:col-span-6 space-y-4">
                            <h4 className="text-xs font-semibold text-slate-700">Team Members</h4>

                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                              {grp.members.map((member) => {
                                const memberIsLeader = member._id === grp.leaderId;
                                const canRemove =
                                  !isLocked &&
                                  !memberIsLeader &&
                                  (isLeader || member._id === user?._id);

                                return (
                                  <div
                                    key={member._id}
                                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-900 truncate">
                                        {member.name}{' '}
                                        {memberIsLeader && (
                                          <span className="text-xs font-normal text-slate-500">· Lead</span>
                                        )}
                                      </p>
                                      <p className="text-xs text-slate-500 truncate">
                                        <span className="font-mono">{member.studentId}</span> · {member.email}
                                      </p>
                                    </div>

                                    {canRemove && (
                                      <button
                                        type="button"
                                        aria-label={`Remove ${member.name} from ${grp.name}`}
                                        onClick={() => handleRemoveMember(grp._id, member._id)}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {feedback && feedback.text && (
                              <p
                                role={feedback.type === 'error' ? 'alert' : 'status'}
                                className={`text-xs p-2.5 rounded-lg border ${
                                  feedback.type === 'error'
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                }`}
                              >
                                {feedback.text}
                              </p>
                            )}

                            {!isLocked && (
                              <form onSubmit={(e) => handleAddMember(grp._id, e)} className="space-y-2">
                                <label
                                  htmlFor={`invite-${grp._id}`}
                                  className="block text-xs font-medium text-slate-700"
                                >
                                  Invite / Add Student (Email or Student ID)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    id={`invite-${grp._id}`}
                                    type="text"
                                    list={`students-list-${grp._id}`}
                                    disabled={isFull}
                                    value={inviteInputs[grp._id] || ''}
                                    onChange={(e) =>
                                      setInviteInputs((prev) => ({ ...prev, [grp._id]: e.target.value }))
                                    }
                                    placeholder={
                                      isFull
                                        ? 'Maximum 4 members reached'
                                        : 'e.g. sneha.iyer@gmail.com or STU-2026-004'
                                    }
                                    className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                  />
                                  <datalist id={`students-list-${grp._id}`}>
                                    {directory
                                      .filter((s) => !grp.memberIds.includes(s._id))
                                      .map((s) => (
                                        <option key={s._id} value={s.email}>
                                          {s.name} ({s.studentId})
                                        </option>
                                      ))}
                                  </datalist>
                                  <button
                                    type="submit"
                                    disabled={isFull}
                                    className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>Add</span>
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>

                          {/* Collaboration Checklist & Notes */}
                          <div className="lg:col-span-6 space-y-5">
                            <div className="space-y-2.5">
                              <h4 className="text-xs font-semibold text-slate-700">Collaboration Milestones</h4>
                              <div className="space-y-1.5">
                                {grp.checklist.map((item) => (
                                  <label
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs"
                                  >
                                    <span className="flex items-center gap-2.5">
                                      <input
                                        type="checkbox"
                                        checked={item.done}
                                        onChange={() => handleToggleChecklist(grp._id, item.id)}
                                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                                      />
                                      <span className={item.done ? 'line-through text-slate-400' : 'text-slate-800'}>
                                        {item.label}
                                      </span>
                                    </span>
                                    <span className="text-slate-400 shrink-0">{item.updatedBy}</span>
                                  </label>
                                ))}
                              </div>

                              <form onSubmit={(e) => handleAddChecklistItem(grp._id, e)} className="flex gap-2">
                                <input
                                  type="text"
                                  aria-label={`Add milestone to ${grp.name}`}
                                  value={checklistInputs[grp._id] || ''}
                                  onChange={(e) =>
                                    setChecklistInputs((prev) => ({ ...prev, [grp._id]: e.target.value }))
                                  }
                                  placeholder="Add milestone task..."
                                  className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                                <button
                                  type="submit"
                                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap"
                                >
                                  Add Task
                                </button>
                              </form>
                            </div>

                            <div className="space-y-2.5 pt-2 border-t border-slate-100">
                              <h4 className="text-xs font-semibold text-slate-700">Team Collaboration Feed</h4>
                              <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                                {grp.notes.map((note) => (
                                  <div key={note.id} className="text-xs bg-slate-50 rounded-lg px-3 py-2">
                                    <div className="flex items-center justify-between gap-2 text-slate-500 mb-0.5">
                                      <span className="font-semibold text-slate-800">{note.authorName}</span>
                                      <span className="font-mono tabular-nums">
                                        {new Date(note.createdAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                    <p className="text-slate-700">{note.text}</p>
                                  </div>
                                ))}
                              </div>

                              <form onSubmit={(e) => handlePostNote(grp._id, e)} className="flex gap-2">
                                <input
                                  type="text"
                                  aria-label={`Post collaboration note for ${grp.name}`}
                                  value={noteInputs[grp._id] || ''}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({ ...prev, [grp._id]: e.target.value }))
                                  }
                                  placeholder="Share progress update with team & instructor..."
                                  className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                                <button
                                  type="submit"
                                  aria-label={`Send note for ${grp.name}`}
                                  className="h-9 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Post</span>
                                </button>
                              </form>
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Two-Step Submission Verification Modal */}
      {submissionTarget && (
        <TwoStepSubmissionModal
          assignment={submissionTarget}
          onClose={() => setSubmissionTarget(null)}
          onConfirm={handleConfirmSubmission}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="create-group-title" className="font-display text-base font-semibold text-slate-900">
                Create New Assignment Group
              </h2>
              <button
                type="button"
                aria-label="Close create group modal"
                onClick={() => setShowCreateGroup(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
              {createGroupError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {createGroupError}
                </div>
              )}

              <div>
                <label htmlFor="group-assignment-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Group Assignment
                </label>
                <select
                  id="group-assignment-select"
                  required
                  value={newGroupAssignmentId}
                  onChange={(e) => setNewGroupAssignmentId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {assignments
                    .filter((a) => a.assignmentType === 'group')
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.courseCode} — {a.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="group-name-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Group Name
                </label>
                <input
                  id="group-name-input"
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Tech Titans"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="initial-members-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Initial Teammates (comma-separated Gmail or Student IDs, max 3 additional)
                </label>
                <input
                  id="initial-members-input"
                  type="text"
                  value={initialInviteInput}
                  onChange={(e) => setInitialInviteInput(e.target.value)}
                  placeholder="e.g. priya.nair@gmail.com, STU-2026-003"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  You are automatically added as team lead. Maximum 4 total members per group.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || !newGroupAssignmentId}
                  className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white"
                >
                  {creatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
