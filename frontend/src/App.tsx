import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { QueryProvider } from './providers/QueryProvider';
import Layout from './components/Layout';
import IDE from './components/IDE';
import LoginPage from './pages/LoginPage';
import RequireAdmin from './components/RequireAdmin';
import { useAuthStore } from './store/authStore';
import './App.css';

// Split the heavy, rarely-entered routes out of the initial bundle
const CollaborativeIDE = lazy(() => import('./components/CollaborativeIDE'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const Settings = lazy(() => import('./components/Settings'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResumeBuilder = lazy(() => import('./pages/ResumeBuilder'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

function RouteFallback() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function App() {
  const validateSession = useAuthStore((s) => s.validateSession);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  return (
    <QueryProvider>
      <ThemeProvider>
        <Router>
          <Layout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public routes - all pages are accessible without login */}
                <Route path="/" element={<IDE />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                {/* Collaboration routes */}
                <Route path="/collab/:shareId" element={<CollaborativeIDE />} />

                {/* Settings route */}
                <Route path="/settings" element={<Settings />} />

                {/* Resume Builder */}
                <Route path="/resume-builder" element={<ResumeBuilder />} />

                {/* Admin routes */}
                <Route
                  path="/admin"
                  element={
                    <RequireAdmin>
                      <AdminDashboard />
                    </RequireAdmin>
                  }
                />

                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </Router>
      </ThemeProvider>
    </QueryProvider>
  );
}

export default App;
