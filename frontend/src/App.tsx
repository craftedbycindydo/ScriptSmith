import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import IDE from './components/IDE';
import CollaborativeIDE from './components/CollaborativeIDE';
import AdminDashboard from './components/AdminDashboard';
import Settings from './components/Settings';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            {/* Public routes - all pages are accessible without login */}
            <Route path="/" element={<IDE />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            
            {/* Collaboration routes */}
            <Route path="/collab/:shareId" element={<CollaborativeIDE />} />
            
            {/* Settings route */}
            <Route path="/settings" element={<Settings />} />
            
            {/* Admin routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            
            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
