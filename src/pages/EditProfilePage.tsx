import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crosshair, MapPin } from 'lucide-react';
import { updateProfile } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { DISTRICTS, getCurrentPosition, nearestDistrict } from '../lib/geo';
import { isValidPhone } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Button, Card, Input, Select, Textarea } from '../components/ui';
import { PageHeading } from '../components/PageBits';

export function EditProfilePage() {
  const { profile } = useCurrentProfile();
  const navigate = useNavigate();
  const toast = useAppStore((state) => state.toast);

  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [district, setDistrict] = useState(profile?.district ?? DISTRICTS[0].name);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [coords, setCoords] = useState({
    lat: profile?.lat ?? DISTRICTS[0].lat,
    lng: profile?.lng ?? DISTRICTS[0].lng,
  });
  const [gps, setGps] = useState<'idle' | 'loading' | 'gps' | 'demo'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!profile) {
    return <PageHeading title="Editar perfil" back={{ to: '/perfil', label: 'Perfil' }} />;
  }

  const save = async () => {
    setError('');
    if (name.trim().length < 3) {
      setError('El nombre es demasiado corto.');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError('Teléfono inválido.');
      return;
    }
    setBusy(true);
    await updateProfile(profile.id, {
      name: name.trim(),
      phone: phone.trim(),
      district,
      bio: bio.trim(),
      lat: coords.lat,
      lng: coords.lng,
    });
    setBusy(false);
    toast({ tone: 'success', title: 'Perfil actualizado' });
    navigate('/perfil');
  };

  const useGps = async () => {
    setGps('loading');
    const result = await getCurrentPosition();
    setCoords(result.coords);
    setGps(result.source);
    if (result.source === 'gps') setDistrict(nearestDistrict(result.coords));
  };

  return (
    <div>
      <PageHeading
        title="Editar perfil"
        subtitle="Estos datos se guardan solo en tu dispositivo."
        back={{ to: '/perfil', label: 'Mi perfil' }}
      />

      <Card className="space-y-3">
        <Input label="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          label="Teléfono"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          hint="Visible al coordinar solicitudes aceptadas"
        />
        <Select
          label="Distrito"
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
        <Button variant="secondary" full onClick={() => void useGps()} loading={gps === 'loading'}>
          <Crosshair size={16} />
          {gps === 'gps' ? 'Ubicación GPS actualizada' : gps === 'demo' ? 'Usar ubicación demo' : 'Actualizar con GPS'}
        </Button>
        <Textarea
          label="Bio"
          value={bio}
          maxLength={180}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Cómo puedes ayudar al barrio…"
        />

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            Lat {coords.lat.toFixed(4)}, Lng {coords.lng.toFixed(4)}. La distancia de tus Vistos
            Buenos se calcula desde aquí.
          </span>
        </div>

        {profile.verified === 1 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
            Tu identidad ya fue verificada por un coordinador.
          </p>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
            Aún no estás verificado. Un coordinador puede validar tu identidad desde su panel.
          </p>
        )}

        {error ? <p className="text-xs font-medium text-crisis-600">{error}</p> : null}

        <Button full onClick={() => void save()} loading={busy}>
          <Check size={17} />
          Guardar cambios
        </Button>
      </Card>
    </div>
  );
}
