import type {
  AssignmentType,
  GroupChecklistItem,
  GroupNote,
  SubmissionStatus,
  TargetScope,
  UserRole,
} from '../shared/rules';

export interface AuthUser {
  _id: string;
  role: UserRole;
  name: string;
  email: string;
  age: number;
  studentId?: string;
  facultyId?: string;
  department: string;
  officeRoom?: string;
  phone?: string;
  createdAt: string;
}

export interface StudentDirectoryEntry {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  department: string;
}

export interface StudentSubmissionBrief {
  _id: string;
  assignmentId: string;
  submissionType: AssignmentType;
  groupId?: string | null;
  studentId?: string | null;
  confirmedByUserId: string;
  confirmedByName: string;
  oneDriveProofNote: string;
  status: SubmissionStatus;
  grade: number | null;
  feedback: string;
  submittedAt: string;
  gradedAt?: string | null;
}

export interface StudentAssignmentView {
  _id: string;
  title: string;
  courseCode: string;
  description: string;
  dueDate: string;
  oneDriveUrl: string;
  assignmentType: AssignmentType;
  targetScope: TargetScope;
  assignedGroupIds: string[];
  assignedStudentIds: string[];
  maxPoints: number;
  professorDisplayName: string;
  createdAt: string;
  myGroupId: string | null;
  myGroupName: string | null;
  submission: StudentSubmissionBrief | null;
}

export interface AdminAssignmentView {
  _id: string;
  title: string;
  courseCode: string;
  description: string;
  dueDate: string;
  oneDriveUrl: string;
  assignmentType: AssignmentType;
  targetScope: TargetScope;
  assignedGroupIds: string[];
  assignedStudentIds: string[];
  maxPoints: number;
  createdBy: string;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    groupCount: number;
    submissionCount: number;
    gradedCount: number;
    totalTargets: number;
    completionRate: number;
  };
}

export interface HydratedGroupView {
  _id: string;
  name: string;
  assignmentId: string;
  leaderId: string;
  memberIds: string[];
  members: StudentDirectoryEntry[];
  memberCount: number;
  maxMembers: number;
  assignmentTitle: string;
  courseCode: string;
  assignmentDueDate: string;
  maxPoints: number;
  notes: GroupNote[];
  checklist: GroupChecklistItem[];
  submission: {
    _id: string;
    status: SubmissionStatus;
    grade: number | null;
    submittedAt: string;
    confirmedByName: string;
    feedback: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubmissionView extends StudentSubmissionBrief {
  assignmentTitle: string;
  courseCode: string;
  maxPoints: number;
  groupName: string | null;
  groupMembers: StudentDirectoryEntry[];
  studentName: string | null;
  studentCode: string | null;
  studentEmail: string | null;
}

export interface StudentProgressRow {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  age: number;
  department: string;
  groups: Array<{ _id: string; name: string; assignmentId: string }>;
  totalAssigned: number;
  submittedCount: number;
  gradedCount: number;
  completionRate: number;
  averageGrade: number | null;
}

export interface AnalyticsOverview {
  kpis: {
    totalAssignments: number;
    totalStudents: number;
    activeGroups: number;
    totalSubmissions: number;
    gradedSubmissions: number;
    pendingGrading: number;
    avgCompletionRate: number;
    overallAvgGrade: number | null;
  };
  assignmentBreakdown: Array<{
    assignmentId: string;
    courseCode: string;
    title: string;
    assignmentType: AssignmentType;
    submittedCount: number;
    gradedCount: number;
    expectedCount: number;
    groupCount: number;
    completionRate: number;
    avgScorePct: number | null;
  }>;
  activityFeed: Array<{
    id: string;
    kind: 'submission' | 'collaboration';
    actorName: string;
    contextLabel: string;
    detail: string;
    timestamp: string;
  }>;
}
