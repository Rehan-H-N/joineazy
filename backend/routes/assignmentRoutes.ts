import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { realtimeHub } from '../realtime/wsServer.js';
import {
  isAssignmentVisibleToStudent,
  sanitizeExternalUrl,
  stripProfessorPersonalData,
  type AssignmentRecord,
} from '../../src/shared/rules.js';

export const assignmentRouter = Router();

/**
 * GET /api/assignments
 * Role-aware:
 * - Students only receive assignments targeted to them/all, with ALL professor personal data stripped.
 * - Admins (Professors) receive all assignments with submission & group completion statistics.
 */
assignmentRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [assignments, groups, submissions, students] = await Promise.all([
      db.listAssignments(),
      db.listGroups(),
      db.listSubmissions(),
      db.listStudents(),
    ]);

    if (req.auth!.role === 'student') {
      const studentId = req.auth!.sub;
      const myGroups = groups.filter((g) => g.memberIds.includes(studentId));
      const myGroupIds = myGroups.map((g) => g._id);

      const visible = assignments
        .filter((a) => isAssignmentVisibleToStudent(a, studentId, myGroupIds))
        .map((assignment) => {
          const safeAssignment = stripProfessorPersonalData(assignment);
          const groupForTask = myGroups.find((g) => g.assignmentId === assignment._id) || null;
          const submission = submissions.find((sub) => {
            if (sub.assignmentId !== assignment._id) return false;
            if (assignment.assignmentType === 'individual') {
              return sub.studentId === studentId;
            }
            return Boolean(groupForTask && sub.groupId === groupForTask._id);
          });

          return {
            ...safeAssignment,
            myGroupId: groupForTask ? groupForTask._id : null,
            myGroupName: groupForTask ? groupForTask.name : null,
            submission: submission || null,
          };
        });

      res.json({ assignments: visible });
      return;
    }

    // Admin (Professor) view
    const enriched = assignments.map((assignment) => {
      const taskGroups = groups.filter((g) => g.assignmentId === assignment._id);
      const taskSubmissions = submissions.filter((s) => s.assignmentId === assignment._id);
      const gradedCount = taskSubmissions.filter((s) => s.status === 'graded').length;

      let totalTargets = 0;
      if (assignment.assignmentType === 'individual') {
        totalTargets =
          assignment.targetScope === 'all' ? students.length : assignment.assignedStudentIds.length;
      } else {
        totalTargets =
          assignment.targetScope === 'all'
            ? Math.max(taskGroups.length, 1)
            : Math.max(assignment.assignedGroupIds.length, taskGroups.length, 1);
      }

      const completionRate =
        assignment.assignmentType === 'group' && taskGroups.length === 0
          ? 0
          : Math.min(100, Math.round((taskSubmissions.length / totalTargets) * 100));

      return {
        ...assignment,
        stats: {
          groupCount: taskGroups.length,
          submissionCount: taskSubmissions.length,
          gradedCount,
          totalTargets,
          completionRate,
        },
      };
    });

    res.json({ assignments: enriched });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load assignments.' });
  }
});

assignmentRouter.post('/', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      title,
      courseCode,
      description,
      dueDate,
      oneDriveUrl,
      assignmentType,
      targetScope,
      assignedGroupIds,
      assignedStudentIds,
      maxPoints,
    } = req.body ?? {};

    if (
      typeof title !== 'string' ||
      typeof courseCode !== 'string' ||
      typeof description !== 'string' ||
      typeof dueDate !== 'string' ||
      typeof oneDriveUrl !== 'string'
    ) {
      res.status(400).json({ error: 'Title, course code, description, due date, and OneDrive link are required.' });
      return;
    }

    const safeUrl = sanitizeExternalUrl(oneDriveUrl);
    if (!safeUrl) {
      res.status(400).json({ error: 'OneDrive link must be a valid http:// or https:// URL.' });
      return;
    }

    const parsedDate = new Date(dueDate);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Please provide a valid due date.' });
      return;
    }

    const type = assignmentType === 'individual' ? 'individual' : 'group';
    const scope = targetScope === 'specific' ? 'specific' : 'all';
    const points = Number(maxPoints) > 0 ? Math.min(1000, Math.round(Number(maxPoints))) : 100;

    const cleanStudentIds =
      scope === 'specific' && type === 'individual' && Array.isArray(assignedStudentIds)
        ? assignedStudentIds.filter((id): id is string => typeof id === 'string')
        : [];
    const cleanGroupIds =
      scope === 'specific' && type === 'group' && Array.isArray(assignedGroupIds)
        ? assignedGroupIds.filter((id): id is string => typeof id === 'string')
        : [];

    if (scope === 'specific' && type === 'individual' && cleanStudentIds.length === 0) {
      res.status(400).json({ error: 'Select at least one student for a targeted individual assignment.' });
      return;
    }
    if (scope === 'specific' && type === 'group' && cleanGroupIds.length === 0) {
      res.status(400).json({ error: 'Select at least one group for a targeted group assignment.' });
      return;
    }

    const professor = await db.findUserById(req.auth!.sub);
    const now = new Date().toISOString();

    const record: AssignmentRecord = {
      _id: `asg_${crypto.randomUUID().slice(0, 8)}`,
      title: title.trim(),
      courseCode: courseCode.trim().toUpperCase(),
      description: description.trim(),
      dueDate: parsedDate.toISOString(),
      oneDriveUrl: safeUrl,
      assignmentType: type,
      targetScope: scope,
      assignedGroupIds: cleanGroupIds,
      assignedStudentIds: cleanStudentIds,
      maxPoints: points,
      createdBy: req.auth!.sub,
      createdByDisplayName: professor?.name || req.auth!.name || 'Course Instructor',
      createdAt: now,
      updatedAt: now,
    };

    await db.createAssignment(record);
    realtimeHub.broadcast('assignment:updated', { action: 'created', assignmentId: record._id });

    res.status(201).json({ assignment: record });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create assignment.' });
  }
});

assignmentRouter.put('/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await db.findAssignmentById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const {
      title,
      courseCode,
      description,
      dueDate,
      oneDriveUrl,
      assignmentType,
      targetScope,
      assignedGroupIds,
      assignedStudentIds,
      maxPoints,
    } = req.body ?? {};

    const patch: Partial<AssignmentRecord> = {};
    if (typeof title === 'string' && title.trim()) patch.title = title.trim();
    if (typeof courseCode === 'string' && courseCode.trim()) patch.courseCode = courseCode.trim().toUpperCase();
    if (typeof description === 'string' && description.trim()) patch.description = description.trim();
    if (typeof dueDate === 'string') {
      const parsed = new Date(dueDate);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid due date.' });
        return;
      }
      patch.dueDate = parsed.toISOString();
    }
    if (typeof oneDriveUrl === 'string') {
      const safeUrl = sanitizeExternalUrl(oneDriveUrl);
      if (!safeUrl) {
        res.status(400).json({ error: 'OneDrive link must be a valid http:// or https:// URL.' });
        return;
      }
      patch.oneDriveUrl = safeUrl;
    }
    if (assignmentType === 'group' || assignmentType === 'individual') {
      patch.assignmentType = assignmentType;
    }
    if (targetScope === 'all' || targetScope === 'specific') {
      patch.targetScope = targetScope;
    }
    if (Array.isArray(assignedStudentIds)) {
      patch.assignedStudentIds = assignedStudentIds.filter((id): id is string => typeof id === 'string');
    }
    if (Array.isArray(assignedGroupIds)) {
      patch.assignedGroupIds = assignedGroupIds.filter((id): id is string => typeof id === 'string');
    }
    if (maxPoints !== undefined && Number(maxPoints) > 0) {
      patch.maxPoints = Math.min(1000, Math.round(Number(maxPoints)));
    }

    const updated = await db.updateAssignment(req.params.id, patch);
    realtimeHub.broadcast('assignment:updated', { action: 'updated', assignmentId: req.params.id });
    res.json({ assignment: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update assignment.' });
  }
});

assignmentRouter.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await db.deleteAssignment(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    realtimeHub.broadcast('assignment:updated', { action: 'deleted', assignmentId: req.params.id });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete assignment.' });
  }
});
