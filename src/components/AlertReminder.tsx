import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate } from '../lib/calculations';
import { toISODate } from '../utils/dateUtils';
import { Bell, AlertTriangle, ArrowRight, X, Clock, Landmark, BookOpen } from 'lucide-react';

const REPARTO_DAILY_REMINDER_KEY = 'dulceria_tatao_reparto_reminded_date';

export const AlertReminder: React.FC = () => {
  const {
    data,
    currentModule,
    setCurrentModule,
    pendingAlertsCount,
    pendingRepartosCount,
    outOfStockRecetasCount,
  } = useApp();
  const [isReminderOpen, setIsReminderOpen] = useState<boolean>(false);
  const [isRepartoReminderOpen, setIsRepartoReminderOpen] = useState<boolean>(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('dulceria_tatao_snoozedUntil') || '0', 10);
    } catch {
      return 0;
    }
  });
  const [repartoRemindedDate, setRepartoRemindedDate] = useState<string>(() => {
    try {
      return localStorage.getItem(REPARTO_DAILY_REMINDER_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    localStorage.setItem('dulceria_tatao_snoozedUntil', String(snoozedUntil));
  }, [snoozedUntil]);

  useEffect(() => {
    if (repartoRemindedDate) {
      localStorage.setItem(REPARTO_DAILY_REMINDER_KEY, repartoRemindedDate);
    }
  }, [repartoRemindedDate]);

  const pendingRepartos = useMemo(() => {
    return (data.repartos || []).filter((r) => r.estado === 'Pendiente');
  }, [data.repartos]);

  // Interval in ms for periodic reminder: 1 hour (60 minutes)
  const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

  useEffect(() => {
    if (pendingAlertsCount === 0 || currentModule === 'Alertas') {
      setIsReminderOpen(false);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      if (now > snoozedUntil && pendingAlertsCount > 0 && !isReminderOpen) {
        setIsReminderOpen(true);
      }
    }, 60000); // Check once a minute

    return () => clearInterval(interval);
  }, [pendingAlertsCount, currentModule, snoozedUntil, isReminderOpen]);

  // Initial trigger only after 1 hour of session if pending alerts exist
  useEffect(() => {
    if (pendingAlertsCount > 0 && currentModule !== 'Alertas') {
      const timeout = setTimeout(() => {
        if (Date.now() > snoozedUntil) {
          setIsReminderOpen(true);
        }
      }, 60 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [pendingAlertsCount, currentModule, snoozedUntil]);

  // Daily reminder for pending Repartos in Caja
  useEffect(() => {
    if (pendingRepartosCount === 0 || currentModule === 'Caja') {
      setIsRepartoReminderOpen(false);
      return;
    }

    const checkDailyRepartoReminder = () => {
      const today = toISODate(new Date());
      if (repartoRemindedDate !== today) {
        setIsRepartoReminderOpen(true);
      }
    };

    const initialTimer = setTimeout(checkDailyRepartoReminder, 1200);
    const interval = setInterval(checkDailyRepartoReminder, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [pendingRepartosCount, currentModule, repartoRemindedDate]);

  const showAlertsBubble = pendingAlertsCount > 0 && currentModule !== 'Alertas';
  const showRepartoBubble = pendingRepartosCount > 0 && currentModule !== 'Caja';
  const showRecetasBubble = outOfStockRecetasCount > 0 && currentModule !== 'Recetas';

  if (!showAlertsBubble && !showRepartoBubble && !showRecetasBubble && !isReminderOpen && !isRepartoReminderOpen) {
    return null;
  }

  const handleGoToAlerts = () => {
    setIsReminderOpen(false);
    setCurrentModule('Alertas');
  };

  const handleSnooze = () => {
    setIsReminderOpen(false);
    setSnoozedUntil(Date.now() + REMINDER_INTERVAL_MS);
  };

  const handleAcknowledgeRepartoToday = () => {
    setIsRepartoReminderOpen(false);
    setRepartoRemindedDate(toISODate(new Date()));
  };

  const handleGoToCaja = () => {
    setIsRepartoReminderOpen(false);
    setRepartoRemindedDate(toISODate(new Date()));
    setCurrentModule('Caja');
  };

  const handleGoToRecetas = () => {
    setCurrentModule('Recetas');
  };

  return (
    <>
      {/* 1. Circulitos Flotantes en la esquina inferior derecha */}
      {(showRecetasBubble || showRepartoBubble || showAlertsBubble) && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
          {showRecetasBubble && (
            <button
              type="button"
              onClick={handleGoToRecetas}
              className="group relative flex items-center gap-2 p-3 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              title={`${outOfStockRecetasCount} receta(s) con material agotado en Almacén`}
              aria-label="Ver recetas con material agotado"
            >
              <BookOpen className="w-5 h-5 animate-bounce" />
              <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white font-black text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {outOfStockRecetasCount}
              </span>
              <span className="hidden group-hover:inline-block pr-1 text-xs font-semibold whitespace-nowrap animate-in fade-in duration-150">
                {outOfStockRecetasCount} Receta{outOfStockRecetasCount > 1 ? 's' : ''} agotada{outOfStockRecetasCount > 1 ? 's' : ''}
              </span>
            </button>
          )}
          {showRepartoBubble && (
            <button
              type="button"
              onClick={handleGoToCaja}
              className="group relative flex items-center gap-2 p-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
              title={`${pendingRepartosCount} reparto(s) pendiente(s) de pago en Caja`}
              aria-label="Ver repartos pendientes en Caja"
            >
              <Landmark className="w-5 h-5 animate-bounce" />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-black text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {pendingRepartosCount}
              </span>
              <span className="hidden group-hover:inline-block pr-1 text-xs font-semibold whitespace-nowrap animate-in fade-in duration-150">
                {pendingRepartosCount} Reparto{pendingRepartosCount > 1 ? 's' : ''} pendiente{pendingRepartosCount > 1 ? 's' : ''}
              </span>
            </button>
          )}

          {showAlertsBubble && (
            <button
              type="button"
              onClick={handleGoToAlerts}
              className="group relative flex items-center gap-2 p-3 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              title={`${pendingAlertsCount} diferencia(s) pendiente(s) de justificar en Alertas`}
              aria-label="Ver alertas pendientes"
            >
              <Bell className="w-5 h-5 animate-bounce" />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-black text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {pendingAlertsCount}
              </span>
              <span className="hidden group-hover:inline-block pr-1 text-xs font-semibold whitespace-nowrap animate-in fade-in duration-150">
                {pendingAlertsCount} Alerta{pendingAlertsCount > 1 ? 's' : ''}
              </span>
            </button>
          )}
        </div>
      )}

      {/* 2. Modal Semitransparente Superpuesto de Recordatorio Periódico (Alertas) */}
      {isReminderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white/95 border border-amber-300 rounded-xl shadow-2xl max-w-sm w-full p-4 space-y-3.5 backdrop-blur-md">
            <div className="flex items-start justify-between gap-2 border-b border-amber-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Recordatorio de Conciliación
                  </h3>
                  <span className="text-[11px] font-semibold text-amber-700">
                    {pendingAlertsCount} diferencia(s) pendiente(s)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSnooze}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
                title="Cerrar recordatorio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Existen <strong className="text-amber-800">{pendingAlertsCount} diferencia(s)</strong> históricas
              entre la producción y las ventas que aún no han sido justificadas o rectificadas.
              Recuerda ingresar la causa de cada diferencia para mantener la contabilidad cuadrada.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={handleSnooze}
                className="px-3 py-1.5 font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Recordar más tarde</span>
              </button>
              <button
                type="button"
                onClick={handleGoToAlerts}
                className="px-3.5 py-1.5 font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span>Ir al Menú Alertas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Recordatorio Diario de Reparto Pendiente de Pago (Caja) */}
      {isRepartoReminderOpen && pendingRepartosCount > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white/95 border border-emerald-300 rounded-xl shadow-2xl max-w-sm w-full p-4 space-y-3.5 backdrop-blur-md">
            <div className="flex items-start justify-between gap-2 border-b border-emerald-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Recordatorio Diario de Reparto
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    {pendingRepartosCount} reparto(s) pendiente(s) de pago
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAcknowledgeRepartoToday}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
                title="Cerrar recordatorio por hoy"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700 leading-relaxed">
              <p>
                Tienes <strong className="text-emerald-800">{pendingRepartosCount} reparto(s) semanal(es)</strong> pendiente(s)
                de confirmar su pago en <strong>Caja</strong>:
              </p>
              <ul className="space-y-1 text-[11px] text-gray-600 bg-slate-50 border border-gray-200 rounded-md p-2 max-h-28 overflow-y-auto">
                {pendingRepartos.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">
                      Semana {formatDate(r.desde)} – {formatDate(r.hasta)}
                    </span>
                    <span className="font-semibold text-amber-700">Pendiente</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-gray-500">
                Si ya efectuaste el pago, confirma en Caja marcándolo como pagado.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={handleAcknowledgeRepartoToday}
                className="px-3 py-1.5 font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Recordar mañana</span>
              </button>
              <button
                type="button"
                onClick={handleGoToCaja}
                className="px-3.5 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span>Confirmar en Caja</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
