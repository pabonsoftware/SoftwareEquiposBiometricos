import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
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
import { RestablecerPasswordPage } from "@/pages/RestablecerPasswordPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { SedesPage } from "@/pages/admin/SedesPage";
import { EquiposPage } from "@/pages/admin/EquiposPage";
import { EquipoDetallePage } from "@/pages/admin/EquipoDetallePage";
import { CodigosQrPage } from "@/pages/admin/CodigosQrPage";
import { UsuariosPage } from "@/pages/admin/UsuariosPage";
import { MantenimientosPage } from "@/pages/admin/MantenimientosPage";
import { OrdenesTrabajoPage } from "@/pages/admin/OrdenesTrabajoPage";
import { AgendamientosPage } from "@/pages/admin/AgendamientosPage";
import { AlertasPage } from "@/pages/admin/AlertasPage";
import { ReportesPage } from "@/pages/admin/ReportesPage";
import { AuditoriaPage } from "@/pages/admin/AuditoriaPage";
import { FallasPage } from "@/pages/admin/FallasPage";
import { PerfilPage } from "@/pages/admin/PerfilPage";

/**
 * `/restablecer-account` es un alias histórico de `/restablecer-password`.
 * Se conserva el `?uid=&token=` del enlace del correo al redirigir.
 */
function RestablecerAccountRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/restablecer-password", search }} replace />;
}

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
              <Route
                path="/restablecer-password"
                element={<RestablecerPasswordPage />}
              />
              {/* Alias históricos: "recuperación de cuenta" es el mismo flujo
                  que "recuperación de contraseña" (HU026/HU027). Se mantienen
                  como redirección para no romper enlaces antiguos. */}
              <Route
                path="/recuperar-account"
                element={<Navigate to="/recuperar-password" replace />}
              />
              <Route
                path="/restablecer-account"
                element={<RestablecerAccountRedirect />}
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
                  <Route path="perfil" element={<PerfilPage />} />

                  {/* Cada módulo se guarda con el mismo permiso `view` que
                      decide su visibilidad en el menú (ver lib/permissions). */}
                  <Route element={<ProtectedRoute resource="branches" />}>
                    <Route path="sedes" element={<SedesPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="equipment" />}>
                    <Route path="equipos" element={<EquiposPage />} />
                    <Route path="equipos/qr" element={<CodigosQrPage />} />
                    <Route path="equipos/:id" element={<EquipoDetallePage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="maintenance" />}>
                    <Route path="mantenimientos" element={<MantenimientosPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="work_orders" />}>
                    <Route path="ordenes-trabajo" element={<OrdenesTrabajoPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="scheduling" />}>
                    <Route path="agendamientos" element={<AgendamientosPage />} />
                    <Route path="alertas" element={<AlertasPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="failures" />}>
                    <Route path="fallas" element={<FallasPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="reports" />}>
                    <Route path="reportes" element={<ReportesPage />} />
                  </Route>
                  <Route element={<ProtectedRoute resource="audit" />}>
                    <Route path="auditoria" element={<AuditoriaPage />} />
                  </Route>
                  <Route element={<ProtectedRoute roles={["admin"]} />}>
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
