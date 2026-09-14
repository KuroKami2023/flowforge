import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Landing from './pages/Landing.jsx';
import Workflows from './pages/Workflows.jsx';
import Builder from './pages/Builder.jsx';
import { Executions, ExecutionDetail } from './pages/Executions.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
            <Route path="/workflows/:id" element={<ProtectedRoute><Builder /></ProtectedRoute>} />
            <Route path="/executions" element={<ProtectedRoute><Executions /></ProtectedRoute>} />
            <Route path="/executions/:id" element={<ProtectedRoute><ExecutionDetail /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
