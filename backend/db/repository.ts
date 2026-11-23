import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import {
  AssignmentModel,
  GroupModel,
  SubmissionModel,
  UserModel,
} from '../models/schemas.js';
import { createSeedData, type DatabaseSnapshot } from './seedData.js';
import type {
  AssignmentRecord,
  GroupChecklistItem,
  GroupNote,
  GroupRecord,
  SubmissionRecord,
  UserRecord,
} from '../../src/shared/rules.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'joineazy-db.json');

class Repository {
  private useMongo = false;
  private cache: DatabaseSnapshot = {
    users: [],
    assignments: [],
    groups: [],
    submissions: [],
  };

  async init(): Promise<'mongodb' | 'embedded'> {
    const mongoUri = process.env.MONGODB_URI?.trim();
    if (mongoUri) {
      try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
        this.useMongo = true;
        const userCount = await UserModel.countDocuments();
        if (userCount === 0) {
          const seed = await createSeedData();
          await UserModel.insertMany(seed.users);
          await AssignmentModel.insertMany(seed.assignments);
          await GroupModel.insertMany(seed.groups);
          await SubmissionModel.insertMany(seed.submissions);
        } else {
          const hasLegacySeed =
            (await UserModel.exists({ _id: 'stu_1', email: 'alex.rivera@gmail.com' })) ||
            (await UserModel.exists({ _id: 'prof_1', email: 'elena.rostova@university.edu' }));
          if (hasLegacySeed) {
            const seed = await createSeedData();
            await UserModel.bulkWrite(
              seed.users.map((doc) => ({
                replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
              }))
            );
            await AssignmentModel.bulkWrite(
              seed.assignments.map((doc) => ({
                replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
              }))
            );
            await GroupModel.bulkWrite(
              seed.groups.map((doc) => ({
                replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
              }))
            );
            await SubmissionModel.bulkWrite(
              seed.submissions.map((doc) => ({
                replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
              }))
            );
            console.log('[Joineazy] Migrated seeded demo records to localized Indian profiles & courses');
          }
        }
        return 'mongodb';
      } catch (err) {
        console.warn(
          '[Joineazy] MongoDB connection unavailable, falling back to persistent embedded store:',
          err instanceof Error ? err.message : String(err)
        );
        this.useMongo = false;
      }
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.cache = JSON.parse(raw) as DatabaseSnapshot;
        return 'embedded';
      } catch {
        // Re-seed if corrupted
      }
    }

    this.cache = await createSeedData();
    this.flushFile();
    return 'embedded';
  }

  private flushFile(): void {
    if (this.useMongo) return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    fs.renameSync(tmp, DATA_FILE);
  }

  getStorageMode(): 'mongodb' | 'embedded' {
    return this.useMongo ? 'mongodb' : 'embedded';
  }

  // --- USERS ---
  async findUserByEmail(email: string, includePassword = false): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (this.useMongo) {
      const query = UserModel.findOne({ email: normalized });
      if (includePassword) query.select('+passwordHash');
      const doc = await query.lean();
      return doc ? (doc as unknown as UserRecord) : null;
    }
    const user = this.cache.users.find((u) => u.email.toLowerCase() === normalized);
    return user ? { ...user } : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    if (this.useMongo) {
      const doc = await UserModel.findById(id).lean();
      return doc ? (doc as unknown as UserRecord) : null;
    }
    const user = this.cache.users.find((u) => u._id === id);
    return user ? { ...user } : null;
  }

  async findFirstUserByRole(role: 'student' | 'admin'): Promise<UserRecord | null> {
    if (this.useMongo) {
      const doc = await UserModel.findOne({ role }).sort({ createdAt: 1 }).lean();
      return doc ? (doc as unknown as UserRecord) : null;
    }
    const user = this.cache.users.find((u) => u.role === role);
    return user ? { ...user } : null;
  }

  async findStudentByIdentifier(identifier: string): Promise<UserRecord | null> {
    const trimmed = identifier.trim().toLowerCase();
    if (this.useMongo) {
      const doc = await UserModel.findOne({
        role: 'student',
        $or: [{ email: trimmed }, { studentId: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
      }).lean();
      return doc ? (doc as unknown as UserRecord) : null;
    }
    const user = this.cache.users.find(
      (u) =>
        u.role === 'student' &&
        (u.email.toLowerCase() === trimmed || (u.studentId && u.studentId.toLowerCase() === trimmed))
    );
    return user ? { ...user } : null;
  }

  async findUserByStudentOrFacultyId(idCode: string): Promise<UserRecord | null> {
    const trimmed = idCode.trim().toLowerCase();
    if (this.useMongo) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}$`, 'i');
      const doc = await UserModel.findOne({
        $or: [{ studentId: regex }, { facultyId: regex }],
      }).lean();
      return doc ? (doc as unknown as UserRecord) : null;
    }
    const user = this.cache.users.find(
      (u) =>
        (u.studentId && u.studentId.toLowerCase() === trimmed) ||
        (u.facultyId && u.facultyId.toLowerCase() === trimmed)
    );
    return user ? { ...user } : null;
  }

  async listStudents(): Promise<UserRecord[]> {
    if (this.useMongo) {
      const docs = await UserModel.find({ role: 'student' }).sort({ name: 1 }).lean();
      return docs as unknown as UserRecord[];
    }
    return this.cache.users
      .filter((u) => u.role === 'student')
      .map((u) => ({ ...u }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createUser(user: UserRecord): Promise<UserRecord> {
    if (this.useMongo) {
      await UserModel.create(user);
      return user;
    }
    this.cache.users.push(user);
    this.flushFile();
    return { ...user };
  }

  // --- ASSIGNMENTS ---
  async listAssignments(): Promise<AssignmentRecord[]> {
    if (this.useMongo) {
      const docs = await AssignmentModel.find({}).sort({ dueDate: 1 }).lean();
      return docs as unknown as AssignmentRecord[];
    }
    return [...this.cache.assignments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async findAssignmentById(id: string): Promise<AssignmentRecord | null> {
    if (this.useMongo) {
      const doc = await AssignmentModel.findById(id).lean();
      return doc ? (doc as unknown as AssignmentRecord) : null;
    }
    const found = this.cache.assignments.find((a) => a._id === id);
    return found ? { ...found } : null;
  }

  async createAssignment(assignment: AssignmentRecord): Promise<AssignmentRecord> {
    if (this.useMongo) {
      await AssignmentModel.create(assignment);
      return assignment;
    }
    this.cache.assignments.push(assignment);
    this.flushFile();
    return { ...assignment };
  }

  async updateAssignment(id: string, patch: Partial<AssignmentRecord>): Promise<AssignmentRecord | null> {
    if (this.useMongo) {
      const updated = await AssignmentModel.findByIdAndUpdate(
        id,
        { $set: { ...patch, updatedAt: new Date().toISOString() } },
        { new: true }
      ).lean();
      return updated ? (updated as unknown as AssignmentRecord) : null;
    }
    const idx = this.cache.assignments.findIndex((a) => a._id === id);
    if (idx === -1) return null;
    this.cache.assignments[idx] = {
      ...this.cache.assignments[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.flushFile();
    return { ...this.cache.assignments[idx] };
  }

  async deleteAssignment(id: string): Promise<boolean> {
    if (this.useMongo) {
      const res = await AssignmentModel.deleteOne({ _id: id });
      await GroupModel.deleteMany({ assignmentId: id });
      await SubmissionModel.deleteMany({ assignmentId: id });
      return res.deletedCount > 0;
    }
    const before = this.cache.assignments.length;
    this.cache.assignments = this.cache.assignments.filter((a) => a._id !== id);
    this.cache.groups = this.cache.groups.filter((g) => g.assignmentId !== id);
    this.cache.submissions = this.cache.submissions.filter((s) => s.assignmentId !== id);
    this.flushFile();
    return this.cache.assignments.length < before;
  }

  // --- GROUPS ---
  async listGroups(): Promise<GroupRecord[]> {
    if (this.useMongo) {
      const docs = await GroupModel.find({}).sort({ createdAt: -1 }).lean();
      return docs as unknown as GroupRecord[];
    }
    return [...this.cache.groups].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listGroupsByAssignment(assignmentId: string): Promise<GroupRecord[]> {
    if (this.useMongo) {
      const docs = await GroupModel.find({ assignmentId }).lean();
      return docs as unknown as GroupRecord[];
    }
    return this.cache.groups.filter((g) => g.assignmentId === assignmentId).map((g) => ({ ...g }));
  }

  async findGroupById(id: string): Promise<GroupRecord | null> {
    if (this.useMongo) {
      const doc = await GroupModel.findById(id).lean();
      return doc ? (doc as unknown as GroupRecord) : null;
    }
    const found = this.cache.groups.find((g) => g._id === id);
    return found ? { ...found } : null;
  }

  async createGroup(group: GroupRecord): Promise<GroupRecord> {
    if (this.useMongo) {
      await GroupModel.create(group);
      return group;
    }
    this.cache.groups.push(group);
    this.flushFile();
    return { ...group };
  }

  async updateGroupMembers(groupId: string, memberIds: string[]): Promise<GroupRecord | null> {
    const now = new Date().toISOString();
    if (this.useMongo) {
      const updated = await GroupModel.findByIdAndUpdate(
        groupId,
        { $set: { memberIds, updatedAt: now } },
        { new: true }
      ).lean();
      return updated ? (updated as unknown as GroupRecord) : null;
    }
    const idx = this.cache.groups.findIndex((g) => g._id === groupId);
    if (idx === -1) return null;
    this.cache.groups[idx] = { ...this.cache.groups[idx], memberIds, updatedAt: now };
    this.flushFile();
    return { ...this.cache.groups[idx] };
  }

  async addGroupNote(groupId: string, note: GroupNote): Promise<GroupRecord | null> {
    const now = new Date().toISOString();
    if (this.useMongo) {
      const updated = await GroupModel.findByIdAndUpdate(
        groupId,
        { $push: { notes: note }, $set: { updatedAt: now } },
        { new: true }
      ).lean();
      return updated ? (updated as unknown as GroupRecord) : null;
    }
    const idx = this.cache.groups.findIndex((g) => g._id === groupId);
    if (idx === -1) return null;
    this.cache.groups[idx].notes.push(note);
    this.cache.groups[idx].updatedAt = now;
    this.flushFile();
    return { ...this.cache.groups[idx] };
  }

  async updateGroupChecklist(groupId: string, checklist: GroupChecklistItem[]): Promise<GroupRecord | null> {
    const now = new Date().toISOString();
    if (this.useMongo) {
      const updated = await GroupModel.findByIdAndUpdate(
        groupId,
        { $set: { checklist, updatedAt: now } },
        { new: true }
      ).lean();
      return updated ? (updated as unknown as GroupRecord) : null;
    }
    const idx = this.cache.groups.findIndex((g) => g._id === groupId);
    if (idx === -1) return null;
    this.cache.groups[idx].checklist = checklist;
    this.cache.groups[idx].updatedAt = now;
    this.flushFile();
    return { ...this.cache.groups[idx] };
  }

  // --- SUBMISSIONS ---
  async listSubmissions(): Promise<SubmissionRecord[]> {
    if (this.useMongo) {
      const docs = await SubmissionModel.find({}).sort({ submittedAt: -1 }).lean();
      return docs as unknown as SubmissionRecord[];
    }
    return [...this.cache.submissions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async findSubmissionById(id: string): Promise<SubmissionRecord | null> {
    if (this.useMongo) {
      const doc = await SubmissionModel.findById(id).lean();
      return doc ? (doc as unknown as SubmissionRecord) : null;
    }
    const found = this.cache.submissions.find((s) => s._id === id);
    return found ? { ...found } : null;
  }

  async findSubmissionForTarget(params: {
    assignmentId: string;
    groupId?: string | null;
    studentId?: string | null;
  }): Promise<SubmissionRecord | null> {
    const { assignmentId, groupId, studentId } = params;
    if (this.useMongo) {
      const query = groupId ? { assignmentId, groupId } : { assignmentId, studentId };
      const doc = await SubmissionModel.findOne(query).lean();
      return doc ? (doc as unknown as SubmissionRecord) : null;
    }
    const found = this.cache.submissions.find((s) => {
      if (s.assignmentId !== assignmentId) return false;
      return groupId ? s.groupId === groupId : s.studentId === studentId;
    });
    return found ? { ...found } : null;
  }

  async createSubmission(submission: SubmissionRecord): Promise<SubmissionRecord> {
    if (this.useMongo) {
      await SubmissionModel.create(submission);
      return submission;
    }
    this.cache.submissions.push(submission);
    this.flushFile();
    return { ...submission };
  }

  async gradeSubmission(
    submissionId: string,
    grade: number,
    feedback: string
  ): Promise<SubmissionRecord | null> {
    const now = new Date().toISOString();
    if (this.useMongo) {
      const updated = await SubmissionModel.findByIdAndUpdate(
        submissionId,
        { $set: { grade, feedback, status: 'graded', gradedAt: now } },
        { new: true }
      ).lean();
      return updated ? (updated as unknown as SubmissionRecord) : null;
    }
    const idx = this.cache.submissions.findIndex((s) => s._id === submissionId);
    if (idx === -1) return null;
    this.cache.submissions[idx] = {
      ...this.cache.submissions[idx],
      grade,
      feedback,
      status: 'graded',
      gradedAt: now,
    };
    this.flushFile();
    return { ...this.cache.submissions[idx] };
  }
}

export const db = new Repository();
