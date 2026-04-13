import { useCallback } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthCardLayout } from "./components/auth/AuthCardLayout";
import { AuthEntryGate } from "./components/auth/AuthEntryGate";
import { AuthSessionLoading } from "./components/auth/AuthSessionLoading";
import { LoginForm } from "./components/auth/LoginForm";
import { RegisterForm } from "./components/auth/RegisterForm";
import { ContentExtensionWidget } from "./components/content/ContentExtensionWidget";
import { ContentInbox } from "./components/content/ContentInbox";
import { useAuthSession } from "./hooks/useAuthSession";
import type { AuthCredentials } from "./types/auth";

function App() {
  const navigate = useNavigate();
  const auth = useAuthSession();
  const protectedInboxPaths = ["/inbox", "/explore", "/library", "/relationship-graph", "/profile"] as const;

  const onLoginSubmit = useCallback(
    async (credentials: AuthCredentials) => {
      const success = await auth.loginUser(credentials);
      if (success) {
        navigate("/inbox", { replace: true });
      }
    },
    [auth.loginUser, navigate]
  );

  const onRegisterSubmit = useCallback(
    async (credentials: AuthCredentials) => {
      const success = await auth.registerUser(credentials);
      if (success) {
        navigate("/inbox", { replace: true });
      }
    },
    [auth.registerUser, navigate]
  );

  if (auth.checkingSession) {
    return <AuthSessionLoading />;
  }

  return (
    <main className="min-h-screen">
      <Routes>
        <Route
          path="/"
          element={
            auth.authUser ? (
              <Navigate to="/inbox" replace />
            ) : (
              <AuthCardLayout>
                <AuthEntryGate />
              </AuthCardLayout>
            )
          }
        />

        <Route
          path="/login"
          element={
            auth.authUser ? (
              <Navigate to="/inbox" replace />
            ) : (
              <AuthCardLayout>
                <LoginForm
                  submitting={auth.authSubmitting}
                  error={auth.authError}
                  onSubmit={onLoginSubmit}
                />
              </AuthCardLayout>
            )
          }
        />

        <Route
          path="/register"
          element={
            auth.authUser ? (
              <Navigate to="/inbox" replace />
            ) : (
              <AuthCardLayout>
                <RegisterForm
                  submitting={auth.authSubmitting}
                  error={auth.authError}
                  onSubmit={onRegisterSubmit}
                />
              </AuthCardLayout>
            )
          }
        />

        {protectedInboxPaths.map((path) => (
          <Route
            key={path}
            path={path}
            element={
              auth.authUser ? (
                <ContentInbox
                  username={auth.authUser.username}
                  submitting={auth.authSubmitting}
                  error={auth.authError}
                  onUpdateUsername={auth.updateUsernameUser}
                  onUpdatePassword={auth.updatePasswordUser}
                  onClearError={auth.clearAuthError}
                  onLogout={auth.logout}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        ))}

        <Route path="/storage" element={<Navigate to="/library" replace />} />

        <Route
          path="/extension-widget"
          element={
            auth.authUser ? (
              <ContentExtensionWidget onLogout={auth.logout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

export default App;
