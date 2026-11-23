import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { realtimeHub } from '../realtime/wsServer.js';
import { isAssignmentVisibleToStudent, type SubmissionRecord } from '../../src/shared/rules.js';

export const submissionRouter = Router();

submissionRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [submissions, assignments, groups, students] = await Promise.all([
      db.listSubmissions(),
      db.listAssignments(),
      db.listGroups(),
      db.listStudents(),
    ]);

    const assignmentMap = new Map(assignments.map((a) => [a._id, a]));
    const groupMap = new Map(groups.map((g) => [g._id, g]));
    const studentMap = new Map(
      students.map((s) => [s._id, { _id: s._id, name: s.name, studentId: s.studentId || '', email: s.email }])
    );

    if (req.auth!.role === 'student') {
      const myGroupIds = new Set(groups.filter((g) => g.memberIds.includes(req.auth!.sub)).map((g) => g._id));
      const mine = submissions
        .filter((sub) => sub.studentId === req.auth!.sub || (sub.groupId && myGroupIds.has(sub.groupId)))
        .map((sub) => ({
          ...sub,
          assignmentTitle: assignmentMap.get(sub.assignmentId)?.title || 'Assignment',
          courseCode: assignmentMap.get(sub.assignmentId)?.courseCode || '',
          maxPoints: assignmentMap.get(sub.assignmentId)?.maxPoints || 100,
          groupName: sub.groupId ? groupMap.get(sub.groupId)?.name || null : null,
        }));
      res.json({ submissions: mine });
      return;
    }

    // Admin view
    const enriched = submissions.map((sub) => {
      const assignment = assignmentMap.get(sub.assignmentId);
      const group = sub.groupId ? groupMap.get(sub.groupId) : null;
      const student = sub.studentId ? studentMap.get(sub.studentId) : null;
      const groupMembers = group
        ? group.memberIds.map((id) => studentMap.get(id)).filter(Boolean)
        : [];

      return {
        ...sub,
        assignmentTitle: assignment?.title || 'Assignment',
        courseCode: assignment?.courseCode || '',
        maxPoints: assignment?.maxPoints || 100,
        groupName: group?.name || null,
        groupMembers,
        studentName: student?.name || null,
        studentCode: student?.studentId || null,
        studentEmail: student?.email || null,
      };
    });

    res.json({ submissions: enriched });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch submissions.' });
  }
});

submissionRouter.post('/confirm', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const { assignmentId, confirmedStepOne, confirmedStepTwo, oneDriveProofNote } = req.body ?? {};

    if (typeof assignmentId !== 'string' || !assignmentId.trim()) {
      res.status(400).json({ error: 'Assignment ID is required.' });
      return;
    }

    if (confirmedStepOne !== true || confirmedStepTwo !== true) {
      res.status(400).json({
        error: 'Both two-step verification checks ("Yes, I have submitted" and final confirmation) are required.',
      });
      return;
    }

    const assignment = await db.findAssignmentById(assignmentId.trim());
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const groups = await db.listGroups();
    const myGroups = groups.filter((g) => g.memberIds.includes(req.auth!.sub));
    const myGroupIds = myGroups.map((g) => g._id);

    if (!isAssignmentVisibleToStudent(assignment, req.auth!.sub, myGroupIds)) {
      res.status(403).json({ error: 'You are not assigned to this task.' });
      return;
    }

    let groupId: string | null = null;
    let studentId: string | null = null;

    if (assignment.assignmentType === 'group') {
      const groupForTask = myGroups.find((g) => g.assignmentId === assignment._id);
      if (!groupForTask) {
        res.status(400).json({
          error: 'Please form or join a group for this assignment before confirming group submission.',
        });
        return;
      }
      groupId = groupForTask._id;
    } else {
      studentId = req.auth!.sub;
    }

    const existing = await db.findSubmissionForTarget({
      assignmentId: assignment._id,
      groupId,
      studentId,
    });

    if (existing) {
      res.status(409).json({
        error: `Submission was already confirmed on ${new Date(existing.submittedAt).toLocaleDateString()}.`,
      });
      return;
    }

    const note = typeof oneDriveProofNote === 'string' ? oneDriveProofNote.trim().slice(0, 1000) : '';
    const record: SubmissionRecord = {
      _id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      assignmentId: assignment._id,
      submissionType: assignment.assignmentType,
      groupId,
      studentId,
      confirmedByUserId: req.auth!.sub,
      confirmedByName: req.auth!.name || 'Student',
      oneDriveProofNote: note || 'Uploaded via shared OneDrive submission folder',
      status: 'submitted',
      grade: null,
      feedback: '',
      submittedAt: new Date().toISOString(),
      gradedAt: null,
    };

    await db.createSubmission(record);
    realtimeHub.broadcast('submission:updated', {
      action: 'confirmed',
      assignmentId: assignment._id,
      submissionId: record._id,
      groupId,
      studentId,
    });

    res.status(201).json({ submission: record });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to confirm submission.' });
  }
});

submissionRouter.patch('/:id/grade', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const submission = await db.findSubmissionById(req.params.id);
    if (!submission) {
      res.status(404).json({ error: 'Submission not found.' });
      return;
    }

    const assignment = await db.findAssignmentById(submission.assignmentId);
    const maxPoints = assignment?.maxPoints || 100;

    const numericGrade = Number(req.body?.grade);
    if (!Number.isFinite(numericGrade) || numericGrade < 0 || numericGrade > maxPoints) {
      res.status(400).json({ error: `Grade must be a number between 0 and ${maxPoints}.` });
      return;
    }

    const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim().slice(0, 2000) : '';
    const updated = await db.gradeSubmission(submission._id, Math.round(numericGrade * 10) / 10, feedback);

    realtimeHub.broadcast('grade:updated', {
      submissionId: submission._id,
      assignmentId: submission.assignmentId,
      grade: updated?.grade,
    });

    res.json({ submission: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save grade.' });
  }
});
