import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { ProfessorDashboard } from './components/ProfessorDashboard';
import { StudentDashboard } from './components/StudentDashboard';

function WorkspaceRouter() {
  const { user } = useAuth();

  if (!user) {
    return <AuthScreen />;
  }

  if (user.role === 'admin') {
    return <ProfessorDashboard />;
  }

  return <StudentDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceRouter />
    </AuthProvider>
  );
}
