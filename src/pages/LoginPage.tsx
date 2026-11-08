import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Check,
  ChevronRight,
  KeyRound,
  LogIn,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { db } from '../db/db';
import type { Profile, Role } from '../db/types';
import { setSetting } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { ROLE_ICON, ROLE_LABEL, cn } from '../lib/utils';
import { Avatar, Badge, Button, Card, Chip, Input } from '../components/ui';

export interface TestUserCard {
  id: string;
  role: Role;
  name: string;
  roleTitle: string;
  roleBadge: string;
  district: string;
  phone: string;
  specialty: string;
  description: string;
  icon: typeof User;
  iconColor: string;
  iconBg: string;
  borderTone: string;
  badgeTone: 'brand' | 'success' | 'warning' | 'danger' | 'info';
}

export const TEST_USERS: TestUserCard[] = [
  {
    id: 'p-david',
    role: 'vecino',
    name: 'David Quispe',
    roleTitle: 'Vecino del Barrio',
    roleBadge: 'Rol: Vecino',
    district: 'Jesús María',
    phone: '977 221 334',
    specialty: 'Colaborador activo',
    description:
      'Pide y ofrece préstamos, donaciones y favores, acumula puntos y otorga Visto Bueno.',
    icon: User,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    borderTone: 'border-slate-200 hover:border-slate-400',
    badgeTone: 'success',
  },
  {
    id: 'p-manuel',
    role: 'prestador',
    name: 'Manuel Quispe',
    roleTitle: 'Prestador de Oficio',
    roleBadge: 'Rol: Prestador',
    district: 'Jesús María',
    phone: '987 654 321',
    specialty: 'Gasfitería y filtraciones',
    description:
      'Ofrece oficios en el directorio, recibe y acepta solicitudes vecinales y acumula Visto Bueno.',
    icon: Wrench,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    borderTone: 'border-slate-200 hover:border-slate-400',
    badgeTone: 'brand',
  },
  {
    id: 'p-andres',
    role: 'brigadista',
    name: 'Dr. Andrés Campos',
    roleTitle: 'Brigadista Comunitario',
    roleBadge: 'Rol: Brigadista',
    district: 'Jesús María',
    phone: '911 101 112',
    specialty: 'Primeros auxilios y trauma',
    description:
      'Atiende alertas SOS en tiempo real, confirma "estoy en camino" y gestiona disponibilidad.',
    icon: ShieldAlert,
    iconColor: 'text-crisis-700',
    iconBg: 'bg-crisis-50',
    borderTone: 'border-slate-200 hover:border-slate-400',
    badgeTone: 'danger',
  },
  {
    id: 'p-maria',
    role: 'coordinador',
    name: 'María Elena Rojas',
    roleTitle: 'Coordinadora Vecinal',
    roleBadge: 'Rol: Coordinadora',
    district: 'Jesús María',
    phone: '998 112 233',
    specialty: 'Liderazgo barrial y crisis',
    description:
      'Activa el protocolo de crisis, emite comunicados masivos, modera reportes y verifica vecinos.',
    icon: Star,
    iconColor: 'text-slate-700',
    iconBg: 'bg-slate-100',
    borderTone: 'border-slate-200 hover:border-slate-400',
    badgeTone: 'warning',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const setCurrentProfileId = useAppStore((state) => state.setCurrentProfileId);
  const toast = useAppStore((state) => state.toast);

  const [query, setQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Perfiles existentes en la base de datos local
  const profiles = useLiveQuery(() => db.profiles.orderBy('name').toArray(), []);

  const handleLogin = async (profile: Profile) => {
    setBusyId(profile.id);
    try {
      setCurrentProfileId(profile.id);
      await setSetting('currentProfileId', profile.id);
      await setSetting('onboarded', '1');

      toast({
        tone: 'success',
        title: `Sesión iniciada como ${profile.name.split(' ')[0]}`,
        description: profile.roles.map((r) => ROLE_LABEL[r]).join(' · '),
      });

      navigate(returnTo, { replace: true });
    } catch {
      toast({
        tone: 'error',
        title: 'Error al iniciar sesión',
        description: 'No pudimos cambiar el perfil local.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const q = query.trim().toLowerCase();
    return profiles.filter((p) => {
      if (selectedRole !== 'all' && !p.roles.includes(selectedRole)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.district.toLowerCase().includes(q)
      );
    });
  }, [profiles, query, selectedRole]);

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            ← Volver al inicio
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Acceso Local
          </span>
        </div>

        {/* Hero */}
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
            <LogIn size={12} />
            100% offline-first
          </p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
            Iniciar sesión
          </h1>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            Elige un <strong className="font-semibold text-slate-700">usuario de prueba</strong> para
            evaluar cada rol del sistema o ingresa con tu cuenta registrada en este dispositivo.
          </p>
        </div>

        {/* Sección: Usuarios de prueba destacados por rol */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                Usuarios de prueba por rol
              </h2>
              <p className="text-[11px] text-slate-500">
                Ingresa con 1 clic para probar permisos y funciones
              </p>
            </div>
            <Sparkles size={15} className="text-slate-400" />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {TEST_USERS.map((u) => {
              const Icon = u.icon;
              const isCurrent = currentProfileId === u.id;
              const isBusy = busyId === u.id;

              return (
                <div
                  key={u.id}
                  className={cn(
                    'flex flex-col justify-between rounded-xl border bg-white p-4 transition-colors',
                    u.borderTone,
                    isCurrent && 'ring-1 ring-slate-900',
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          u.iconBg,
                          u.iconColor,
                        )}
                      >
                        <Icon size={20} />
                      </span>
                      <Badge tone={u.badgeTone}>{u.roleBadge}</Badge>
                    </div>

                    <div className="mt-3">
                      <h3 className="text-sm font-semibold tracking-tight text-slate-900">{u.name}</h3>
                      <p className="text-[11px] font-medium text-slate-500">
                        {u.specialty}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {u.district} · {u.phone}
                      </p>
                      <p className="mt-2 text-[11px] leading-snug text-slate-600">
                        {u.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      full
                      size="sm"
                      variant={isCurrent ? 'secondary' : 'primary'}
                      loading={isBusy}
                      onClick={() => {
                        const target = profiles?.find((p) => p.id === u.id);
                        if (target) void handleLogin(target);
                        else {
                          // Si no está cargado aún en Dexie por algún motivo, crear perfil fallback
                          void handleLogin({
                            id: u.id,
                            name: u.name,
                            phone: u.phone,
                            district: u.district,
                            lat: -12.083,
                            lng: -77.051,
                            roles: [u.role],
                            verified: 1,
                            bio: u.description,
                            avatarColor: 'from-brand-600 to-indigo-600',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          });
                        }
                      }}
                    >
                      {isCurrent ? (
                        <>
                          <Check size={14} className="text-emerald-600" />
                          Sesión activa
                        </>
                      ) : (
                        <>
                          <LogIn size={14} />
                          Entrar como {u.roleTitle.split(' ')[0]}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sección: Buscar o seleccionar cualquier cuenta local */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Users size={17} className="text-slate-500" />
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              Todas las cuentas en este dispositivo
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Ingresa con cualquier vecino registrado o busca por teléfono
          </p>

          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, teléfono o distrito…"
                className="pl-10 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Chip
                active={selectedRole === 'all'}
                onClick={() => setSelectedRole('all')}
              >
                Todos ({profiles?.length ?? 0})
              </Chip>
              {(['vecino', 'prestador', 'brigadista', 'coordinador'] as Role[]).map(
                (r) => (
                  <Chip
                    key={r}
                    active={selectedRole === r}
                    onClick={() => setSelectedRole(r)}
                  >
                    {ROLE_ICON[r]} {ROLE_LABEL[r]}
                  </Chip>
                ),
              )}
            </div>
          </div>

          <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((person) => {
                const isCurrent = currentProfileId === person.id;
                return (
                  <div
                    key={person.id}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        name={person.name}
                        color={person.avatarColor}
                        size="sm"
                        verified={person.verified === 1}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {person.name}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {person.district} · {person.phone || 'sin teléfono'}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {person.roles.map((r) => (
                            <span
                              key={r}
                              className="text-[9px] font-medium text-slate-500"
                            >
                              {ROLE_ICON[r]} {ROLE_LABEL[r]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isCurrent ? 'secondary' : 'outline'}
                      loading={busyId === person.id}
                      onClick={() => void handleLogin(person)}
                    >
                      {isCurrent ? 'Activo' : 'Entrar'}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">
                No encontramos cuentas con ese criterio.
              </div>
            )}
          </div>
        </div>

        {/* Opción de registrarse */}
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-center">
          <p className="text-xs font-semibold text-slate-900">¿Eres un vecino nuevo?</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Regístrate en 30 segundos con tu nombre y distrito. Sin contraseña ni nube.
          </p>
          <Link
            to="/registro"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Crear nueva cuenta express
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Footer seguridad */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400">
          <ShieldCheck size={12} className="text-slate-400" />
          Tus datos viven en este dispositivo · Funciona 100 % sin internet
        </p>
      </div>
    </div>
  );
}
