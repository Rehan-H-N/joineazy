import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db } from '../db/repository.js';
import { requireAuth, signJwt, type AuthenticatedRequest } from '../middleware/auth.js';
import type { UserRecord, UserRole } from '../../src/shared/rules.js';

export const authRouter = Router();

function toPublicSelfProfile(user: UserRecord) {
  return {
    _id: user._id,
    role: user.role,
    name: user.name,
    email: user.email,
    age: user.age,
    studentId: user.studentId,
    facultyId: user.facultyId,
    department: user.department,
    officeRoom: user.role === 'admin' ? user.officeRoom : undefined,
    phone: user.role === 'admin' ? user.phone : undefined,
    createdAt: user.createdAt,
  };
}

authRouter.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      age,
      role,
      department,
      studentId,
      facultyId,
      officeRoom,
      phone,
    } = req.body ?? {};

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof department !== 'string'
    ) {
      res.status(400).json({ error: 'Name, email, department, and password are required.' });
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanDept = department.trim();
    const numericAge = Number(age);
    const selectedRole: UserRole = role === 'admin' ? 'admin' : 'student';

    if (cleanName.length < 2 || cleanName.length > 120) {
      res.status(400).json({ error: 'Full name must be between 2 and 120 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!Number.isFinite(numericAge) || numericAge < 15 || numericAge > 110) {
      res.status(400).json({ error: 'Age must be between 15 and 110.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (cleanDept.length < 2) {
      res.status(400).json({ error: 'Department is required.' });
      return;
    }

    const existingEmail = await db.findUserByEmail(cleanEmail);
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const randomNum = Math.floor(100 + Math.random() * 900);
    const idCode =
      selectedRole === 'student'
        ? (typeof studentId === 'string' && studentId.trim() ? studentId.trim().toUpperCase() : `STU-2026-${randomNum}`)
        : (typeof facultyId === 'string' && facultyId.trim() ? facultyId.trim().toUpperCase() : `FAC-2026-${randomNum}`);

    const existingId = await db.findUserByStudentOrFacultyId(idCode);
    if (existingId) {
      res.status(409).json({ error: `ID ${idCode} is already registered.` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser: UserRecord = {
      _id: `${selectedRole === 'admin' ? 'prof' : 'stu'}_${crypto.randomUUID().slice(0, 8)}`,
      role: selectedRole,
      name: cleanName,
      email: cleanEmail,
      age: Math.round(numericAge),
      department: cleanDept,
      studentId: selectedRole === 'student' ? idCode : undefined,
      facultyId: selectedRole === 'admin' ? idCode : undefined,
      officeRoom: selectedRole === 'admin' && typeof officeRoom === 'string' ? officeRoom.trim() : undefined,
      phone: selectedRole === 'admin' && typeof phone === 'string' ? phone.trim() : undefined,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    await db.createUser(newUser);
    const token = signJwt({ sub: newUser._id, role: newUser.role, name: newUser.name });

    res.status(201).json({
      token,
      user: toPublicSelfProfile(newUser),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password must be valid strings.' });
      return;
    }

    const user = await db.findUserByEmail(email.trim().toLowerCase(), true);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signJwt({ sub: user._id, role: user.role, name: user.name });
    res.json({
      token,
      user: toPublicSelfProfile(user),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sign-in failed.' });
  }
});

authRouter.post('/demo', async (req, res) => {
  try {
    const { role } = req.body ?? {};
    const targetRole: UserRole = role === 'admin' ? 'admin' : 'student';
    const targetEmail = targetRole === 'admin' ? 'ananya.sharma@university.edu' : 'aarav.verma@gmail.com';
    const user = (await db.findUserByEmail(targetEmail)) ?? (await db.findFirstUserByRole(targetRole));
    if (!user) {
      res.status(404).json({ error: 'Demo account not found.' });
      return;
    }
    const token = signJwt({ sub: user._id, role: user.role, name: user.name });
    res.json({
      token,
      user: toPublicSelfProfile(user),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Demo login failed.' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await db.findUserById(req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'User account no longer exists.' });
      return;
    }
    res.json({ user: toPublicSelfProfile(user) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load profile.' });
  }
});
