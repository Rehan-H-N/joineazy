import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const [assignments, groups, submissions, students] = await Promise.all([
      db.listAssignments(),
      db.listGroups(),
      db.listSubmissions(),
      db.listStudents(),
    ]);

    const assignmentMap = new Map(assignments.map((a) => [a._id, a]));
    const groupMap = new Map(groups.map((g) => [g._id, g]));

    const assignmentBreakdown = assignments.map((assignment) => {
      const taskSubmissions = submissions.filter((s) => s.assignmentId === assignment._id);
      const taskGroups = groups.filter((g) => g.assignmentId === assignment._id);
      const graded = taskSubmissions.filter((s) => s.status === 'graded' && typeof s.grade === 'number');

      let expectedCount = 0;
      if (assignment.assignmentType === 'individual') {
        expectedCount =
          assignment.targetScope === 'all' ? students.length : assignment.assignedStudentIds.length;
      } else {
        expectedCount =
          assignment.targetScope === 'all'
            ? Math.max(taskGroups.length, 1)
            : Math.max(assignment.assignedGroupIds.length, taskGroups.length, 1);
      }

      const completionRate =
        assignment.assignmentType === 'group' && taskGroups.length === 0
          ? 0
          : Math.min(100, Math.round((taskSubmissions.length / Math.max(expectedCount, 1)) * 100));

      const avgScorePct =
        graded.length > 0
          ? Math.round(
              (graded.reduce((acc, s) => acc + ((s.grade || 0) / Math.max(assignment.maxPoints, 1)) * 100, 0) /
                graded.length) *
                10
            ) / 10
          : null;

      return {
        assignmentId: assignment._id,
        courseCode: assignment.courseCode,
        title: assignment.title,
        assignmentType: assignment.assignmentType,
        submittedCount: taskSubmissions.length,
        gradedCount: graded.length,
        expectedCount,
        groupCount: taskGroups.length,
        completionRate,
        avgScorePct,
      };
    });

    const gradedSubmissions = submissions.filter((s) => s.status === 'graded' && typeof s.grade === 'number');
    const overallAvgGrade =
      gradedSubmissions.length > 0
        ? Math.round(
            (gradedSubmissions.reduce((sum, sub) => {
              const maxPts = assignmentMap.get(sub.assignmentId)?.maxPoints || 100;
              return sum + ((sub.grade || 0) / maxPts) * 100;
            }, 0) /
              gradedSubmissions.length) *
              10
          ) / 10
        : null;

    const avgCompletionRate =
      assignmentBreakdown.length > 0
        ? Math.round(
            assignmentBreakdown.reduce((sum, item) => sum + item.completionRate, 0) / assignmentBreakdown.length
          )
        : 0;

    // Live recent collaboration & submission activity feed
    const activityFeed: Array<{
      id: string;
      kind: 'submission' | 'collaboration';
      actorName: string;
      contextLabel: string;
      detail: string;
      timestamp: string;
    }> = [];

    for (const sub of submissions) {
      const asg = assignmentMap.get(sub.assignmentId);
      const grp = sub.groupId ? groupMap.get(sub.groupId) : null;
      activityFeed.push({
        id: `act_${sub._id}`,
        kind: 'submission',
        actorName: sub.confirmedByName,
        contextLabel: grp ? `${grp.name} · ${asg?.courseCode || ''}` : `${asg?.courseCode || ''} Individual`,
        detail:
          sub.status === 'graded'
            ? `Submitted & graded (${sub.grade}/${asg?.maxPoints || 100})`
            : 'Confirmed OneDrive submission',
        timestamp: sub.submittedAt,
      });
    }

    for (const grp of groups) {
      const asg = assignmentMap.get(grp.assignmentId);
      for (const note of grp.notes) {
        activityFeed.push({
          id: `act_${note.id}`,
          kind: 'collaboration',
          actorName: note.authorName,
          contextLabel: `${grp.name} · ${asg?.courseCode || ''}`,
          detail: note.text,
          timestamp: note.createdAt,
        });
      }
    }

    activityFeed.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json({
      kpis: {
        totalAssignments: assignments.length,
        totalStudents: students.length,
        activeGroups: groups.length,
        totalSubmissions: submissions.length,
        gradedSubmissions: gradedSubmissions.length,
        pendingGrading: submissions.length - gradedSubmissions.length,
        avgCompletionRate,
        overallAvgGrade,
      },
      assignmentBreakdown,
      activityFeed: activityFeed.slice(0, 12),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to compute analytics.' });
  }
});
