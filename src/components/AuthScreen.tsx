import React, { useState } from 'react';
import { ArrowRight, BookOpen, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../shared/rules';

export function AuthScreen() {
  const { login, register, loginDemo } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<UserRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('21');
  const [department, setDepartment] = useState('B.Tech Computer Science');
  const [idCode, setIdCode] = useState('');
  const [officeRoom, setOfficeRoom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({
          name,
          email,
          password,
          age: Number(age),
          role,
          department,
          studentId: role === 'student' ? idCode || undefined : undefined,
          facultyId: role === 'admin' ? idCode || undefined : undefined,
          officeRoom: role === 'admin' ? officeRoom || undefined : undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async (demoRole: UserRole) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginDemo(demoRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 grid lg:grid-cols-12">
      {/* Left editorial panel */}
      <div className="hidden lg:flex lg:col-span-5 relative bg-slate-900 text-white overflow-hidden flex-col justify-between p-10">
        {!imageFailed ? (
          <img
            src="/src/assets/images/auth_academic_library_1795459010109.jpg"
            alt="University study hall with oak tables and sunlit arches"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-55"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/60" />

        <div className="relative z-10">
          <p className="font-display text-lg font-bold tracking-tight text-white">Joineazy</p>
        </div>

        <div className="relative z-10 max-w-md space-y-6">
          <h1 className="font-display text-3xl font-bold leading-tight text-balance">
            Coordinated student teams and verified assignment tracking.
          </h1>
          <p className="text-sm leading-relaxed text-slate-200">
            Form project groups up to four members, confirm OneDrive uploads with two-step verification, and monitor real-time student &amp; group progress in one workspace.
          </p>

          <div className="pt-4 border-t border-white/15 grid grid-cols-1 gap-3 text-xs text-slate-200">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-blue-300 shrink-0" />
              <span>Up to 4 students per group · Unique membership per task</span>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-blue-300 shrink-0" />
              <span>Strict role isolation · Professor personal records stay private</span>
            </div>
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-blue-300 shrink-0" />
              <span>Live submission analytics · Individual & group grading</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right auth form panel */}
      <main className="lg:col-span-7 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md space-y-7">
          <div className="space-y-2">
            <p className="lg:hidden font-display text-lg font-bold tracking-tight text-slate-900">Joineazy</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              {mode === 'login' ? 'Sign in to your workspace' : 'Create an academic account'}
            </h2>
            <p className="text-sm text-slate-600">
              {mode === 'login'
                ? 'Access assignments, group rosters, and submission verification.'
                : 'Register as a student or professor to begin.'}
            </p>
          </div>

          {/* Mode segmented control */}
          <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-lg" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1.5">Account Role</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        role === 'student'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        role === 'admin'
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Professor (Admin)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Aarav Verma"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-age" className="block text-xs font-medium text-slate-700 mb-1">
                      Age
                    </label>
                    <input
                      id="reg-age"
                      type="number"
                      min={15}
                      max={110}
                      required
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-dept" className="block text-xs font-medium text-slate-700 mb-1">
                      Department
                    </label>
                    <input
                      id="reg-dept"
                      type="text"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="B.Tech Computer Science"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-id" className="block text-xs font-medium text-slate-700 mb-1">
                      {role === 'student' ? 'Student ID (optional)' : 'Faculty ID (optional)'}
                    </label>
                    <input
                      id="reg-id"
                      type="text"
                      value={idCode}
                      onChange={(e) => setIdCode(e.target.value)}
                      placeholder={role === 'student' ? 'STU-2026-099' : 'FAC-2026-09'}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                </div>

                {role === 'admin' && (
                  <div>
                    <label htmlFor="reg-office" className="block text-xs font-medium text-slate-700 mb-1">
                      Office Room (private to faculty)
                    </label>
                    <input
                      id="reg-office"
                      type="text"
                      value={officeRoom}
                      onChange={(e) => setOfficeRoom(e.target.value)}
                      placeholder="Academic Block A, Room 312"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address (Gmail / University)
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aarav.verma@gmail.com"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <span>{submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Instant demo accounts */}
          <div className="pt-5 border-t border-slate-200 space-y-3">
            <p className="text-xs font-medium text-slate-500">Quick demo access</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemo('student')}
                className="h-10 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
              >
                Demo Student (Aarav)
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemo('admin')}
                className="h-10 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
              >
                Demo Professor (Dr. Ananya)
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
