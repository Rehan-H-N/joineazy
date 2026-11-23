export const MAX_GROUP_MEMBERS = 4;

export type UserRole = 'student' | 'admin';
export type AssignmentType = 'group' | 'individual';
export type TargetScope = 'all' | 'specific';
export type SubmissionStatus = 'submitted' | 'graded';

export interface UserRecord {
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
  passwordHash: string;
  createdAt: string;
}

export interface SafeStudentDirectoryItem {
  _id: string;
  studentId: string;
  name: string;
  email: string;
  department: string;
}

export interface AssignmentRecord {
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
}

export interface StudentSafeAssignment {
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
}

export interface GroupNote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface GroupChecklistItem {
  id: string;
  label: string;
  done: boolean;
  updatedBy: string;
}

export interface GroupRecord {
  _id: string;
  name: string;
  assignmentId: string;
  leaderId: string;
  memberIds: string[];
  notes: GroupNote[];
  checklist: GroupChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRecord {
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

export interface GroupValidationResult {
  valid: boolean;
  code?: 'MAX_SIZE_EXCEEDED' | 'DUPLICATE_IN_GROUP' | 'DUPLICATE_IN_TASK' | 'EMPTY_GROUP';
  error?: string;
}

/**
 * Enforces:
 * 1. At least 1 member, at most MAX_GROUP_MEMBERS (4) students per group.
 * 2. No duplicate student IDs within the same group.
 * 3. No student appears in more than one group for the same assignment/task.
 */
export function validateGroupMembership(params: {
  candidateMemberIds: string[];
  assignmentId: string;
  currentGroupId?: string;
  existingGroupsForAssignment: Array<{ _id: string; name: string; assignmentId: string; memberIds: string[] }>;
}): GroupValidationResult {
  const { candidateMemberIds, assignmentId, currentGroupId, existingGroupsForAssignment } = params;

  if (!Array.isArray(candidateMemberIds) || candidateMemberIds.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_GROUP',
      error: 'A group must contain at least one student.',
    };
  }

  const uniqueSet = new Set(candidateMemberIds);
  if (uniqueSet.size !== candidateMemberIds.length) {
    return {
      valid: false,
      code: 'DUPLICATE_IN_GROUP',
      error: 'The same student cannot be added twice to the same group.',
    };
  }

  if (candidateMemberIds.length > MAX_GROUP_MEMBERS) {
    return {
      valid: false,
      code: 'MAX_SIZE_EXCEEDED',
      error: `Groups cannot exceed ${MAX_GROUP_MEMBERS} students.`,
    };
  }

  for (const existingGroup of existingGroupsForAssignment) {
    if (existingGroup.assignmentId !== assignmentId) continue;
    if (currentGroupId && existingGroup._id === currentGroupId) continue;

    for (const memberId of candidateMemberIds) {
      if (existingGroup.memberIds.includes(memberId)) {
        return {
          valid: false,
          code: 'DUPLICATE_IN_TASK',
          error: `Student is already assigned to group "${existingGroup.name}" for this task. Students cannot repeat across groups for the same assignment.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates and normalizes external submission URLs (allows only http: and https:).
 */
export function sanitizeExternalUrl(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Blocks MongoDB operator injection ($gt, $ne, $where, dotted keys) in untrusted payloads.
 */
export function hasMongoOperators(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasMongoOperators(item));
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (hasMongoOperators(nested)) {
      return true;
    }
  }
  return false;
}

/**
 * Strips professor personal fields so students only ever view public assignment metadata.
 */
export function stripProfessorPersonalData(assignment: AssignmentRecord): StudentSafeAssignment {
  return {
    _id: assignment._id,
    title: assignment.title,
    courseCode: assignment.courseCode,
    description: assignment.description,
    dueDate: assignment.dueDate,
    oneDriveUrl: assignment.oneDriveUrl,
    assignmentType: assignment.assignmentType,
    targetScope: assignment.targetScope,
    assignedGroupIds: [...assignment.assignedGroupIds],
    assignedStudentIds: [...assignment.assignedStudentIds],
    maxPoints: assignment.maxPoints,
    professorDisplayName: assignment.createdByDisplayName,
    createdAt: assignment.createdAt,
  };
}

/**
 * Determines whether an assignment should be visible to a given student.
 */
export function isAssignmentVisibleToStudent(
  assignment: AssignmentRecord,
  studentUserId: string,
  studentGroupIds: string[]
): boolean {
  if (assignment.targetScope === 'all') {
    return true;
  }
  if (assignment.assignmentType === 'individual') {
    return assignment.assignedStudentIds.includes(studentUserId);
  }
  // Specific group assignment: visible if any of the student's groups are targeted
  // OR if no groups are locked yet and the student hasn't been excluded
  if (assignment.assignedGroupIds.length === 0) {
    return false;
  }
  return studentGroupIds.some((gid) => assignment.assignedGroupIds.includes(gid));
}

export interface StudentProgressSummary {
  totalAssigned: number;
  submittedCount: number;
  gradedCount: number;
  completionRate: number;
  averageGrade: number | null;
}

export function calculateStudentProgress(params: {
  assignments: AssignmentRecord[];
  groups: GroupRecord[];
  submissions: SubmissionRecord[];
  studentUserId: string;
}): StudentProgressSummary {
  const { assignments, groups, submissions, studentUserId } = params;
  const studentGroups = groups.filter((g) => g.memberIds.includes(studentUserId));
  const studentGroupIds = studentGroups.map((g) => g._id);

  const visibleAssignments = assignments.filter((a) =>
    isAssignmentVisibleToStudent(a, studentUserId, studentGroupIds)
  );

  let submittedCount = 0;
  let gradedCount = 0;
  const grades: number[] = [];

  for (const assignment of visibleAssignments) {
    const match = submissions.find((sub) => {
      if (sub.assignmentId !== assignment._id) return false;
      if (assignment.assignmentType === 'individual') {
        return sub.studentId === studentUserId;
      }
      return Boolean(sub.groupId && studentGroupIds.includes(sub.groupId));
    });

    if (match) {
      submittedCount += 1;
      if (match.status === 'graded' && typeof match.grade === 'number') {
        gradedCount += 1;
        const pct = assignment.maxPoints > 0 ? (match.grade / assignment.maxPoints) * 100 : match.grade;
        grades.push(Math.round(pct * 10) / 10);
      }
    }
  }

  const totalAssigned = visibleAssignments.length;
  const completionRate = totalAssigned > 0 ? Math.round((submittedCount / totalAssigned) * 100) : 0;
  const averageGrade =
    grades.length > 0 ? Math.round((grades.reduce((sum, g) => sum + g, 0) / grades.length) * 10) / 10 : null;

  return {
    totalAssigned,
    submittedCount,
    gradedCount,
    completionRate,
    averageGrade,
  };
}
