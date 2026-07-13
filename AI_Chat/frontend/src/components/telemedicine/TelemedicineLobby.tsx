import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Calendar, Clock, User, ArrowRight, Plus, Stethoscope, MapPin } from 'lucide-react';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
} from '../patient/portalPageLayout';
import TelemedicineConsentModal from './TelemedicineConsentModal';
import {
  telemedicineService,
  type TelemedicineVisit,
  type TelemedicineDoctor,
  withoutDemoVisits,
} from '../../services/telemedicineService';
import { useLocationContext } from '../../context/LocationContext';

const TelemedicineLobby: React.FC = () => {
  const navigate = useNavigate();
  const { coords, location } = useLocationContext();
  const [visits, setVisits] = useState<TelemedicineVisit[]>([]);
  const [doctors, setDoctors] = useState<TelemedicineDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null);
  const [consentText, setConsentText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      telemedicineService.getConsentText().then(setConsentText),
      telemedicineService.getVisits().then((r) => {
        if (!cancelled) setVisits(withoutDemoVisits(r.visits));
      }),
      telemedicineService
        .getTelemedicineDoctors({ lat: coords.lat, lng: coords.lng, maxKm: 50 })
        .then((r) => {
          if (!cancelled && r.success) setDoctors(r.doctors);
        }),
    ]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [coords.lat, coords.lng]);

  const handleJoinClick = (visitId: string) => {
    setPendingVisitId(visitId);
    setConsentOpen(true);
  };

  const handleConsentAccept = async () => {
    if (!pendingVisitId) return;
    await telemedicineService.recordConsent(pendingVisitId);
    setConsentOpen(false);
    navigate(`/portal/telemedicine/visit/${pendingVisitId}`);
  };

  const handleBookDoctor = (doctor: TelemedicineDoctor) => {
    navigate('/portal/appointments/book', {
      state: { visitMode: 'video', doctorId: doctor.doctor_id },
    });
  };

  if (loading) return <PortalLoading message="Loading telemedicine…" />;

  const upcoming = visits.filter((v) => v.status !== 'completed');

  return (
    <PortalPageShell>
      <PortalPageHero
        eyebrow={
          <span className="flex items-center gap-2">
            Telemedicine
          </span>
        }
        title="Telemedicine"
        subtitle="Book video consultations with available doctors and join scheduled visits."
        icon={<Video className="text-slate-950" />}
        actions={
          <button
            type="button"
            onClick={() => navigate('/portal/appointments/book', { state: { visitMode: 'video' } })}
            className="portal-accent-button inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold"
          >
            <Plus className="h-4 w-4" />
            Book Telemedicine
          </button>
        }
      />

      <section className="mb-8">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-100">
          <Stethoscope className="h-5 w-5 text-teal-400" />
          Doctors available for telemedicine
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Near {location.name} · within 50 km
        </p>
        {doctors.length === 0 ? (
          <div className="premium-card p-6 text-center text-sm text-slate-400">
            No telemedicine doctors are configured yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {doctors.map((doctor) => (
              <article key={doctor.doctor_id} className="premium-card flex flex-col p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-100">
                      Dr. {doctor.first_name} {doctor.last_name}
                    </h3>
                    <p className="text-sm text-slate-400">{doctor.specialty_name || 'General Medicine'}</p>
                  </div>
                  {doctor.is_available && (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                      Available
                    </span>
                  )}
                </div>
                <div className="mb-4 space-y-1.5 text-sm text-slate-400">
                  {doctor.qualification && <p>{doctor.qualification}</p>}
                  {doctor.experience_years != null && (
                    <p>{doctor.experience_years} years experience</p>
                  )}
                  {doctor.facility_name && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                      <span>
                        {doctor.facility_name}
                        {doctor.distance_km != null && ` · ${doctor.distance_km} km`}
                      </span>
                    </p>
                  )}
                  {doctor.consultation_fee != null && (
                    <p className="font-semibold text-teal-300">A${doctor.consultation_fee} consultation</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleBookDoctor(doctor)}
                  className="primary-button mt-auto flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                >
                  <Calendar className="h-4 w-4" />
                  Book appointment
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-100">
          <Video className="h-5 w-5 text-teal-400" />
          Your telemedicine visits
        </h2>
        {upcoming.length === 0 ? (
          <div className="premium-card p-8 text-center">
            <Video className="mx-auto mb-3 h-12 w-12 text-slate-600" />
            <p className="text-slate-400">No upcoming telemedicine appointments.</p>
            <button
              type="button"
              onClick={() => navigate('/portal/appointments/book', { state: { visitMode: 'video' } })}
              className="portal-accent-button mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              Book your first visit
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((visit) => (
              <article key={visit.id} className="premium-card flex flex-col p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-100">{visit.doctorName}</h3>
                    <p className="text-sm text-slate-400">{visit.specialty}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      visit.canJoin ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                    }`}
                  >
                    {visit.canJoin ? 'Ready to join' : 'Scheduled'}
                  </span>
                </div>
                <div className="mb-4 space-y-2 text-sm text-slate-400">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-teal-400" />
                    {new Date(visit.scheduledAt).toLocaleDateString()}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-teal-400" />
                    {new Date(visit.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{visit.durationMinutes} min
                  </p>
                  <p className="flex items-center gap-2">
                    <User className="h-4 w-4 text-teal-400" />
                    {visit.patientName}
                  </p>
                </div>
                <p className="mb-4 text-sm text-slate-500">Fee: A${visit.fee}</p>
                <button
                  type="button"
                  disabled={!visit.canJoin}
                  onClick={() => handleJoinClick(visit.id)}
                  className="primary-button mt-auto flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  Join Telemedicine <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <TelemedicineConsentModal
        open={consentOpen}
        consentText={consentText}
        onAccept={handleConsentAccept}
        onClose={() => setConsentOpen(false)}
      />
    </PortalPageShell>
  );
};

export default TelemedicineLobby;
