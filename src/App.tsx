import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ProductionView } from './components/ProductionView';
import { SalesView } from './components/SalesView';
import { BillingView } from './components/BillingView';
import { ExpensesView } from './components/ExpensesView';
import { CashView } from './components/CashView';
import { WarehouseView } from './components/WarehouseView';
import { PricesView } from './components/PricesView';
import { CustomersView } from './components/CustomersView';
import { ProductsView } from './components/ProductsView';
import { AlertsView } from './components/AlertsView';
import { UsersView } from './components/UsersView';
import { AlertReminder } from './components/AlertReminder';
import { SyncNotification } from './components/SyncNotification';
import { CloudSyncModal } from './components/CloudSyncModal';
import { Cloud, LogIn, LogOut, ShieldAlert, Loader2 } from 'lucide-react';

const AuthGate: React.FC = () => {
  const { accessStatus } = useApp();
  const { user, signInWithGoogle, signOut } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = err?.code || '';
      const msg = String(err?.message || '');
      if (code === 'auth/popup-blocked') {
        setAuthError(
          'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes (pop-ups) para este sitio en la barra de direcciones e inténtalo de nuevo.'
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError('Se cerró la ventana de inicio de sesión antes de completar.');
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('Ya había un inicio de sesión en curso. Inténtalo de nuevo.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Este dominio (${window.location.hostname}) aún no está autorizado en Firebase Auth. Agrégalo en Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else if (msg.includes('INTERNAL ASSERTION FAILED')) {
        setAuthError(
          'La ventana de acceso de Google no pudo completarse porque el navegador bloqueó o interrumpió el pop-up. Habilita las ventanas emergentes para este sitio y vuelve a intentar.'
        );
      } else {
        setAuthError(msg || 'No se pudo iniciar sesión con Google.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  if (accessStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 max-w-sm w-full text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-black text-gray-900">Dulcería TATAO</h2>
            <p className="text-xs text-gray-500">Conectando y sincronizando datos con Firebase Firestore...</p>
          </div>
        </div>
      </div>
    );
  }

  if (accessStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg max-w-md w-full p-6 space-y-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <Cloud className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-black text-gray-900 tracking-tight">Dulcería TATAO</h1>
            <p className="text-xs text-gray-600 leading-relaxed">
              Inicia sesión con tu cuenta de Google autorizada para acceder al sistema contable y
              mantener todos tus datos sincronizados en tiempo real con Firebase Firestore.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 text-left">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            {isSigningIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>{isSigningIn ? 'Conectando...' : 'Acceder con Google'}</span>
          </button>
        </div>
      </div>
    );
  }

  if (accessStatus === 'denied') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-black text-gray-900">Acceso no autorizado</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              La cuenta <strong className="text-gray-900">{user?.email}</strong> no está registrada o
              no está activa en la lista de Usuarios Autorizados de Dulcería TATAO.
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cambiar de cuenta</span>
          </button>
        </div>
      </div>
    );
  }

  return <MainLayout />;
};

const MainLayout: React.FC = () => {
  const { currentModule } = useApp();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const renderModuleView = () => {
    switch (currentModule) {
      case 'Panel':
        return <DashboardView />;
      case 'Producción':
        return <ProductionView />;
      case 'Ventas':
        return <SalesView />;
      case 'Facturación':
        return <BillingView />;
      case 'Gastos':
        return <ExpensesView />;
      case 'Caja':
        return <CashView />;
      case 'Almacén':
        return <WarehouseView />;
      case 'Precios':
        return <PricesView />;
      case 'Clientes':
        return <CustomersView />;
      case 'Productos':
      case 'Materiales':
      case 'Recetas':
        return <ProductsView />;
      case 'Alertas':
        return <AlertsView />;
      case 'Usuarios':
      case 'Ajustes':
        return <UsersView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased">
      {/* Sidebar (fijo en desktop, drawer en móvil) */}
      <Sidebar
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0 transition-all duration-200">
        <Header onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />

        <main className="flex-1 p-2 sm:p-3.5 max-w-7xl w-full mx-auto">
          {renderModuleView()}
        </main>

        {/* Floating and Periodic Alert Reminder */}
        <AlertReminder />

        {/* Notificaciones y Estado de Sincronización */}
        <SyncNotification />

        {/* Modal de Configuración y Sincronización en la Nube */}
        <CloudSyncModal />

        <footer className="py-2.5 px-4 bg-white border-t border-gray-200 text-center text-xs text-gray-500 font-medium">
          Dulcería TATAO &copy; 2026
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <AuthGate />
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
