/**
 * Sidebar panel: upcoming telemedicine visits for the logged-in doctor.
 */

import React, { useEffect, useState } from 'react';
import { Video, Calendar, Clock } from 'lucide-react';
import { telemedicineService, type TelemedicineVisit, isDemoVisitId } from '../../services/telemedicineService';

interface DoctorTelemedicinePanelProps {
  onStartVisit: (visitId: string) => void;
}

const DoctorTelemedicinePanel: React.FC<DoctorTelemedicinePanelProps> = ({ onStartVisit }) => {
  const [visits, setVisits] = useState<TelemedicineVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await telemedicineService.getVisits();
        if (!cancelled) {
          setVisits(
            result.visits.filter((v) => v.status !== 'completed' && !isDemoVisitId(v.id))
          );
        }
      } catch {
        if (!cancelled) setVisits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="shrink-0 border-b border-teal-500/20 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Video className="h-4 w-4 text-teal-400" />
          Telemedicine
        </h2>
        <p className="mt-0.5 text-xs text-slate-400">Join scheduled video visits with your patients</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-teal-400" />
          </div>
        ) : visits.length === 0 ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-5 text-center">
            <Video className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">No upcoming telemedicine visits</p>
            <p className="mt-1 text-xs text-slate-500">
              Video appointments booked by patients will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((visit) => (
              <article
                key={visit.id}
                className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-4"
              >
                <p className="font-semibold text-slate-100">{visit.patientName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {visit.patientId
                    ? `Patient ID: ${visit.patientId}`
                    : visit.reason || 'Video consultation'}
                </p>
                <div className="mt-2 space-y-1 text-xs text-slate-400">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-teal-400" />
                    {new Date(visit.scheduledAt).toLocaleDateString()}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-teal-400" />
                    {new Date(visit.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {visit.durationMinutes} min
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onStartVisit(visit.id)}
                  disabled={!visit.canJoin && visit.status !== 'in_progress'}
                  className="primary-button mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Video className="h-4 w-4" />
                  Start telemedicine
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default DoctorTelemedicinePanel;
