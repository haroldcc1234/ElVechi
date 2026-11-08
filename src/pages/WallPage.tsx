import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HeartHandshake, Plus, Search } from 'lucide-react';
import { db } from '../db/db';
import type { ListingType } from '../db/types';
import { useAppStore } from '../store/useAppStore';
import { useCurrentProfile, useEmergencyMode } from '../hooks';
import { distanceMeters } from '../lib/geo';
import { LISTING_TYPE_ICON, LISTING_TYPE_LABEL, cn } from '../lib/utils';
import { ListingCard } from '../components/cards';
import { Chip, EmptyState, Input } from '../components/ui';
import { PageHeading } from '../components/PageBits';

const TYPES: Array<ListingType | 'all'> = [
  'all',
  'loan',
  'donation',
  'favor',
  'time_bank',
  'mobility',
  'service',
];

export function WallPage() {
  const { profile } = useCurrentProfile();
  const emergency = useEmergencyMode();
  const openPublish = useAppStore((state) => state.openPublish);
  const [type, setType] = useState<ListingType | 'all'>('all');
  const [query, setQuery] = useState('');

  const listings = useLiveQuery(async () => {
    const rows = (await db.listings.toArray())
      .filter((item) => item.status === 'open' && item.hidden !== 1)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.all(
      rows.map(async (listing) => ({
        listing,
        author: await db.profiles.get(listing.authorId),
      })),
    );
  }, []);

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (listings ?? []).filter(({ listing }) => {
      if (type !== 'all' && listing.type !== type) return false;
      if (!normalized) return true;
      return [listing.title, listing.description, listing.category, listing.district]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [listings, type, query]);

  const urgent = filtered.filter(
    ({ listing }) => listing.type === 'favor' || listing.type === 'donation',
  );
  const rest = filtered.filter(
    ({ listing }) => listing.type !== 'favor' && listing.type !== 'donation',
  );

  return (
    <div>
      <PageHeading
        title="Muro solidario"
        subtitle="Préstamos, donaciones, favores, tiempo y movilidad entre vecinos."
        action={
          <button
            type="button"
            onClick={() => openPublish('auto')}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white "
          >
            <Plus size={15} />
            Publicar
          </button>
        }
      />

      {emergency ? (
        <div className="mb-3 rounded-lg border border-crisis-200 bg-crisis-50 px-4 py-3 text-xs text-crisis-800">
          <p className="font-semibold">Modo emergencia activo</p>
          <p className="mt-0.5 text-crisis-700">
            Las necesidades urgentes se priorizan. Si hay riesgo de vida, crea una alerta SOS.
          </p>
        </div>
      ) : null}

      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en el muro…"
            className="pl-11"
            aria-label="Buscar publicaciones"
          />
        </div>
        <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TYPES.map((item) => (
            <Chip
              key={item}
              active={type === item}
              onClick={() => setType(item)}
              className={cn(item === 'all' && 'font-semibold')}
            >
              {item === 'all' ? '✨ Todos' : `${LISTING_TYPE_ICON[item]} ${LISTING_TYPE_LABEL[item]}`}
            </Chip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake size={34} />}
          title="El muro está tranquilo"
          description="Publica un préstamo, una donación o un favor. La red se activa con el primer gesto."
          action={
            <button
              type="button"
              onClick={() => openPublish('auto')}
              className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white"
            >
              Crear publicación
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {urgent.length > 0 && type === 'all' ? (
            <section>
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600">
                Necesidades y donaciones
              </h2>
              <div className="space-y-2.5">
                {urgent.map(({ listing, author }) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    author={author}
                    distance={distanceMeters(coords, { lat: listing.lat, lng: listing.lng })}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            {urgent.length > 0 && rest.length > 0 && type === 'all' ? (
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Todo lo demás
              </h2>
            ) : null}
            <div className="space-y-2.5">
              {(type === 'all' ? rest : filtered).map(({ listing, author }) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  author={author}
                  distance={distanceMeters(coords, { lat: listing.lat, lng: listing.lng })}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <p className="mt-5 text-center text-[10px] text-slate-400">
        {filtered.length} publicaciones abiertas · radio hiperlocal
      </p>
    </div>
  );
}
