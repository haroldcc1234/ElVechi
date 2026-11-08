import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Bell,
  HeartHandshake,
  Map,
  Plus,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  Users,
  Wrench,
} from 'lucide-react';
import { db } from '../db/db';
import { useCurrentProfile, useEmergencyMode, useSetting } from '../hooks';
import { distanceMeters, formatCuadras } from '../lib/geo';
import { levelFor, nextLevelFor } from '../lib/reputation';
import { firstName, formatPoints } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { AlertCard, ProviderCard, ListingCard, QuickAction } from '../components/cards';
import { Avatar, Badge, Card, ProgressBar, SectionHeader } from '../components/ui';
import { StatCard } from '../components/PageBits';

export function HomePage() {
  const { profile, points } = useCurrentProfile();
  const emergency = useEmergencyMode();
  const crisisTitle = useSetting('crisisTitle');
  const openPublish = useAppStore((state) => state.openPublish);

  const level = levelFor(points);
  const nextLevel = nextLevelFor(points);
  const progress = nextLevel
    ? Math.min(100, Math.round(((points - level.min) / (nextLevel.min - level.min)) * 100))
    : 100;

  const recommended = useLiveQuery(async () => {
    const providers = (await db.providers.where('status').equals('active').toArray())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return Promise.all(
      providers.map(async (provider) => ({
        provider,
        profile: await db.profiles.get(provider.profileId),
      })),
    );
  }, []);

  const recent = useLiveQuery(async () => {
    const listings = (await db.listings.toArray())
      .filter((item) => item.status === 'open' && item.hidden !== 1)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);
    return Promise.all(
      listings.map(async (listing) => ({
        listing,
        author: await db.profiles.get(listing.authorId),
      })),
    );
  }, []);

  const openAlerts = useLiveQuery(async () => {
    const alerts = await db.alerts
      .filter((alert) => ['pending', 'assigned', 'in_progress'].includes(alert.status))
      .toArray();
    return Promise.all(
      alerts.map(async (alert) => ({
        alert,
        author: await db.profiles.get(alert.authorId),
      })),
    );
  }, []);

  const pendingIncoming = useLiveQuery(
    () =>
      profile
        ? db.requests
            .where('ownerId')
            .equals(profile.id)
            .filter((request) => request.status === 'pending')
            .count()
        : 0,
    [profile?.id],
  );

  const brigadeAvailable = useLiveQuery(
    () => db.brigadeProfiles.where('availability').equals('available').count(),
    [],
  );

  const needs = useLiveQuery(
    () =>
      db.listings
        .filter(
          (listing) =>
            listing.status === 'open' &&
            (listing.type === 'favor' || listing.type === 'donation' || listing.type === 'time_bank'),
        )
        .count(),
    [],
  );

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const alertCount = openAlerts?.length ?? 0;

  return (
    <div className="space-y-5">
      {emergency ? (
        <section className="overflow-hidden rounded-2xl bg-crisis-700 p-5 text-white">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            Modo emergencia activo
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-tight tracking-tight">
            {crisisTitle || 'Respuesta de crisis del barrio'}
          </h1>
          <p className="mt-1 text-[11px] text-white/70">
            {alertCount} alertas activas · {brigadeAvailable ?? 0} brigadistas disponibles ·{' '}
            {needs ?? 0} necesidades abiertas
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MuscleButton to="/alertas" label="Alertas" value={alertCount} />
            <MuscleButton to="/brigada" label="Brigada" value={brigadeAvailable ?? 0} />
            <MuscleButton to="/mapa" label="Mapa" value="Radar" />
          </div>
          <button
            type="button"
            onClick={() => openPublish('alert')}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-crisis-700 active:scale-[0.99]"
          >
            <Siren size={18} />
            Enviar SOS ahora
          </button>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                Tu barrio, en 360°
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight">
                Hola, {firstName(profile?.name ?? 'vecino')}
              </h1>
              <p className="mt-1 text-[11px] text-white/60">
                {profile?.district ?? 'Tu sector'} · radio de 800 m
              </p>
            </div>
            <Avatar
              name={profile?.name ?? 'Vecino'}
              color={profile?.avatarColor}
              size="lg"
              verified={profile?.verified === 1}
            />
          </div>

          <div className="mt-4 border-t border-white/15 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Star size={13} className="fill-amber-300 text-amber-300" />
                {level.name}
              </div>
              <span className="text-[10px] font-medium text-white/60">
                {formatPoints(points)}
              </span>
            </div>
            <ProgressBar value={progress} className="mt-2 bg-white/20 text-white" />
            <p className="mt-1.5 text-[10px] text-white/50">
              {nextLevel
                ? `Faltan ${nextLevel.min - points} puntos para ${nextLevel.name}`
                : 'Nivel máximo: Guardián del barrio'}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MuscleButton to="/directorio" label="Oficios" value={recommended?.length ?? 0} />
            <MuscleButton to="/muro" label="Muro" value={recent?.length ?? 0} />
            <MuscleButton to="/alertas" label="Alertas" value={alertCount} />
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="Accesos rápidos"
          description="Todo lo que pasa a tu alrededor"
          action={
            <Link to="/mapa" className="text-xs font-semibold text-slate-700">
              Ver mapa
            </Link>
          }
        />
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={<Plus size={20} />}
            label="Publicar"
            hint="3 pasos"
            onClick={() => openPublish('auto')}
          />
          <QuickAction
            icon={<Wrench size={20} />}
            label="Oficios"
            hint="Cerca"
            to="/directorio"
          />
          <QuickAction
            icon={<HeartHandshake size={20} />}
            label="Muro"
            hint="Solidario"
            to="/muro"
            tone="community"
          />
          <QuickAction
            icon={<Map size={20} />}
            label="Radar"
            hint="800 m"
            to="/mapa"
            tone="amber"
          />
          <QuickAction
            icon={<Siren size={20} />}
            label="Emergencia"
            hint="Crisis"
            to="/emergencia"
            tone="crisis"
          />
          <QuickAction
            icon={<Users size={20} />}
            label="Brigada"
            hint="Apoyo"
            to="/brigada"
            tone="community"
          />
          <QuickAction
            icon={<Bell size={20} />}
            label="Avisos"
            hint="Vecinales"
            to="/notificaciones"
          />
          <QuickAction
            icon={<Sparkles size={20} />}
            label="Demo"
            hint="Control"
            to="/demo"
            tone="amber"
          />
        </div>
      </section>

      {pendingIncoming && pendingIncoming > 0 ? (
        <Link
          to="/perfil/solicitudes"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-700">
            <Bell size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-amber-900">
              Tienes {pendingIncoming} solicitud{pendingIncoming === 1 ? '' : 'es'} por responder
            </span>
            <span className="block text-[11px] text-amber-800">
              Tus vecinos necesitan una respuesta.
            </span>
          </span>
          <ArrowRight size={16} className="text-amber-700" />
        </Link>
      ) : null}

      {emergency && openAlerts && openAlerts.length > 0 ? (
        <section>
          <SectionHeader
            title="Alertas que necesitan apoyo"
            action={
              <Link to="/alertas" className="text-xs font-semibold text-crisis-700">
                Ver todas
              </Link>
            }
          />
          <div className="space-y-2.5">
            {openAlerts
              .slice()
              .sort((a, b) => b.alert.createdAt.localeCompare(a.alert.createdAt))
              .slice(0, 2)
              .map(({ alert, author }) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  author={author}
                  distance={distanceMeters(coords, { lat: alert.lat, lng: alert.lng })}
                />
              ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Técnicos recomendados"
          description="Visto Bueno ponderado por cercanía"
          action={
            <Link to="/directorio" className="text-xs font-semibold text-slate-700">
              Directorio
            </Link>
          }
        />
        <div className="space-y-2.5">
          {recommended?.map(({ provider, profile: owner }) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              profile={owner}
              distance={distanceMeters(coords, { lat: provider.lat, lng: provider.lng })}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Último en el muro"
          description="Préstamos, donaciones, favores y más"
          action={
            <Link to="/muro" className="text-xs font-semibold text-slate-700">
              Ver muro
            </Link>
          }
        />
        <div className="space-y-2.5">
          {recent?.map(({ listing, author }) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              author={author}
              distance={distanceMeters(coords, { lat: listing.lat, lng: listing.lng })}
            />
          ))}
        </div>
      </section>

      <Card className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <ShieldCheck size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Economía hiperlocal</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Cada favor, préstamo y donación fortalece la red que nos sostiene cuando falla todo lo
            demás.
          </p>
        </div>
      </Card>

      <p className="pb-2 text-center text-[10px] text-slate-400">
        {formatCuadras(800)} a la redonda · datos guardados en tu dispositivo
      </p>
    </div>
  );
}

function MuscleButton({
  to,
  label,
  value,
}: {
  to: string;
  label: string;
  value: number | string;
}) {
  return (
    <Link to={to} className="rounded-lg border border-white/20 px-2 py-2 text-center">
      <span className="block text-sm font-semibold leading-none tracking-tight">{value}</span>
      <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-white/55">
        {label}
      </span>
    </Link>
  );
}
