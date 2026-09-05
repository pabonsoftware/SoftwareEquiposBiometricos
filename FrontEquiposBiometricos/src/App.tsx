import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/featureFlags";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegistroPage } from "@/pages/RegistroPage";
import { RecuperarPasswordPage } from "@/pages/RecuperarPasswordPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { SedesPage } from "@/pages/admin/SedesPage";
import { EquiposPage } from "@/pages/admin/EquiposPage";
import { EquipoDetallePage } from "@/pages/admin/EquipoDetallePage";
import { UsuariosPage } from "@/pages/admin/UsuariosPage";
import { MantenimientosPage } from "@/pages/admin/MantenimientosPage";
import { AgendamientosPage } from "@/pages/admin/AgendamientosPage";
import { FallasPage } from "@/pages/admin/FallasPage";
import { PerfilPage } from "@/pages/admin/PerfilPage";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <Routes>
              {/* Páginas de autenticación sin layout */}
              <Route path="/login" element={<LoginPage />} />
              {/* Registro público deshabilitado por el momento: solo un
                  administrador crea cuentas (Admin → Usuarios). Si se accede
                  por URL directa, se redirige al login. */}
              <Route
                path="/registro"
                element={
                  PUBLIC_REGISTRATION_ENABLED ? (
                    <RegistroPage />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/recuperar-password"
                element={<RecuperarPasswordPage />}
              />

              {/* Layout público — incluye también la 404 para que el header
                  permita volver al inicio o al panel desde cualquier URL rota. */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/404" element={<NotFoundPage />} />
              </Route>

              {/* Layout interno común a todos los roles autenticados.
                  Cada vista filtra contenido y acciones por permisos. */}
              <Route element={<ProtectedRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="sedes" element={<SedesPage />} />
                  <Route path="equipos" element={<EquiposPage />} />
                  <Route path="equipos/:id" element={<EquipoDetallePage />} />
                  <Route path="mantenimientos" element={<MantenimientosPage />} />
                  <Route path="agendamientos" element={<AgendamientosPage />} />
                  <Route path="fallas" element={<FallasPage />} />
                  <Route path="perfil" element={<PerfilPage />} />

                  <Route
                    element={<ProtectedRoute roles={["superadmin", "admin"]} />}
                  >
                    <Route path="usuarios" element={<UsuariosPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Rutas /tecnico/* siguen llegando: redirigimos al panel unificado */}
              <Route path="/tecnico/*" element={<Navigate to="/admin" replace />} />

              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
