import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { realtimeHub } from '../realtime/wsServer.js';
import { MAX_GROUP_MEMBERS, validateGroupMembership, type GroupRecord } from '../../src/shared/rules.js';

export const groupRouter = Router();

function hydrateGroup(
  group: GroupRecord,
  studentMap: Map<string, { _id: string; studentId: string; name: string; email: string; department: string }>,
  assignmentMap: Map<string, { _id: string; title: string; courseCode: string; dueDate: string; maxPoints: number }>,
  submissionMap: Map<string, { _id: string; status: string; grade: number | null; submittedAt: string; confirmedByName: string; feedback: string }>
) {
  const members = group.memberIds
    .map((id) => studentMap.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const assignment = assignmentMap.get(group.assignmentId) || null;
  const submission = submissionMap.get(`${group.assignmentId}:${group._id}`) || null;

  return {
    ...group,
    members,
    memberCount: members.length,
    maxMembers: MAX_GROUP_MEMBERS,
    assignmentTitle: assignment?.title || 'Assignment',
    courseCode: assignment?.courseCode || '',
    assignmentDueDate: assignment?.dueDate || '',
    maxPoints: assignment?.maxPoints || 100,
    submission,
  };
}

groupRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [groups, students, assignments, submissions] = await Promise.all([
      db.listGroups(),
      db.listStudents(),
      db.listAssignments(),
      db.listSubmissions(),
    ]);

    const studentMap = new Map(
      students.map((s) => [
        s._id,
        {
          _id: s._id,
          studentId: s.studentId || '',
          name: s.name,
          email: s.email,
          department: s.department,
        },
      ])
    );

    const assignmentMap = new Map(
      assignments.map((a) => [
        a._id,
        {
          _id: a._id,
          title: a.title,
          courseCode: a.courseCode,
          dueDate: a.dueDate,
          maxPoints: a.maxPoints,
        },
      ])
    );

    const submissionMap = new Map(
      submissions
        .filter((s) => Boolean(s.groupId))
        .map((s) => [
          `${s.assignmentId}:${s.groupId}`,
          {
            _id: s._id,
            status: s.status,
            grade: s.grade,
            submittedAt: s.submittedAt,
            confirmedByName: s.confirmedByName,
            feedback: s.feedback,
          },
        ])
    );

    if (req.auth!.role === 'admin') {
      const allHydrated = groups.map((g) => hydrateGroup(g, studentMap, assignmentMap, submissionMap));
      res.json({ groups: allHydrated });
      return;
    }

    // Student role: return student's own groups hydrated (no professor personal data)
    const myGroups = groups
      .filter((g) => g.memberIds.includes(req.auth!.sub))
      .map((g) => hydrateGroup(g, studentMap, assignmentMap, submissionMap));

    res.json({ groups: myGroups });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch groups.' });
  }
});

groupRouter.post('/', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, assignmentId, memberIdentifiers } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof assignmentId !== 'string' || !assignmentId.trim()) {
      res.status(400).json({ error: 'Group name and group assignment selection are required.' });
      return;
    }

    const assignment = await db.findAssignmentById(assignmentId.trim());
    if (!assignment) {
      res.status(404).json({ error: 'Selected assignment not found.' });
      return;
    }
    if (assignment.assignmentType !== 'group') {
      res.status(400).json({ error: 'Groups can only be created for Group Assignments.' });
      return;
    }

    const candidateIds: string[] = [req.auth!.sub];

    if (Array.isArray(memberIdentifiers)) {
      for (const rawIdent of memberIdentifiers) {
        if (typeof rawIdent !== 'string' || !rawIdent.trim()) continue;
        const foundStudent = await db.findStudentByIdentifier(rawIdent.trim());
        if (!foundStudent) {
          res.status(404).json({ error: `No registered student found matching "${rawIdent.trim()}".` });
          return;
        }
        candidateIds.push(foundStudent._id);
      }
    }

    const existingGroupsForAssignment = await db.listGroupsByAssignment(assignment._id);
    const check = validateGroupMembership({
      candidateMemberIds: candidateIds,
      assignmentId: assignment._id,
      existingGroupsForAssignment,
    });

    if (!check.valid) {
      const status = check.code === 'DUPLICATE_IN_TASK' ? 409 : 400;
      res.status(status).json({ error: check.error, code: check.code });
      return;
    }

    const now = new Date().toISOString();
    const newGroup: GroupRecord = {
      _id: `grp_${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      assignmentId: assignment._id,
      leaderId: req.auth!.sub,
      memberIds: candidateIds,
      notes: [
        {
          id: `note_${crypto.randomUUID().slice(0, 6)}`,
          authorId: req.auth!.sub,
          authorName: req.auth!.name || 'Team Lead',
          text: `Created group "${name.trim()}" for ${assignment.courseCode}.`,
          createdAt: now,
        },
      ],
      checklist: [
        {
          id: `chk_${crypto.randomUUID().slice(0, 6)}`,
          label: 'Confirm team roster (max 4 members)',
          done: true,
          updatedBy: req.auth!.name || 'Team Lead',
        },
        {
          id: `chk_${crypto.randomUUID().slice(0, 6)}`,
          label: 'Upload deliverable to shared OneDrive link',
          done: false,
          updatedBy: req.auth!.name || 'Team Lead',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await db.createGroup(newGroup);
    realtimeHub.broadcast('group:updated', { action: 'created', groupId: newGroup._id, assignmentId: assignment._id });

    res.status(201).json({ group: newGroup });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create group.' });
  }
});

groupRouter.post('/:id/members', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.findGroupById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    if (!group.memberIds.includes(req.auth!.sub)) {
      res.status(403).json({ error: 'Only current group members can invite or add teammates.' });
      return;
    }

    const existingSub = await db.findSubmissionForTarget({
      assignmentId: group.assignmentId,
      groupId: group._id,
    });
    if (existingSub) {
      res.status(400).json({ error: 'Roster is locked because this group has already confirmed submission.' });
      return;
    }

    const { identifier } = req.body ?? {};
    if (typeof identifier !== 'string' || !identifier.trim()) {
      res.status(400).json({ error: 'Provide a student email or student ID (e.g., STU-2026-002).' });
      return;
    }

    const student = await db.findStudentByIdentifier(identifier.trim());
    if (!student) {
      res.status(404).json({ error: `No registered student found matching "${identifier.trim()}".` });
      return;
    }

    const existingGroupsForAssignment = await db.listGroupsByAssignment(group.assignmentId);
    const candidateMemberIds = [...group.memberIds, student._id];

    const check = validateGroupMembership({
      candidateMemberIds,
      assignmentId: group.assignmentId,
      currentGroupId: group._id,
      existingGroupsForAssignment,
    });

    if (!check.valid) {
      const status = check.code === 'DUPLICATE_IN_TASK' ? 409 : 400;
      res.status(status).json({ error: check.error, code: check.code });
      return;
    }

    const updated = await db.updateGroupMembers(group._id, candidateMemberIds);
    await db.addGroupNote(group._id, {
      id: `note_${crypto.randomUUID().slice(0, 6)}`,
      authorId: req.auth!.sub,
      authorName: req.auth!.name || 'Member',
      text: `Added ${student.name} (${student.studentId || student.email}) to the group.`,
      createdAt: new Date().toISOString(),
    });

    realtimeHub.broadcast('group:updated', { action: 'member_added', groupId: group._id });
    res.json({ group: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add member.' });
  }
});

groupRouter.delete('/:id/members/:memberId', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.findGroupById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    if (!group.memberIds.includes(req.auth!.sub)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const targetMemberId = req.params.memberId;
    if (group.leaderId !== req.auth!.sub && targetMemberId !== req.auth!.sub) {
      res.status(403).json({ error: 'Only the group leader can remove other members.' });
      return;
    }

    const existingSub = await db.findSubmissionForTarget({
      assignmentId: group.assignmentId,
      groupId: group._id,
    });
    if (existingSub) {
      res.status(400).json({ error: 'Cannot change roster after submission confirmation.' });
      return;
    }

    if (group.memberIds.length <= 1) {
      res.status(400).json({ error: 'A group must retain at least 1 member.' });
      return;
    }

    if (targetMemberId === group.leaderId) {
      res.status(400).json({ error: 'The group leader cannot leave while other members remain.' });
      return;
    }

    const nextMembers = group.memberIds.filter((id) => id !== targetMemberId);
    const updated = await db.updateGroupMembers(group._id, nextMembers);
    realtimeHub.broadcast('group:updated', { action: 'member_removed', groupId: group._id });
    res.json({ group: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to remove member.' });
  }
});

groupRouter.post('/:id/notes', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.findGroupById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    if (!group.memberIds.includes(req.auth!.sub)) {
      res.status(403).json({ error: 'Only group members can post collaboration notes.' });
      return;
    }

    const { text } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 1000) {
      res.status(400).json({ error: 'Note text must be between 1 and 1000 characters.' });
      return;
    }

    const updated = await db.addGroupNote(group._id, {
      id: `note_${crypto.randomUUID().slice(0, 8)}`,
      authorId: req.auth!.sub,
      authorName: req.auth!.name || 'Student',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    });

    realtimeHub.broadcast('group:updated', { action: 'note_added', groupId: group._id });
    res.status(201).json({ group: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to post note.' });
  }
});

groupRouter.patch('/:id/checklist', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.findGroupById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    if (!group.memberIds.includes(req.auth!.sub)) {
      res.status(403).json({ error: 'Only group members can update the checklist.' });
      return;
    }

    const { itemId, newLabel } = req.body ?? {};
    let nextChecklist = [...group.checklist];

    if (typeof itemId === 'string' && itemId) {
      nextChecklist = nextChecklist.map((item) =>
        item.id === itemId
          ? { ...item, done: !item.done, updatedBy: req.auth!.name || 'Student' }
          : item
      );
    } else if (typeof newLabel === 'string' && newLabel.trim()) {
      nextChecklist.push({
        id: `chk_${crypto.randomUUID().slice(0, 6)}`,
        label: newLabel.trim().slice(0, 200),
        done: false,
        updatedBy: req.auth!.name || 'Student',
      });
    } else {
      res.status(400).json({ error: 'Provide either itemId to toggle or newLabel to add.' });
      return;
    }

    const updated = await db.updateGroupChecklist(group._id, nextChecklist);
    realtimeHub.broadcast('group:updated', { action: 'checklist_updated', groupId: group._id });
    res.json({ group: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update checklist.' });
  }
});
