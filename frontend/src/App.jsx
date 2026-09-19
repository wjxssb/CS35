import React from 'react';
import { Routes, Route, NavLink, Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Spinner } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyProfile from './pages/MyProfile.jsx';
import UserProfile from './pages/UserProfile.jsx';
import MyCourses from './pages/MyCourses.jsx';
import ScheduleUpload from './pages/ScheduleUpload.jsx';
import Discover from './pages/Discover.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const doLogout = async () => {
    await logout();
    navigate('/login');
  };
  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link to="/" className="brand">📚 Classmate</Link>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/discover" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Discover</NavLink>
          <NavLink to="/courses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>My Courses</NavLink>
          <NavLink to="/upload" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Upload Schedule</NavLink>
          <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Profile</NavLink>
        </div>
        <div className="nav-spacer" />
        <span className="nav-user" data-testid="nav-user">{user.display_name || user.username}</span>
        <button className="btn small secondary" onClick={doLogout}>Log out</button>
      </div>
    </nav>
  );
}

export default function App() {
  const { loading } = useAuth();
  return (
    <>
      <Nav />
      {loading ? (
        <Spinner />
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/discover" element={<RequireAuth><Discover /></RequireAuth>} />
          <Route path="/courses" element={<RequireAuth><MyCourses /></RequireAuth>} />
          <Route path="/upload" element={<RequireAuth><ScheduleUpload /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><MyProfile /></RequireAuth>} />
          <Route path="/profile/:id" element={<RequireAuth><UserProfile /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </>
  );
}
