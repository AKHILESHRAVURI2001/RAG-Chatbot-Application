import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { HomeRedirect, RequirePermission } from './components/RequirePermission';
import { ToastProvider } from './components/ui/Toast';
import { appRoutes } from './routes';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {appRoutes.map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={
                r.path === '/' ? (
                  <HomeRedirect>{r.element}</HomeRedirect>
                ) : (
                  <RequirePermission permission={r.permission}>{r.element}</RequirePermission>
                )
              }
            />
          ))}
        </Route>
      </Routes>
    </ToastProvider>
  );
}
