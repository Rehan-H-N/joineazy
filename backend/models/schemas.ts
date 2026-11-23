import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 180 },
    age: { type: Number, required: true, min: 15, max: 110 },
    studentId: { type: String, unique: true, sparse: true, trim: true, maxlength: 40 },
    facultyId: { type: String, unique: true, sparse: true, trim: true, maxlength: 40 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    officeRoom: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true, _id: false }
);

const AssignmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    courseCode: { type: String, required: true, trim: true, maxlength: 32 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    dueDate: { type: String, required: true },
    oneDriveUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    assignmentType: { type: String, enum: ['group', 'individual'], required: true, index: true },
    targetScope: { type: String, enum: ['all', 'specific'], required: true },
    assignedGroupIds: { type: [String], default: [] },
    assignedStudentIds: { type: [String], default: [] },
    maxPoints: { type: Number, required: true, min: 1, max: 1000, default: 100 },
    createdBy: { type: String, ref: 'User', required: true, index: true },
    createdByDisplayName: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true, _id: false }
);

const GroupNoteSchema = new Schema(
  {
    id: { type: String, required: true },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

const GroupChecklistSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 200 },
    done: { type: Boolean, default: false },
    updatedBy: { type: String, required: true },
  },
  { _id: false }
);

const GroupSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    assignmentId: { type: String, ref: 'Assignment', required: true, index: true },
    leaderId: { type: String, ref: 'User', required: true },
    memberIds: {
      type: [String],
      required: true,
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 4,
        message: 'A group must have between 1 and 4 students.',
      },
    },
    notes: { type: [GroupNoteSchema], default: [] },
    checklist: { type: [GroupChecklistSchema], default: [] },
  },
  { timestamps: true, _id: false }
);

const SubmissionSchema = new Schema(
  {
    _id: { type: String, required: true },
    assignmentId: { type: String, ref: 'Assignment', required: true, index: true },
    submissionType: { type: String, enum: ['group', 'individual'], required: true },
    groupId: { type: String, ref: 'Group', default: null, index: true },
    studentId: { type: String, ref: 'User', default: null, index: true },
    confirmedByUserId: { type: String, ref: 'User', required: true },
    confirmedByName: { type: String, required: true },
    oneDriveProofNote: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['submitted', 'graded'], default: 'submitted' },
    grade: { type: Number, min: 0, max: 1000, default: null },
    feedback: { type: String, default: '', maxlength: 2000 },
    submittedAt: { type: String, required: true },
    gradedAt: { type: String, default: null },
  },
  { timestamps: false, _id: false }
);

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export const AssignmentModel = mongoose.models.Assignment || mongoose.model('Assignment', AssignmentSchema);
export const GroupModel = mongoose.models.Group || mongoose.model('Group', GroupSchema);
export const SubmissionModel = mongoose.models.Submission || mongoose.model('Submission', SubmissionSchema);
