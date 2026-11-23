import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AssignmentType, TargetScope } from '../shared/rules';
import type {
  AdminAssignmentView,
  AdminSubmissionView,
  AnalyticsOverview,
  HydratedGroupView,
  StudentDirectoryEntry,
  StudentProgressRow,
} from '../types/api';
import { LayoutShell, type NavItem } from './LayoutShell';

type ProfTab = 'analytics' | 'assignments' | 'tracking';

export function ProfessorDashboard() {
  const { authFetch, realtimeTick } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfTab>('analytics');
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [assignments, setAssignments] = useState<AdminAssignmentView[]>([]);
  const [groups, setGroups] = useState<HydratedGroupView[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmissionView[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgressRow[]>([]);
  const [directory, setDirectory] = useState<StudentDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracking view state
  const [trackingMode, setTrackingMode] = useState<'groups' | 'students' | 'submissions'>('groups');
  const [trackingSearch, setTrackingSearch] = useState('');

  // Create/Edit Assignment Modal
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [asgTitle, setAsgTitle] = useState('');
  const [asgCourse, setAsgCourse] = useState('CS-301');
  const [asgDesc, setAsgDesc] = useState('');
  const [asgDueDate, setAsgDueDate] = useState('2026-12-20');
  const [asgOneDrive, setAsgOneDrive] = useState('https://onedrive.live.com/?id=course-submissions');
  const [asgType, setAsgType] = useState<AssignmentType>('group');
  const [asgScope, setAsgScope] = useState<TargetScope>('all');
  const [asgMaxPoints, setAsgMaxPoints] = useState('100');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [asgFormError, setAsgFormError] = useState<string | null>(null);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Grading Modal
  const [gradingTarget, setGradingTarget] = useState<AdminSubmissionView | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [anaRes, asgRes, grpRes, subRes, stuRes, dirRes] = await Promise.all([
        authFetch<AnalyticsOverview>('/api/analytics/overview'),
        authFetch<{ assignments: AdminAssignmentView[] }>('/api/assignments'),
        authFetch<{ groups: HydratedGroupView[] }>('/api/groups'),
        authFetch<{ submissions: AdminSubmissionView[] }>('/api/submissions'),
        authFetch<{ students: StudentProgressRow[] }>('/api/students/progress'),
        authFetch<{ students: StudentDirectoryEntry[] }>('/api/students/directory'),
      ]);
      setAnalytics(anaRes);
      setAssignments(asgRes.assignments);
      setGroups(grpRes.groups);
      setSubmissions(subRes.submissions);
      setStudentProgress(stuRes.students);
      setDirectory(dirRes.students);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load professor dashboard.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll, realtimeTick]);

  const openCreateAssignment = () => {
    setEditingId(null);
    setAsgTitle('');
    setAsgCourse('CS-301');
    setAsgDesc('');
    setAsgDueDate('2026-12-20');
    setAsgOneDrive('https://onedrive.live.com/?id=cs301-submissions');
    setAsgType('group');
    setAsgScope('all');
    setAsgMaxPoints('100');
    setSelectedStudentIds([]);
    setSelectedGroupIds([]);
    setAsgFormError(null);
    setShowAssignmentModal(true);
  };

  const openEditAssignment = (asg: AdminAssignmentView) => {
    setEditingId(asg._id);
    setAsgTitle(asg.title);
    setAsgCourse(asg.courseCode);
    setAsgDesc(asg.description);
    setAsgDueDate(asg.dueDate.slice(0, 10));
    setAsgOneDrive(asg.oneDriveUrl);
    setAsgType(asg.assignmentType);
    setAsgScope(asg.targetScope);
    setAsgMaxPoints(String(asg.maxPoints));
    setSelectedStudentIds(asg.assignedStudentIds || []);
    setSelectedGroupIds(asg.assignedGroupIds || []);
    setAsgFormError(null);
    setShowAssignmentModal(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAsgFormError(null);
    setSavingAssignment(true);
    try {
      const payload = {
        title: asgTitle,
        courseCode: asgCourse,
        description: asgDesc,
        dueDate: `${asgDueDate}T23:59:00.000Z`,
        oneDriveUrl: asgOneDrive,
        assignmentType: asgType,
        targetScope: asgScope,
        assignedStudentIds: asgScope === 'specific' && asgType === 'individual' ? selectedStudentIds : [],
        assignedGroupIds: asgScope === 'specific' && asgType === 'group' ? selectedGroupIds : [],
        maxPoints: Number(asgMaxPoints) || 100,
      };

      if (editingId) {
        await authFetch(`/api/assignments/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await authFetch('/api/assignments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowAssignmentModal(false);
      await loadAll();
    } catch (err) {
      setAsgFormError(err instanceof Error ? err.message : 'Unable to save assignment.');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete assignment.');
    }
  };

  const openGradeModal = (sub: AdminSubmissionView) => {
    setGradingTarget(sub);
    setGradeValue(sub.grade !== null ? String(sub.grade) : '');
    setGradeFeedback(sub.feedback || '');
    setGradeError(null);
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingTarget) return;
    setGradeError(null);
    setSavingGrade(true);
    try {
      await authFetch(`/api/submissions/${gradingTarget._id}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({
          grade: Number(gradeValue),
          feedback: gradeFeedback,
        }),
      });
      setGradingTarget(null);
      await loadAll();
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : 'Failed to save grade.');
    } finally {
      setSavingGrade(false);
    }
  };

  const filteredGroups = useMemo(() => {
    const q = trackingSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.courseCode.toLowerCase().includes(q) ||
        g.assignmentTitle.toLowerCase().includes(q) ||
        g.members.some((m) => m.name.toLowerCase().includes(q) || m.studentId.toLowerCase().includes(q))
    );
  }, [groups, trackingSearch]);

  const filteredStudents = useMemo(() => {
    const q = trackingSearch.trim().toLowerCase();
    if (!q) return studentProgress;
    return studentProgress.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [studentProgress, trackingSearch]);

  const filteredSubmissions = useMemo(() => {
    const q = trackingSearch.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.assignmentTitle.toLowerCase().includes(q) ||
        s.courseCode.toLowerCase().includes(q) ||
        (s.groupName && s.groupName.toLowerCase().includes(q)) ||
        (s.studentName && s.studentName.toLowerCase().includes(q)) ||
        s.confirmedByName.toLowerCase().includes(q)
    );
  }, [submissions, trackingSearch]);

  const navItems: NavItem[] = [
    { id: 'analytics', label: 'Analytics & Feed', icon: BarChart3 },
    { id: 'assignments', label: 'Assignments', icon: BookOpen, badge: assignments.length },
    { id: 'tracking', label: 'Progress & Grading', icon: Users, badge: submissions.length },
  ];

  const tabTitles: Record<ProfTab, string> = {
    analytics: 'Class Analytics & Real-Time Collaboration',
    assignments: 'Assignment Management',
    tracking: 'Group & Individual Progress Tracking',
  };

  return (
    <LayoutShell
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(id) => setActiveTab(id as ProfTab)}
      breadcrumbTitle={tabTitles[activeTab]}
      primaryAction={
        <button
          type="button"
          onClick={openCreateAssignment}
          className="h-9 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Assignment</span>
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
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {activeTab === 'analytics' && analytics && (
            <div className="space-y-8">
              {/* 4-column KPI strip */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Assignments</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 mt-1">
                    {analytics.kpis.totalAssignments}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{analytics.kpis.totalStudents} enrolled students</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Completion Rate</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-emerald-700 mt-1">
                    {analytics.kpis.avgCompletionRate}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {analytics.kpis.totalSubmissions} verified uploads
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Active Groups</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 mt-1">
                    {analytics.kpis.activeGroups}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {analytics.kpis.pendingGrading} awaiting grading
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Average Grade</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 mt-1">
                    {analytics.kpis.overallAvgGrade !== null ? `${analytics.kpis.overallAvgGrade}%` : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {analytics.kpis.gradedSubmissions} graded submissions
                  </p>
                </div>
              </section>

              {/* Chart + Real-time Collaboration Feed */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Completion Rate by Assignment
                      </h2>
                      <p className="text-xs text-slate-500">
                        Verified OneDrive submission rate and average score per task
                      </p>
                    </div>
                  </div>

                  {analytics.assignmentBreakdown.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">No assignments created yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {analytics.assignmentBreakdown.map((item) => (
                        <div key={item.assignmentId} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4 text-xs">
                            <div className="min-w-0 truncate">
                              <span className="font-mono font-semibold text-slate-800">{item.courseCode}</span>
                              <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                              <span className="font-medium text-slate-900">{item.title}</span>
                              <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                              <span className="text-slate-500">
                                {item.assignmentType === 'group'
                                  ? `${item.groupCount} groups`
                                  : 'Individual'}
                              </span>
                            </div>
                            <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                              {item.completionRate}%
                              {item.avgScorePct !== null ? ` · Avg ${item.avgScorePct}%` : ''}
                            </span>
                          </div>

                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                item.completionRate >= 70
                                  ? 'bg-emerald-600'
                                  : item.completionRate >= 35
                                    ? 'bg-blue-700'
                                    : 'bg-amber-600'
                              }`}
                              style={{ width: `${item.completionRate}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Live Collaboration & Submissions
                      </h2>
                      <p className="text-xs text-slate-500">Real-time student group notes & upload confirmations</p>
                    </div>
                  </div>

                  {analytics.activityFeed.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No activity recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                      {analytics.activityFeed.map((evt) => (
                        <div key={evt.id} className="px-6 py-3.5 space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-900 truncate">{evt.actorName}</span>
                            <span className="font-mono tabular-nums text-slate-400 shrink-0">
                              {new Date(evt.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-blue-800 font-medium">{evt.contextLabel}</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{evt.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="space-y-4">
              {assignments.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600">No assignments have been posted yet.</p>
                  <button
                    type="button"
                    onClick={openCreateAssignment}
                    className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white"
                  >
                    Create First Assignment
                  </button>
                </div>
              ) : (
                assignments.map((asg) => (
                  <article
                    key={asg._id}
                    className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    <div className="space-y-2 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-800">{asg.courseCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{asg.assignmentType === 'group' ? 'Group Task' : 'Individual Task'}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {asg.targetScope === 'all'
                            ? asg.assignmentType === 'group'
                              ? 'All Groups'
                              : 'All Students'
                            : asg.assignmentType === 'group'
                              ? `${asg.assignedGroupIds.length} Specific Groups`
                              : `${asg.assignedStudentIds.length} Specific Students`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Due {new Date(asg.dueDate).toLocaleDateString()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{asg.maxPoints} pts</span>
                      </div>

                      <h3 className="font-display text-lg font-semibold text-slate-900">{asg.title}</h3>
                      <p className="text-sm text-slate-600">{asg.description}</p>

                      <div className="pt-1 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                        <span className="font-mono tabular-nums">
                          Submitted: <strong>{asg.stats.submissionCount}</strong> · Graded:{' '}
                          <strong>{asg.stats.gradedCount}</strong> · Rate: <strong>{asg.stats.completionRate}%</strong>
                        </span>
                        <a
                          href={asg.oneDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                        >
                          <span>OneDrive Folder</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditAssignment(asg)}
                        aria-label={`Edit ${asg.title}`}
                        className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(asg._id)}
                        aria-label={`Delete ${asg.title}`}
                        className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg max-w-full overflow-x-auto self-start">
                  <button
                    type="button"
                    onClick={() => setTrackingMode('groups')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      trackingMode === 'groups'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Group-wise Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackingMode('students')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      trackingMode === 'students'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Individual Students
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackingMode('submissions')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      trackingMode === 'submissions'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Submissions & Grading
                  </button>
                </div>

                <div className="w-full sm:w-72">
                  <label htmlFor="prof-tracking-search" className="sr-only">
                    Search groups or students
                  </label>
                  <input
                    id="prof-tracking-search"
                    type="search"
                    value={trackingSearch}
                    onChange={(e) => setTrackingSearch(e.target.value)}
                    placeholder="Search student, ID, group, or course..."
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {trackingMode === 'groups' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-3 px-4">Group & Assignment</th>
                        <th className="py-3 px-4">Members (Max 4)</th>
                        <th className="py-3 px-4">Collaboration</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Grade</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredGroups.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No groups found.
                          </td>
                        </tr>
                      ) : (
                        filteredGroups.map((grp) => {
                          const matchingSub = submissions.find((s) => s._id === grp.submission?._id);
                          const doneMilestones = grp.checklist.filter((c) => c.done).length;
                          return (
                            <tr key={grp._id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 align-top">
                                <p className="font-semibold text-slate-900">{grp.name}</p>
                                <p className="text-xs text-slate-500">
                                  <span className="font-mono">{grp.courseCode}</span> · {grp.assignmentTitle}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <p className="font-mono text-xs font-semibold tabular-nums text-slate-800">
                                  {grp.memberCount} / {grp.maxMembers}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">
                                  {grp.members.map((m) => `${m.name} (${m.studentId})`).join(', ')}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top text-xs text-slate-600">
                                <p className="font-mono tabular-nums">
                                  {doneMilestones}/{grp.checklist.length} tasks · {grp.notes.length} notes
                                </p>
                                {grp.notes[grp.notes.length - 1] && (
                                  <p className="text-slate-500 truncate max-w-[220px] mt-0.5">
                                    Latest: {grp.notes[grp.notes.length - 1].text}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-4 align-top text-xs font-semibold whitespace-nowrap">
                                {grp.submission ? (
                                  <span className="text-emerald-700">
                                    {grp.submission.status === 'graded' ? 'Graded' : 'Submitted'}
                                  </span>
                                ) : (
                                  <span className="text-amber-700">In Progress</span>
                                )}
                              </td>
                              <td className="py-3 px-4 align-top text-right font-mono text-xs tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                {grp.submission?.grade !== null && grp.submission?.grade !== undefined
                                  ? `${grp.submission.grade} / ${grp.maxPoints}`
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 align-top text-right">
                                {matchingSub ? (
                                  <button
                                    type="button"
                                    onClick={() => openGradeModal(matchingSub)}
                                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap"
                                  >
                                    {matchingSub.status === 'graded' ? 'Update Grade' : 'Grade'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">Pending</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {trackingMode === 'students' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-3 px-4">Student ID</th>
                        <th className="py-3 px-4">Name & Gmail</th>
                        <th className="py-3 px-4 text-right">Age</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Completion Rate</th>
                        <th className="py-3 px-4 text-right">Avg Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No students match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((stu) => (
                          <tr key={stu._id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                              {stu.studentId}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{stu.name}</p>
                              <p className="text-xs text-slate-500">{stu.email}</p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                              {stu.age}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">{stu.department}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-700"
                                    style={{ width: `${stu.completionRate}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs tabular-nums font-semibold text-slate-800">
                                  {stu.completionRate}% ({stu.submittedCount}/{stu.totalAssigned})
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums font-semibold text-slate-900">
                              {stu.averageGrade !== null ? `${stu.averageGrade}%` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {trackingMode === 'submissions' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-3 px-4">Assignment</th>
                        <th className="py-3 px-4">Submitter</th>
                        <th className="py-3 px-4">OneDrive Ref</th>
                        <th className="py-3 px-4">Submitted At</th>
                        <th className="py-3 px-4 text-right">Grade</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No confirmed submissions yet.
                          </td>
                        </tr>
                      ) : (
                        filteredSubmissions.map((sub) => (
                          <tr key={sub._id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900">{sub.assignmentTitle}</p>
                              <p className="text-xs text-slate-500">
                                <span className="font-mono">{sub.courseCode}</span> ·{' '}
                                {sub.submissionType === 'group' ? 'Group' : 'Individual'}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {sub.groupName ? (
                                <>
                                  <p className="font-semibold text-slate-900">{sub.groupName}</p>
                                  <p className="text-slate-500">Confirmed by {sub.confirmedByName}</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-semibold text-slate-900">{sub.studentName}</p>
                                  <p className="text-slate-500 font-mono">{sub.studentCode}</p>
                                </>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                              {sub.oneDriveProofNote}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                              {new Date(sub.submittedAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums font-semibold text-slate-900">
                              {sub.grade !== null ? `${sub.grade} / ${sub.maxPoints}` : 'Pending'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => openGradeModal(sub)}
                                className="h-8 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white whitespace-nowrap"
                              >
                                {sub.status === 'graded' ? 'Edit Grade' : 'Grade Submission'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create / Edit Assignment Modal */}
      {showAssignmentModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asg-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 id="asg-modal-title" className="font-display text-base font-semibold text-slate-900">
                {editingId ? 'Edit Assignment' : 'Create New Assignment'}
              </h2>
              <button
                type="button"
                aria-label="Close assignment modal"
                onClick={() => setShowAssignmentModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="p-6 space-y-4">
              {asgFormError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {asgFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="asg-title" className="block text-xs font-medium text-slate-700 mb-1">
                    Assignment Title
                  </label>
                  <input
                    id="asg-title"
                    type="text"
                    required
                    value={asgTitle}
                    onChange={(e) => setAsgTitle(e.target.value)}
                    placeholder="e.g. Student Attendance Web App"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="asg-course" className="block text-xs font-medium text-slate-700 mb-1">
                    Course Code
                  </label>
                  <input
                    id="asg-course"
                    type="text"
                    required
                    value={asgCourse}
                    onChange={(e) => setAsgCourse(e.target.value)}
                    placeholder="CS-301"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="asg-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Description & Instructions
                </label>
                <textarea
                  id="asg-desc"
                  required
                  rows={3}
                  value={asgDesc}
                  onChange={(e) => setAsgDesc(e.target.value)}
                  placeholder="Describe deliverables and submission expectations..."
                  className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label htmlFor="asg-due" className="block text-xs font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    id="asg-due"
                    type="date"
                    required
                    value={asgDueDate}
                    onChange={(e) => setAsgDueDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="asg-points" className="block text-xs font-medium text-slate-700 mb-1">
                    Max Points
                  </label>
                  <input
                    id="asg-points"
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={asgMaxPoints}
                    onChange={(e) => setAsgMaxPoints(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="asg-onedrive" className="block text-xs font-medium text-slate-700 mb-1">
                    OneDrive Link
                  </label>
                  <input
                    id="asg-onedrive"
                    type="url"
                    required
                    value={asgOneDrive}
                    onChange={(e) => setAsgOneDrive(e.target.value)}
                    placeholder="https://onedrive.live.com/..."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Assignment Type & Target Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1.5">Assignment Format</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAsgType('group')}
                      className={`h-10 px-3 rounded-lg border text-xs font-semibold ${
                        asgType === 'group'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Group (Max 4)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsgType('individual')}
                      className={`h-10 px-3 rounded-lg border text-xs font-semibold ${
                        asgType === 'individual'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Individual
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1.5">Assign To</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAsgScope('all')}
                      className={`h-10 px-3 rounded-lg border text-xs font-semibold ${
                        asgScope === 'all'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {asgType === 'group' ? 'All Groups' : 'All Students'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsgScope('specific')}
                      className={`h-10 px-3 rounded-lg border text-xs font-semibold ${
                        asgScope === 'specific'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {asgType === 'group' ? 'Specific Groups' : 'Specific Students'}
                    </button>
                  </div>
                </div>
              </div>

              {asgScope === 'specific' && asgType === 'individual' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    Select Individual Students ({selectedStudentIds.length} selected)
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {directory.map((stu) => {
                      const checked = selectedStudentIds.includes(stu._id);
                      return (
                        <label
                          key={stu._id}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedStudentIds((prev) =>
                                  checked ? prev.filter((id) => id !== stu._id) : [...prev, stu._id]
                                )
                              }
                            />
                            <span className="font-medium text-slate-900">{stu.name}</span>
                            <span className="text-slate-500">{stu.email}</span>
                          </span>
                          <span className="font-mono text-slate-500">{stu.studentId}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {asgScope === 'specific' && asgType === 'group' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    Select Target Groups ({selectedGroupIds.length} selected)
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {groups.map((grp) => {
                      const checked = selectedGroupIds.includes(grp._id);
                      return (
                        <label
                          key={grp._id}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedGroupIds((prev) =>
                                  checked ? prev.filter((id) => id !== grp._id) : [...prev, grp._id]
                                )
                              }
                            />
                            <span className="font-medium text-slate-900">{grp.name}</span>
                          </span>
                          <span className="font-mono text-slate-500">{grp.memberCount} members</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignmentModal(false)}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAssignment}
                  className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white"
                >
                  {savingAssignment ? 'Saving...' : editingId ? 'Save Changes' : 'Publish Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grading Modal */}
      {gradingTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="grade-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-500">{gradingTarget.courseCode}</p>
                <h2 id="grade-modal-title" className="font-display text-base font-semibold text-slate-900">
                  Grade Submission
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close grading modal"
                onClick={() => setGradingTarget(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGrade} className="p-6 space-y-4">
              <div className="text-xs text-slate-600 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{gradingTarget.assignmentTitle}</p>
                <p>
                  {gradingTarget.groupName
                    ? `Group: ${gradingTarget.groupName} (Confirmed by ${gradingTarget.confirmedByName})`
                    : `Student: ${gradingTarget.studentName} (${gradingTarget.studentCode})`}
                </p>
                {gradingTarget.oneDriveProofNote && (
                  <p className="text-slate-500">OneDrive Ref: {gradingTarget.oneDriveProofNote}</p>
                )}
              </div>

              {gradeError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {gradeError}
                </div>
              )}

              <div>
                <label htmlFor="grade-score-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Score (0 – {gradingTarget.maxPoints} points)
                </label>
                <input
                  id="grade-score-input"
                  type="number"
                  step="0.5"
                  min={0}
                  max={gradingTarget.maxPoints}
                  required
                  value={gradeValue}
                  onChange={(e) => setGradeValue(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="grade-feedback-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Instructor Feedback
                </label>
                <textarea
                  id="grade-feedback-input"
                  rows={3}
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                  placeholder="Provide rubric notes or review comments..."
                  className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGradingTarget(null)}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGrade}
                  className="h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-sm font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingGrade ? 'Saving...' : 'Save Grade'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
