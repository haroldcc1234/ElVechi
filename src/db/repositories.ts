import { db } from './db';
import { seedDatabase } from './seed';
import type {
  Alert,
  AlertSeverity,
  AppNotification,
  BrigadeProfile,
  Endorsement,
  EntityName,
  Listing,
  ListingMeta,
  ListingStatus,
  ListingType,
  NotificationType,
  Profile,
  Provider,
  QueueItem,
  Report,
  RequestEntity,
  RequestMeta,
  ReputationType,
  Role,
} from './types';
import { POINTS } from '../lib/reputation';
import { addDaysIso, nowIso, uid } from '../lib/utils';
import { requestSync } from '../sync/bus';
import { serverDb } from './server-db';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function queueItem(
  entity: EntityName,
  entityId: string,
  operation: QueueItem['operation'],
  payload: unknown,
  baseVersion: number,
): QueueItem {
  return {
    id: uid(),
    entity,
    entityId,
    operation,
    payload,
    baseVersion,
    idempotencyKey: uid(),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: nowIso(),
    createdAt: nowIso(),
  };
}

export async function getSetting(
  key: string,
  fallback = '',
): Promise<string> {
  const setting = await db.settings.get(key);
  return setting?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export interface CreateProfileInput {
  name: string;
  phone: string;
  district: string;
  lat: number;
  lng: number;
  bio?: string;
  roles?: Role[];
}

export async function createProfile(
  input: CreateProfileInput,
): Promise<Profile> {
  const timestamp = nowIso();
  const profile: Profile = {
    id: uid(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    roles: input.roles ?? ['vecino'],
    verified: 0,
    bio: input.bio?.trim() ?? '',
    avatarColor: 'bg-slate-900',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.profiles.add(profile);
  await setSetting('currentProfileId', profile.id);
  await setSetting('onboarded', '1');
  return profile;
}

export async function updateProfile(
  id: string,
  patch: Partial<Omit<Profile, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.profiles.update(id, { ...patch, updatedAt: nowIso() });
}

export async function verifyProfile(id: string, verified: boolean): Promise<void> {
  await db.profiles.update(id, {
    verified: verified ? 1 : 0,
    updatedAt: nowIso(),
  });
  await notify(id, {
    type: 'system',
    title: verified ? 'Vecino verificado' : 'Verificación retirada',
    body: verified
      ? 'Tu coordinador vecinal validó tu identidad. Ya tienes el sello de vecino verificado.'
      : 'Tu coordinador retiró el sello de verificación temporalmente.',
    link: '/perfil',
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function notify(
  profileId: string,
  input: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
): Promise<AppNotification> {
  const notification: AppNotification = {
    id: uid(),
    profileId,
    type: input.type,
    title: input.title,
    body: input.body,
    read: 0,
    createdAt: nowIso(),
    link: input.link,
  };
  await db.notifications.add(notification);
  return notification;
}

export async function notifyMany(
  profileIds: string[],
  input: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
): Promise<void> {
  const unique = [...new Set(profileIds)];
  if (unique.length === 0) return;
  const timestamp = nowIso();
  await db.notifications.bulkAdd(
    unique.map((profileId) => ({
      id: uid(),
      profileId,
      type: input.type,
      title: input.title,
      body: input.body,
      read: 0 as const,
      createdAt: timestamp,
      link: input.link,
    })),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.notifications.update(id, { read: 1 });
}

export async function markAllNotificationsRead(profileId: string): Promise<void> {
  const unread = await db.notifications
    .where('[profileId+read]')
    .equals([profileId, 0])
    .toArray();
  await Promise.all(unread.map((item) => db.notifications.update(item.id, { read: 1 })));
}

/* ------------------------------------------------------------------ */
/* Reputation                                                          */
/* ------------------------------------------------------------------ */

export async function reputationPoints(profileId: string): Promise<number> {
  const events = await db.reputationEvents
    .where('profileId')
    .equals(profileId)
    .toArray();
  return events.reduce((sum, event) => sum + event.points, 0);
}

export async function awardPoints(
  profileId: string,
  type: ReputationType,
  description: string,
  points = POINTS[type],
): Promise<void> {
  if (points === 0) return;
  await db.reputationEvents.add({
    id: uid(),
    profileId,
    type,
    points,
    description,
    createdAt: nowIso(),
  });
}

/* ------------------------------------------------------------------ */
/* Providers & endorsements                                            */
/* ------------------------------------------------------------------ */

export interface ProviderInput {
  trade: string;
  description: string;
  district: string;
  lat: number;
  lng: number;
  coverageRadiusM: number;
  schedule: string;
}

export async function upsertMyProvider(
  profile: Profile,
  input: ProviderInput,
): Promise<Provider> {
  const existing = await db.providers.where('profileId').equals(profile.id).first();
  const timestamp = nowIso();

  if (existing) {
    const updated: Provider = {
      ...existing,
      ...input,
      status: 'active',
      updatedAt: timestamp,
      version: existing.version + 1,
      syncStatus: 'pending',
    };
    await db.transaction('rw', db.providers, db.syncQueue, async () => {
      await db.providers.put(updated);
      await db.syncQueue.add(
        queueItem('providers', updated.id, 'update', updated, existing.version),
      );
    });
    requestSync();
    return updated;
  }

  const provider: Provider = {
    id: uid(),
    profileId: profile.id,
    ...input,
    status: 'active',
    score: 0,
    endorsementCount: 0,
    verified: profile.verified,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.providers, db.syncQueue, async () => {
    await db.providers.add(provider);
    await db.syncQueue.add(queueItem('providers', provider.id, 'create', provider, 0));
  });
  requestSync();
  return provider;
}

export async function deactivateMyProvider(providerId: string): Promise<void> {
  const provider = await db.providers.get(providerId);
  if (!provider) return;
  const updated: Provider = {
    ...provider,
    status: 'inactive',
    updatedAt: nowIso(),
    version: provider.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.providers, db.syncQueue, async () => {
    await db.providers.put(updated);
    await db.syncQueue.add(
      queueItem('providers', updated.id, 'update', updated, provider.version),
    );
  });
  requestSync();
}

export async function endorseProvider(
  providerId: string,
  endorser: Profile,
  weight: number,
  comment: string,
): Promise<{ ok: boolean; reason?: string }> {
  const provider = await db.providers.get(providerId);
  if (!provider) return { ok: false, reason: 'Prestador no encontrado.' };
  if (provider.profileId === endorser.id) {
    return { ok: false, reason: 'No puedes darte un Visto Bueno a ti mismo.' };
  }

  const existing = await db.endorsements
    .where('[providerId+endorserId]')
    .equals([providerId, endorser.id])
    .first();
  if (existing) {
    return { ok: false, reason: 'Ya diste tu Visto Bueno a este prestador.' };
  }

  const timestamp = nowIso();
  const endorsement: Endorsement = {
    id: uid(),
    providerId,
    endorserId: endorser.id,
    weight,
    comment: comment.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  const all = await db.endorsements.where('providerId').equals(providerId).toArray();
  const nextScore = [...all, endorsement].reduce((sum, item) => sum + item.weight, 0);

  const updatedProvider: Provider = {
    ...provider,
    score: Number(nextScore.toFixed(2)),
    endorsementCount: all.length + 1,
    updatedAt: timestamp,
    version: provider.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction(
    'rw',
    db.endorsements,
    db.providers,
    db.syncQueue,
    db.reputationEvents,
    async () => {
      await db.endorsements.add(endorsement);
      await db.providers.put(updatedProvider);
      await db.syncQueue.add(
        queueItem('endorsements', endorsement.id, 'create', endorsement, 0),
      );
      await db.syncQueue.add(
        queueItem('providers', updatedProvider.id, 'update', updatedProvider, provider.version),
      );
      await db.reputationEvents.add({
        id: uid(),
        profileId: endorser.id,
        type: 'endorsement_given',
        points: POINTS.endorsement_given,
        description: `Visto Bueno a ${provider.trade}`,
        createdAt: timestamp,
      });
    },
  );

  await notify(provider.profileId, {
    type: 'endorsement_received',
    title: 'Nuevo Visto Bueno recibido',
    body: `${endorser.name} validó tu trabajo de ${provider.trade}.`,
    link: `/directorio/${provider.id}`,
  });
  requestSync();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export interface CreateListingInput {
  type: ListingType;
  category: string;
  title: string;
  description: string;
  authorId: string;
  district: string;
  lat: number;
  lng: number;
  meta: ListingMeta;
  expiresAt?: string;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
}

export async function createListing(
  input: CreateListingInput,
): Promise<Listing> {
  const timestamp = nowIso();
  const listing: Listing = {
    id: uid(),
    type: input.type,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    authorId: input.authorId,
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    status: 'open',
    expiresAt: input.expiresAt ?? addDaysIso(input.type === 'service' ? 30 : 7),
    meta: input.meta,
    audio: input.audio,
    audioMime: input.audioMime,
    audioDuration: input.audioDuration,
    hidden: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.listings, db.syncQueue, async () => {
    await db.listings.add(listing);
    await db.syncQueue.add(queueItem('listings', listing.id, 'create', listing, 0));
  });
  requestSync();
  return listing;
}

export async function updateListing(
  id: string,
  patch: Partial<Omit<Listing, 'id' | 'createdAt'>>,
): Promise<Listing | undefined> {
  const listing = await db.listings.get(id);
  if (!listing) return undefined;
  const updated: Listing = {
    ...listing,
    ...patch,
    updatedAt: nowIso(),
    version: listing.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.listings, db.syncQueue, async () => {
    await db.listings.put(updated);
    await db.syncQueue.add(
      queueItem('listings', updated.id, 'update', updated, listing.version),
    );
  });
  requestSync();
  return updated;
}

export async function setListingStatus(
  id: string,
  status: ListingStatus,
): Promise<void> {
  await updateListing(id, { status });
}

export async function hideListing(id: string, actorId: string): Promise<void> {
  const listing = await db.listings.get(id);
  if (!listing) return;
  await updateListing(id, { status: 'hidden', hidden: 1 });
  await notify(listing.authorId, {
    type: 'moderation',
    title: 'Publicación oculta',
    body: `Tu publicación "${listing.title}" fue oculta por moderación.`,
    link: '/perfil/publicaciones',
  });
  await db.reports
    .where('targetId')
    .equals(id)
    .modify({ status: 'resolved', updatedAt: nowIso() });
  void actorId;
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export interface CreateRequestInput {
  listingId: string;
  requester: Profile;
  message: string;
  meta?: RequestMeta;
}

export async function createRequest(
  input: CreateRequestInput,
): Promise<{ ok: boolean; reason?: string; request?: RequestEntity }> {
  const listing = await db.listings.get(input.listingId);
  if (!listing) return { ok: false, reason: 'La publicación ya no existe.' };
  if (listing.authorId === input.requester.id) {
    return { ok: false, reason: 'No puedes solicitar tu propia publicación.' };
  }
  if (listing.status !== 'open') {
    return { ok: false, reason: 'Esta publicación ya no está disponible.' };
  }

  const openRequests = await db.requests
    .where('requesterId')
    .equals(input.requester.id)
    .filter((item) =>
      ['pending', 'accepted', 'in_progress'].includes(item.status),
    )
    .count();
  if (openRequests >= 3) {
    return {
      ok: false,
      reason:
        'Tienes 3 solicitudes abiertas. Completa una antes de crear otra (regla anti-free-riding).',
    };
  }

  if (listing.meta.highValue) {
    const points = await reputationPoints(input.requester.id);
    if (points < 5) {
      return {
        ok: false,
        reason:
          'Los préstamos de alto valor requieren al menos 5 puntos de reputación.',
      };
    }
  }

  const existing = await db.requests
    .where('listingId')
    .equals(listing.id)
    .filter(
      (item) =>
        item.requesterId === input.requester.id &&
        ['pending', 'accepted', 'in_progress'].includes(item.status),
    )
    .first();
  if (existing) {
    return { ok: false, reason: 'Ya tienes una solicitud activa para esta publicación.' };
  }

  const timestamp = nowIso();
  const request: RequestEntity = {
    id: uid(),
    listingId: listing.id,
    requesterId: input.requester.id,
    ownerId: listing.authorId,
    status: 'pending',
    message: input.message.trim(),
    meta: input.meta ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.requests, db.syncQueue, async () => {
    await db.requests.add(request);
    await db.syncQueue.add(queueItem('requests', request.id, 'create', request, 0));
  });

  await notify(listing.authorId, {
    type: 'request_received',
    title: 'Nueva solicitud recibida',
    body: `${input.requester.name} quiere "${listing.title}".`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true, request };
}

export async function respondRequest(
  requestId: string,
  actor: Profile,
  decision: 'accepted' | 'rejected',
): Promise<{ ok: boolean; reason?: string }> {
  const request = await db.requests.get(requestId);
  if (!request) return { ok: false, reason: 'Solicitud no encontrada.' };
  if (request.ownerId !== actor.id) {
    return { ok: false, reason: 'Solo el dueño de la publicación puede responder.' };
  }
  if (request.status !== 'pending') {
    return { ok: false, reason: 'Esta solicitud ya fue respondida.' };
  }

  const listing = await db.listings.get(request.listingId);
  const timestamp = nowIso();
  const updated: RequestEntity = {
    ...request,
    status: decision,
    updatedAt: timestamp,
    version: request.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.requests, db.syncQueue, db.listings, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
    if (decision === 'accepted' && listing) {
      const nextListing: Listing = {
        ...listing,
        status: 'reserved',
        updatedAt: timestamp,
        version: listing.version + 1,
        syncStatus: 'pending',
      };
      await db.listings.put(nextListing);
      await db.syncQueue.add(
        queueItem('listings', nextListing.id, 'update', nextListing, listing.version),
      );
    }
  });

  await notify(request.requesterId, {
    type: decision === 'accepted' ? 'request_accepted' : 'request_rejected',
    title:
      decision === 'accepted'
        ? '¡Solicitud aceptada!'
        : 'Solicitud no aceptada',
    body:
      decision === 'accepted'
        ? `${actor.name} aceptó tu solicitud${listing ? ` de "${listing.title}"` : ''}. Coordinen la entrega.`
        : `${actor.name} no pudo aceptar tu solicitud${listing ? ` de "${listing.title}"` : ''}.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true };
}

export async function completeRequest(
  requestId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const request = await db.requests.get(requestId);
  if (!request) return { ok: false, reason: 'Solicitud no encontrada.' };
  if (![request.ownerId, request.requesterId].includes(actor.id)) {
    return { ok: false, reason: 'No participas en esta solicitud.' };
  }
  if (!['accepted', 'in_progress'].includes(request.status)) {
    return { ok: false, reason: 'La solicitud todavía no está en curso.' };
  }

  const listing = await db.listings.get(request.listingId);
  const timestamp = nowIso();
  const updated: RequestEntity = {
    ...request,
    status: 'completed',
    updatedAt: timestamp,
    version: request.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.requests, db.syncQueue, db.listings, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
    if (listing) {
      const nextListing: Listing = {
        ...listing,
        status: 'completed',
        updatedAt: timestamp,
        version: listing.version + 1,
        syncStatus: 'pending',
      };
      await db.listings.put(nextListing);
      await db.syncQueue.add(
        queueItem('listings', nextListing.id, 'update', nextListing, listing.version),
      );
    }
  });

  if (listing) {
    const label = listing.title;
    if (listing.type === 'donation') {
      await awardPoints(request.ownerId, 'donation_delivered', `Donación entregada: ${label}`);
    } else if (listing.type === 'loan') {
      await awardPoints(request.ownerId, 'loan_returned_owner', `Préstamo devuelto: ${label}`);
      await awardPoints(request.requesterId, 'loan_returned_requester', `Devolución confirmada: ${label}`);
    } else if (listing.type === 'time_bank') {
      await awardPoints(request.ownerId, 'time_bank_hour', `Hora de banco de tiempo: ${label}`);
      await awardPoints(request.requesterId, 'time_bank_hour', `Hora de banco de tiempo: ${label}`);
    } else {
      await awardPoints(request.ownerId, 'manual', `Servicio completado: ${label}`, 1);
      await awardPoints(request.requesterId, 'manual', `Servicio completado: ${label}`, 1);
    }
  }

  await notify(request.requesterId, {
    type: 'request_completed',
    title: 'Solicitud completada',
    body: `Se completó "${listing?.title ?? 'la solicitud'}". ¡Gracias por fortalecer el barrio!`,
    link: '/perfil/solicitudes',
  });
  await notify(request.ownerId, {
    type: 'request_completed',
    title: 'Solicitud completada',
    body: `Se completó "${listing?.title ?? 'la solicitud'}". Se sumaron puntos de reputación.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true };
}

export async function cancelRequest(
  requestId: string,
  actor: Profile,
): Promise<void> {
  const request = await db.requests.get(requestId);
  if (!request) return;
  if (![request.ownerId, request.requesterId].includes(actor.id)) return;
  if (['completed', 'cancelled'].includes(request.status)) return;

  const updated: RequestEntity = {
    ...request,
    status: 'cancelled',
    updatedAt: nowIso(),
    version: request.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.requests, db.syncQueue, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
  });

  const other = request.requesterId === actor.id ? request.ownerId : request.requesterId;
  await notify(other, {
    type: 'system',
    title: 'Solicitud cancelada',
    body: `${actor.name} canceló una solicitud.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export interface CreateAlertInput {
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  author: Profile;
  district: string;
  lat: number;
  lng: number;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const timestamp = nowIso();
  const alert: Alert = {
    id: uid(),
    severity: input.severity,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    authorId: input.author.id,
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    status: 'pending',
    audio: input.audio,
    audioMime: input.audioMime,
    audioDuration: input.audioDuration,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.add(alert);
    await db.syncQueue.add(queueItem('alerts', alert.id, 'create', alert, 0));
  });

  const responders = await db.profiles
    .filter((profile) => profile.roles.includes('brigadista') || profile.roles.includes('coordinador'))
    .toArray();
  await notifyMany(
    responders.map((profile) => profile.id),
    {
      type: 'alert_created',
      title: `Alerta ${input.severity === 'critical' ? 'crítica' : input.severity === 'high' ? 'alta' : 'media'}`,
      body: `${input.author.name}: ${alert.title}.`,
      link: `/alertas/${alert.id}`,
    },
  );
  requestSync();
  return alert;
}

export async function acceptAlert(
  alertId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return { ok: false, reason: 'Alerta no encontrada.' };
  const brigade = await db.brigadeProfiles.where('profileId').equals(actor.id).first();
  if (!brigade) {
    return { ok: false, reason: 'Necesitas una ficha de brigadista para atender alertas.' };
  }
  if (alert.status !== 'pending') {
    return { ok: false, reason: 'Esta alerta ya tiene un responsable.' };
  }

  const timestamp = nowIso();
  const updated: Alert = {
    ...alert,
    status: 'assigned',
    brigadeProfileId: brigade.id,
    assignedAt: timestamp,
    updatedAt: timestamp,
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });

  await notify(alert.authorId, {
    type: 'alert_assigned',
    title: 'Tu alerta tiene respuesta',
    body: `${actor.name} va en camino a "${alert.title}".`,
    link: `/alertas/${alert.id}`,
  });
  requestSync();
  return { ok: true };
}

export async function resolveAlert(
  alertId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return { ok: false, reason: 'Alerta no encontrada.' };
  const brigade = await db.brigadeProfiles.where('profileId').equals(actor.id).first();
  const canResolve =
    alert.authorId === actor.id ||
    actor.roles.includes('coordinador') ||
    (brigade && alert.brigadeProfileId === brigade.id);
  if (!canResolve) {
    return { ok: false, reason: 'Solo el brigadista asignado, el autor o un coordinador pueden cerrar la alerta.' };
  }
  if (alert.status === 'resolved') return { ok: true };

  const timestamp = nowIso();
  const updated: Alert = {
    ...alert,
    status: 'resolved',
    resolvedAt: timestamp,
    updatedAt: timestamp,
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });

  if (alert.brigadeProfileId) {
    const assigned = await db.brigadeProfiles.get(alert.brigadeProfileId);
    if (assigned) {
      await awardPoints(assigned.profileId, 'alert_resolved', `Alerta resuelta: ${alert.title}`);
    }
  }
  await notify(alert.authorId, {
    type: 'alert_resolved',
    title: 'Alerta resuelta',
    body: `"${alert.title}" fue marcada como resuelta. Gracias por avisar.`,
    link: `/alertas/${alert.id}`,
  });
  requestSync();
  return { ok: true };
}

export async function cancelAlert(alertId: string, actor: Profile): Promise<void> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return;
  if (alert.authorId !== actor.id && !actor.roles.includes('coordinador')) return;
  const updated: Alert = {
    ...alert,
    status: 'cancelled',
    updatedAt: nowIso(),
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Brigade                                                             */
/* ------------------------------------------------------------------ */

export interface BrigadeInput {
  skills: string[];
  resources: string[];
  certifications: string;
  district: string;
  lat: number;
  lng: number;
}

export async function upsertMyBrigadeProfile(
  profile: Profile,
  input: BrigadeInput,
): Promise<BrigadeProfile> {
  const existing = await db.brigadeProfiles.where('profileId').equals(profile.id).first();
  const timestamp = nowIso();

  if (existing) {
    const updated: BrigadeProfile = {
      ...existing,
      ...input,
      updatedAt: timestamp,
      version: existing.version + 1,
      syncStatus: 'pending',
    };
    await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
      await db.brigadeProfiles.put(updated);
      await db.syncQueue.add(
        queueItem('brigadeProfiles', updated.id, 'update', updated, existing.version),
      );
    });
    requestSync();
    return updated;
  }

  const brigade: BrigadeProfile = {
    id: uid(),
    profileId: profile.id,
    ...input,
    availability: 'available',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
    await db.brigadeProfiles.add(brigade);
    await db.syncQueue.add(
      queueItem('brigadeProfiles', brigade.id, 'create', brigade, 0),
    );
  });
  requestSync();
  return brigade;
}

export async function setBrigadeAvailability(
  brigadeId: string,
  availability: BrigadeProfile['availability'],
): Promise<void> {
  const brigade = await db.brigadeProfiles.get(brigadeId);
  if (!brigade) return;
  const updated: BrigadeProfile = {
    ...brigade,
    availability,
    updatedAt: nowIso(),
    version: brigade.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
    await db.brigadeProfiles.put(updated);
    await db.syncQueue.add(
      queueItem('brigadeProfiles', updated.id, 'update', updated, brigade.version),
    );
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Reports & moderation                                                */
/* ------------------------------------------------------------------ */

export async function createReport(
  targetType: Report['targetType'],
  targetId: string,
  reporter: Profile,
  reason: string,
): Promise<void> {
  const timestamp = nowIso();
  const report: Report = {
    id: uid(),
    targetType,
    targetId,
    reporterId: reporter.id,
    reason: reason.trim(),
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.reports, db.syncQueue, async () => {
    await db.reports.add(report);
    await db.syncQueue.add(queueItem('reports', report.id, 'create', report, 0));
  });

  const coordinators = await db.profiles
    .filter((profile) => profile.roles.includes('coordinador'))
    .toArray();
  await notifyMany(
    coordinators.map((profile) => profile.id),
    {
      type: 'moderation',
      title: 'Nuevo reporte de moderación',
      body: `${reporter.name} reportó ${targetType === 'listing' ? 'una publicación' : targetType === 'provider' ? 'un prestador' : targetType === 'alert' ? 'una alerta' : 'un perfil'}.`,
      link: '/coordinador',
    },
  );
  requestSync();
}

export async function resolveReport(
  reportId: string,
  status: 'open' | 'resolved',
): Promise<void> {
  const report = await db.reports.get(reportId);
  if (!report) return;
  const updated: Report = {
    ...report,
    status,
    updatedAt: nowIso(),
    version: report.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.reports, db.syncQueue, async () => {
    await db.reports.put(updated);
    await db.syncQueue.add(
      queueItem('reports', updated.id, 'update', updated, report.version),
    );
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Crisis, broadcasts & settings                                       */
/* ------------------------------------------------------------------ */

export async function setCrisisMode(
  enabled: boolean,
  actor: Profile,
): Promise<void> {
  const timestamp = nowIso();
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'emergencyMode', value: enabled ? '1' : '0' });
    await db.settings.put({
      key: 'crisisStartedAt',
      value: enabled ? timestamp : '',
    });
  });

  const profiles = await db.profiles.toArray();
  await notifyMany(
    profiles.map((profile) => profile.id),
    enabled
      ? {
          type: 'broadcast',
          title: '🚨 Modo emergencia activado',
          body: `${actor.name} activó la respuesta de crisis del barrio. Revisa las alertas y tu rol.`,
          link: '/emergencia',
        }
      : {
          type: 'broadcast',
          title: 'Modo emergencia desactivado',
          body: 'La respuesta de crisis terminó. Gracias por cuidar el barrio.',
          link: '/',
        },
  );
}

export async function sendBroadcast(
  actor: Profile,
  title: string,
  body: string,
): Promise<void> {
  const profiles = await db.profiles.toArray();
  await notifyMany(
    profiles.map((profile) => profile.id),
    {
      type: 'broadcast',
      title: title.trim(),
      body: body.trim(),
      link: '/notificaciones',
    },
  );
  void actor;
}

/* ------------------------------------------------------------------ */
/* Backup, import & reset                                              */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  app: 'vecino360';
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackup(): Promise<BackupPayload> {
  const [
    profiles,
    providers,
    endorsements,
    listings,
    requests,
    alerts,
    brigadeProfiles,
    notifications,
    reputationEvents,
    reports,
    syncQueue,
    settings,
  ] = await Promise.all([
    db.profiles.toArray(),
    db.providers.toArray(),
    db.endorsements.toArray(),
    db.listings.toArray(),
    db.requests.toArray(),
    db.alerts.toArray(),
    db.brigadeProfiles.toArray(),
    db.notifications.toArray(),
    db.reputationEvents.toArray(),
    db.reports.toArray(),
    db.syncQueue.toArray(),
    db.settings.toArray(),
  ]);

  return {
    app: 'vecino360',
    exportedAt: nowIso(),
    tables: {
      profiles,
      providers,
      endorsements,
      listings,
      requests,
      alerts,
      brigadeProfiles,
      notifications,
      reputationEvents,
      reports,
      syncQueue,
      settings,
    },
  };
}

export async function downloadBackup(): Promise<void> {
  const payload = await buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `vecino360-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json) as BackupPayload;
  if (parsed.app !== 'vecino360' || !parsed.tables) {
    throw new Error('El archivo no es un respaldo válido de VECINO360.');
  }

  const tables = parsed.tables as Record<string, Array<Record<string, unknown>>>;
  const map: Array<[keyof typeof db, unknown[]]> = [
    ['profiles', tables.profiles ?? []],
    ['providers', tables.providers ?? []],
    ['endorsements', tables.endorsements ?? []],
    ['listings', tables.listings ?? []],
    ['requests', tables.requests ?? []],
    ['alerts', tables.alerts ?? []],
    ['brigadeProfiles', tables.brigadeProfiles ?? []],
    ['notifications', tables.notifications ?? []],
    ['reputationEvents', tables.reputationEvents ?? []],
    ['reports', tables.reports ?? []],
    ['syncQueue', tables.syncQueue ?? []],
    ['settings', tables.settings ?? []],
  ];

  await db.transaction(
    'rw',
    [
      db.profiles,
      db.providers,
      db.endorsements,
      db.listings,
      db.requests,
      db.alerts,
      db.brigadeProfiles,
      db.notifications,
      db.reputationEvents,
      db.reports,
      db.syncQueue,
      db.settings,
    ],
    async () => {
      for (const [tableName, rows] of map) {
        const table = db[tableName] as unknown as {
          clear: () => Promise<void>;
          bulkPut: (rows: unknown[]) => Promise<unknown>;
        };
        await table.clear();
        if (rows.length > 0) await table.bulkPut(rows);
      }
    },
  );
}

export async function resetDemo(): Promise<void> {
  await db.delete();
  await db.open();
  await serverDb.delete();
  await serverDb.open();
  await seedDatabase(true);
}

/** Precachea tiles del área demo para usar el mapa sin conexión. */
export async function prepareOfflineDemo(): Promise<number> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      await navigator.storage.persist();
    } catch {
      /* ignore */
    }
  }

  const center = { lat: -12.083, lng: -77.051 };
  const tiles: string[] = [];
  const toTile = (lat: number, lng: number, zoom: number) => {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    return { x, y, z: zoom };
  };

  for (const zoom of [14, 15, 16]) {
    const base = toTile(center.lat, center.lng, zoom);
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        tiles.push(
          `https://tile.openstreetmap.org/${zoom}/${base.x + dx}/${base.y + dy}.png`,
        );
      }
    }
  }

  let cached = 0;
  await Promise.all(
    tiles.map(async (url) => {
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) cached += 1;
      } catch {
        /* offline: ignore */
      }
    }),
  );

  await setSetting('demoPrepared', cached > 0 ? '1' : '0');
  return cached;
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
}> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

export async function queueSummary(): Promise<QueueItem[]> {
  return db.syncQueue.orderBy('createdAt').toArray();
}

export async function clearConflicts(): Promise<void> {
  await db.syncQueue.where('status').equals('conflict').delete();
  const conflicts = await db.providers.where('syncStatus').equals('conflict').toArray();
  for (const provider of conflicts) {
    await db.providers.update(provider.id, { syncStatus: 'synced' });
  }
  const listingConflicts = await db.listings.where('syncStatus').equals('conflict').toArray();
  for (const listing of listingConflicts) {
    await db.listings.update(listing.id, { syncStatus: 'synced' });
  }
  const alertConflicts = await db.alerts.where('syncStatus').equals('conflict').toArray();
  for (const alert of alertConflicts) {
    await db.alerts.update(alert.id, { syncStatus: 'synced' });
  }
}

/** Simula un conflicto de versión: el servidor queda con una versión más nueva. */
export async function simulateConflict(): Promise<void> {
  const listing = await db.listings.orderBy('createdAt').reverse().first();
  if (!listing) return;
  const serverVersion = listing.version + 2;
  await serverDb.records.put({
    key: `listings:${listing.id}`,
    entity: 'listings',
    id: listing.id,
    version: serverVersion,
    updatedAt: nowIso(),
    data: {
      ...listing,
      title: `${listing.title} (editado por otro dispositivo)`,
      version: serverVersion,
      syncStatus: 'synced',
      updatedAt: nowIso(),
    },
  });

  await updateListing(listing.id, { description: `${listing.description}\n\nAjuste local para demo.` });
  await db.settings.put({ key: 'demoConflictAt', value: nowIso() });
}
