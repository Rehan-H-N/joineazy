import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { calculateStudentProgress } from '../../src/shared/rules.js';

export const studentRouter = Router();

/**
 * Student & Professor directory lookup for group invitations or assignment targeting.
 * Strictly returns ONLY student records without passwordHash or age.
 */
studentRouter.get('/directory', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const students = await db.listStudents();
    const filtered = students
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.studentId && s.studentId.toLowerCase().includes(q)) ||
          s.department.toLowerCase().includes(q)
        );
      })
      .map((s) => ({
        _id: s._id,
        studentId: s.studentId || '',
        name: s.name,
        email: s.email,
        department: s.department,
      }));

    res.json({ students: filtered });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch directory.' });
  }
});

/**
 * Professor (Admin)-only student progress tracking endpoint.
 * Includes full student metadata (id, name, gmail, age, department) and completion/grade metrics.
 */
studentRouter.get('/progress', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const [students, assignments, groups, submissions] = await Promise.all([
      db.listStudents(),
      db.listAssignments(),
      db.listGroups(),
      db.listSubmissions(),
    ]);

    const rows = students.map((student) => {
      const summary = calculateStudentProgress({
        assignments,
        groups,
        submissions,
        studentUserId: student._id,
      });

      const studentGroups = groups
        .filter((g) => g.memberIds.includes(student._id))
        .map((g) => ({ _id: g._id, name: g.name, assignmentId: g.assignmentId }));

      return {
        _id: student._id,
        studentId: student.studentId || '',
        name: student.name,
        email: student.email,
        age: student.age,
        department: student.department,
        groups: studentGroups,
        ...summary,
      };
    });

    res.json({ students: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to compute student progress.' });
  }
});
