import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GROUP_MEMBERS,
  validateGroupMembership,
  sanitizeExternalUrl,
  hasMongoOperators,
  stripProfessorPersonalData,
  calculateStudentProgress,
  type AssignmentRecord,
  type GroupRecord,
  type SubmissionRecord,
} from './rules';

test('MAX_GROUP_MEMBERS is strictly 4', () => {
  assert.equal(MAX_GROUP_MEMBERS, 4);
});

test('validateGroupMembership allows up to 4 unique students not in other groups for same task', () => {
  const result = validateGroupMembership({
    candidateMemberIds: ['s1', 's2', 's3', 's4'],
    assignmentId: 'a1',
    existingGroupsForAssignment: [
      { _id: 'g_other', name: 'Beta', assignmentId: 'a1', memberIds: ['s5', 's6'] },
      { _id: 'g_diff_task', name: 'Gamma', assignmentId: 'a2', memberIds: ['s1', 's2'] },
    ],
  });
  assert.equal(result.valid, true);
});

test('validateGroupMembership rejects more than 4 students', () => {
  const result = validateGroupMembership({
    candidateMemberIds: ['s1', 's2', 's3', 's4', 's5'],
    assignmentId: 'a1',
    existingGroupsForAssignment: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'MAX_SIZE_EXCEEDED');
});

test('validateGroupMembership rejects duplicate student within the same group', () => {
  const result = validateGroupMembership({
    candidateMemberIds: ['s1', 's2', 's1'],
    assignmentId: 'a1',
    existingGroupsForAssignment: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'DUPLICATE_IN_GROUP');
});

test('validateGroupMembership rejects student already in another group for the same assignment', () => {
  const result = validateGroupMembership({
    candidateMemberIds: ['s7', 's2'],
    assignmentId: 'a1',
    currentGroupId: 'g_new',
    existingGroupsForAssignment: [
      { _id: 'g_existing', name: 'Alpha Squad', assignmentId: 'a1', memberIds: ['s2', 's3'] },
    ],
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'DUPLICATE_IN_TASK');
});

test('sanitizeExternalUrl accepts valid https OneDrive links and blocks javascript/data URIs', () => {
  assert.equal(
    sanitizeExternalUrl('https://onedrive.live.com/?id=123&cid=456'),
    'https://onedrive.live.com/?id=123&cid=456'
  );
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeExternalUrl('not-a-url'), null);
});

test('hasMongoOperators catches NoSQL operator injection payloads', () => {
  assert.equal(hasMongoOperators({ email: { $gt: '' } }), true);
  assert.equal(hasMongoOperators({ 'user.role': 'admin' }), true);
  assert.equal(hasMongoOperators({ email: 'aarav@gmail.com', name: 'Aarav' }), false);
});

test('stripProfessorPersonalData omits professor personal details while keeping assignment info', () => {
  const assignment: AssignmentRecord = {
    _id: 'a1',
    title: 'Library DBMS Mini Project',
    courseCode: 'CS-301',
    description: 'Design an ER diagram and SQL schema.',
    dueDate: '2026-12-10T23:59:00.000Z',
    oneDriveUrl: 'https://onedrive.live.com/cs301',
    assignmentType: 'group',
    targetScope: 'all',
    assignedGroupIds: [],
    assignedStudentIds: [],
    maxPoints: 100,
    createdBy: 'prof1',
    createdByDisplayName: 'Dr. Ananya Sharma',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  };
  const safe = stripProfessorPersonalData(assignment) as unknown as Record<string, unknown>;
  assert.equal(safe.professorDisplayName, 'Dr. Ananya Sharma');
  assert.equal('createdBy' in safe, false);
  assert.equal('email' in safe, false);
  assert.equal('age' in safe, false);
  assert.equal('phone' in safe, false);
});

test('calculateStudentProgress computes completion rate and average grade across group and individual tasks', () => {
  const assignments: AssignmentRecord[] = [
    {
      _id: 'a1',
      title: 'Group Task',
      courseCode: 'CS-301',
      description: 'Desc',
      dueDate: '2026-12-01T00:00:00Z',
      oneDriveUrl: 'https://onedrive.live.com/a1',
      assignmentType: 'group',
      targetScope: 'all',
      assignedGroupIds: [],
      assignedStudentIds: [],
      maxPoints: 100,
      createdBy: 'p1',
      createdByDisplayName: 'Dr. Ananya Sharma',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      _id: 'a2',
      title: 'Individual Task',
      courseCode: 'CS-301',
      description: 'Desc',
      dueDate: '2026-12-05T00:00:00Z',
      oneDriveUrl: 'https://onedrive.live.com/a2',
      assignmentType: 'individual',
      targetScope: 'specific',
      assignedGroupIds: [],
      assignedStudentIds: ['s1'],
      maxPoints: 50,
      createdBy: 'p1',
      createdByDisplayName: 'Dr. Ananya Sharma',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  const groups: GroupRecord[] = [
    {
      _id: 'g1',
      name: 'Code Crafters',
      assignmentId: 'a1',
      leaderId: 's1',
      memberIds: ['s1', 's2'],
      notes: [],
      checklist: [],
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
    },
  ];
  const submissions: SubmissionRecord[] = [
    {
      _id: 'sub1',
      assignmentId: 'a1',
      submissionType: 'group',
      groupId: 'g1',
      studentId: null,
      confirmedByUserId: 's2',
      confirmedByName: 'Priya Nair',
      oneDriveProofNote: 'Uploaded final PDF',
      status: 'graded',
      grade: 92,
      feedback: 'Clean schema design.',
      submittedAt: '2026-11-15T12:00:00Z',
      gradedAt: '2026-11-16T09:00:00Z',
    },
  ];

  const summary = calculateStudentProgress({
    assignments,
    groups,
    submissions,
    studentUserId: 's1',
  });
  assert.equal(summary.totalAssigned, 2);
  assert.equal(summary.submittedCount, 1);
  assert.equal(summary.gradedCount, 1);
  assert.equal(summary.completionRate, 50);
  assert.equal(summary.averageGrade, 92);
});
