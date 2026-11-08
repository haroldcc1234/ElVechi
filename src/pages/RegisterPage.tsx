import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Crosshair, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { createProfile } from '../db/repositories';
import { DISTRICTS, getCurrentPosition, nearestDistrict } from '../lib/geo';
import { isValidPhone, TRADES } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Button, Input, Select, Textarea } from '../components/ui';

export function RegisterPage() {
  const navigate = useNavigate();
  const toast = useAppStore((state) => state.toast);
  const setCurrentProfileId = useAppStore((state) => state.setCurrentProfileId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState(DISTRICTS[0].name);
  const [bio, setBio] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [wantsProvider, setWantsProvider] = useState(false);
  const [wantsBrigade, setWantsBrigade] = useState(false);
  const [coords, setCoords] = useState({ lat: DISTRICTS[0].lat, lng: DISTRICTS[0].lng });
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'gps' | 'demo'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const useGps = async () => {
    setGpsState('loading');
    const result = await getCurrentPosition();
    setCoords(result.coords);
    setGpsState(result.source);
    if (result.source === 'gps') setDistrict(nearestDistrict(result.coords));
  };

  const submit = async () => {
    setError('');
    if (name.trim().length < 3) {
      setError('Escribe tu nombre completo (mínimo 3 caracteres).');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError('El teléfono no parece válido. Puedes dejarlo vacío.');
      return;
    }

    setBusy(true);
    try {
      const roles = ['vecino'] as Array<'vecino' | 'prestador' | 'brigadista'>;
      if (wantsProvider) roles.push('prestador');
      if (wantsBrigade) roles.push('brigadista');

      const profile = await createProfile({
        name,
        phone,
        district,
        lat: coords.lat,
        lng: coords.lng,
        bio: [bio.trim(), wantsProvider ? `Ofrezco ${trade}.` : ''].filter(Boolean).join(' '),
        roles,
      });

      setCurrentProfileId(profile.id);
      toast({
        tone: 'success',
        title: `Bienvenido, ${profile.name.split(' ')[0]}`,
        description: 'Tu perfil quedó guardado en este dispositivo.',
      });
      if (wantsProvider) navigate('/perfil/oficios');
      else if (wantsBrigade) navigate('/perfil/brigada');
      else navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos crear tu perfil.');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-md px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Link to="/onboarding" className="text-xs font-medium text-slate-500 hover:text-slate-900">
            ← Volver
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Registro express
          </span>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Sparkles size={20} />
          </span>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
            Únete a tu barrio
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Solo necesitamos tu nombre y sector. Sin contraseñas, sin cuentas remotas. Todo queda
            en tu dispositivo.
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <Input
            label="Nombre y apellido"
            placeholder="Ej. Carlos Ricce"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
          <Input
            label="Teléfono (opcional)"
            hint="Para coordinar con vecinos"
            placeholder="987 654 321"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />
          <Select
            label="Distrito / sector"
            value={district}
            onChange={(event) => {
              const next = event.target.value;
              setDistrict(next);
              const base = DISTRICTS.find((item) => item.name === next);
              if (base) setCoords({ lat: base.lat, lng: base.lng });
            }}
          >
            {DISTRICTS.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </Select>

          <Button
            variant="secondary"
            full
            onClick={() => void useGps()}
            loading={gpsState === 'loading'}
          >
            <Crosshair size={16} />
            {gpsState === 'gps'
              ? 'Ubicación GPS capturada'
              : gpsState === 'demo'
                ? 'Usar ubicación demo del barrio'
                : 'Usar mi ubicación GPS'}
          </Button>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              ¿Cómo quieres participar?
            </p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={wantsProvider}
                  onChange={(event) => setWantsProvider(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-slate-900"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-800">Ofrecer un oficio</span>
                  <span className="block text-[10px] text-slate-500">
                    Aparecer en el directorio con Visto Bueno vecinal.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={wantsBrigade}
                  onChange={(event) => setWantsBrigade(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-slate-900"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-800">
                    Ser brigadista vecinal
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Primeros auxilios, rescate, transporte u otra habilidad.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {wantsProvider ? (
            <Select label="Tu oficio principal" value={trade} onChange={(event) => setTrade(event.target.value)}>
              {TRADES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          ) : null}

          <Textarea
            label="Bio breve (opcional)"
            placeholder="Cuéntale al barrio cómo puedes ayudar…"
            value={bio}
            maxLength={180}
            onChange={(event) => setBio(event.target.value)}
            className="min-h-[72px]"
          />

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <MapPin size={13} className="shrink-0 text-slate-400" />
            {gpsState === 'gps'
              ? 'Tu GPS quedó registrado para calcular distancias reales.'
              : gpsState === 'demo'
                ? 'Usando el centro demo del barrio. Puedes activar GPS luego.'
                : 'Sin GPS usaremos el centro del distrito seleccionado.'}
          </div>

          {error ? (
            <p className="rounded-lg bg-crisis-50 px-3 py-2 text-xs font-medium text-crisis-700">
              {error}
            </p>
          ) : null}

          <Button full size="lg" onClick={() => void submit()} loading={busy}>
            Entrar al barrio
            <ArrowRight size={18} />
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck size={12} />
            Perfil local · sin contraseña · exportable cuando quieras
          </p>
        </div>

        <div className="mt-4 flex flex-col items-center gap-1 text-center">
          <Link to="/login" className="text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline">
            ¿Ya tienes cuenta o quieres probar un rol? Iniciar sesión →
          </Link>
          <Link to="/demo" className="text-[11px] font-medium text-slate-400 hover:text-slate-600">
            Panel de demostración
          </Link>
        </div>
      </div>
    </div>
  );
}
