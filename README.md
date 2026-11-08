# VECINO360 🏘️⚡
> **Economía hiperlocal y resiliencia comunitaria · 100 % local · Offline-First · PWA para Android**

Proyecto desarrollado para el Hackathon. VECINO360 conecta a los vecinos para intercambiar oficios, prestar y donar bienes, compartir banco de tiempo y movilidad, y responder organizadamente ante situaciones de emergencia y crisis vecinal — **incluso sin conexión a internet**.

---

## 🌟 Características Principales

1. **Directorio Hiperlocal de Oficios & Visto Bueno Ponderado**
   - Búsqueda y filtrado de técnicos (gasfiteros, electricistas, cerrajeros, costureras).
   - Ordenamiento por distancia GPS real.
   - **Visto Bueno único ponderado por cercanía**:
     - ≤ 200 m (menos de 2 cuadras): **peso 1.00**
     - ≤ 500 m (menos de 5 cuadras): **peso 0.75**
     - ≤ 800 m (menos de 8 cuadras): **peso 0.50**
     - Más de 800 m: **peso 0.25**

2. **Muro Solidario (Publicación en 3 pasos con notas de voz)**
   - 6 tipos de intercambios: Préstamos con fecha de retorno, Donaciones, Favores, Banco de tiempo (horas), Movilidad solidaria (cupos/rutas) y Oficios.
   - Grabación de notas de audio mediante `MediaRecorder` persistidas en IndexedDB (`Blob`).

3. **Ciclo Completo de Solicitudes & Reputación**
   - Flujo: `Pendiente → Aceptada → En proceso → Completada`.
   - Sistema de puntos y niveles de confianza: *Nuevo (0-4)*, *Colaborador (5-14)*, *Vecino de confianza (15-29)* y *Guardián del barrio (30+)*.
   - Reglas anti-free-riding para préstamos de alto valor.

4. **Módulo de Emergencia & Protocolo de Crisis**
   - Activación y desactivación de modo crisis restringida al rol de **Coordinador**.
   - Cambio adaptativo de navegación y banner en vivo para todos los usuarios.
   - Alertas SOS con geolocalización, severidad (*Crítica*, *Alta*, *Media*) y nota de voz.
   - Directorio de brigadistas con habilidades, recursos y disponibilidad en tiempo real.
   - Panel de Coordinador con métricas, comunicados masivos, moderación de contenido y verificación de vecinos.

5. **Radar & Mapa Hiperlocal**
   - Mapa interactivo con Leaflet y radio vecinal de 800 metros.
   - Capas independientes: Oficios, Muro, Alertas y Brigada.
   - Precarga de mosaicos OpenStreetMap para funcionamiento 100% sin conexión.

6. **Plataforma Offline-First & Motor de Sincronización**
   - **IndexedDB (Dexie)** como fuente de verdad local.
   - Service Worker con Workbox para precache completo del App Shell y caché en runtime de tiles OSM.
   - Motor de sincronización en background (`SyncEngine`) con cola persistente, backoff exponencial, idempotencia y resolución de conflictos frente a servidor simulado (`Vecino360ServerDB`).
   - Panel demo integrado (`/demo`) para cambio rápido de rol, simulación de modo avión, inyección de conflictos, precarga offline y descarga de respaldos JSON.

---

## 🛠️ Tecnologías

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide React
- **Estado Global:** Zustand
- **Persistencia Local:** Dexie.js (IndexedDB) + dexie-react-hooks
- **Offline & PWA:** Vite PWA (`vite-plugin-pwa`), Workbox (`generateSW`)
- **Mapas:** Leaflet, React-Leaflet
- **Testing:** Vitest
- **Bundler:** Vite 6

---

## 🚀 Inicio Rápido

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Modo desarrollo
```bash
npm run dev
```
Abre tu navegador en `http://localhost:5173`.

### 3. Ejecutar pruebas unitarias
```bash
npm test
```
Ejecuta la suite de 30 pruebas unitarias con Vitest (geolocalización, reputación, permisos, transiciones de estado, backoff de cola y utilidades).

### 4. Compilación para producción
```bash
npm run build
```
Genera los bundles optimizados, el Service Worker (`sw.js`) y los manifiestos en la carpeta `dist/`.

---

## 📱 Demostración en Android (PWA nativa local)

### Método recomendado: `adb reverse`
Conecta el teléfono Android por cable USB con depuración USB activa:

```bash
# 1. Verificar conexión
adb devices

# 2. Compilar y servir en modo preview
npm run build
npm run preview

# 3. Enrutar el puerto local al dispositivo
adb reverse tcp:4173 tcp:4173
```

En el navegador Google Chrome de tu teléfono Android:
1. Navega a `http://localhost:4173`.
2. Presiona el botón **Instalar como aplicación** o el menú de Chrome (`⋮`) → **Agregar a la pantalla principal**.
3. Abre la app desde el ícono de la pantalla de inicio (se ejecutará en modo *standalone* sin barras del navegador).
4. Ve a **Configuración** (`/configuracion`) o **Panel Demo** (`/demo`) y presiona **Preparar demo offline** para almacenar en caché los mapas.
5. Activa el **Modo Avión** en tu teléfono: ¡la app continuará funcionando al 100 %! Puedes crear alertas, publicaciones o solicitudes que quedarán en cola y se sincronizarán al reconectar.

---

## 👥 Pantalla de Login y Usuarios de Prueba por Rol (`/login`)

La aplicación incluye una pantalla de **Login con acceso rápido en 1 clic** para evaluar y demostrar el comportamiento de la plataforma bajo cada rol:

| Rol | Usuario de Prueba | Distrito | Teléfono | Capacidades y Permisos |
|---|---|---|---|---|
| 🏠 **Vecino** | **David Quispe** (`p-david`) | Jesús María | `977 221 334` | Solicita préstamos, dona alimentos, ofrece favores, banco de tiempo, movilidad y emite Visto Bueno con peso por distancia. |
| 🔧 **Prestador** | **Manuel Quispe** (`p-manuel`) | Jesús María | `987 654 321` | Gasfitero. Ofrece oficios en el directorio, recibe solicitudes de clientes, gestiona horarios y acumula Visto Bueno. |
| 🚑 **Brigadista** | **Dr. Andrés Campos** (`p-andres`) | Jesús María | `911 101 112` | Médico / Primeros Auxilios. Responde alertas SOS en tiempo real, indica "estoy en camino" y gestiona disponibilidad y recursos. |
| ⭐ **Coordinadora** | **María Elena Rojas** (`p-maria`) | Jesús María | `998 112 233` | Liderazgo comunal. Activa y desactiva el **modo crisis**, emite comunicados masivos al barrio, modera contenido y otorga verificación de vecinos. |

> También puedes ingresar con cualquier otro vecino registrado mediante el buscador por nombre o teléfono, o crear perfiles adicionales desde `/registro`. Desde `/perfil` dispones del botón **Cerrar sesión** o **Cambiar de cuenta**.

---

## 📂 Estructura del Código

```
vecino360/
├── public/                 # Favicon, íconos PWA 192/512 y manifest
├── src/
│   ├── app/                # Layout principal, router, bootstrap de la app
│   ├── components/         # Componentes UI accesibles (botones, inputs, cards, audio, mapas)
│   ├── db/                 # Esquemas Dexie, repositorios CRUD y seed demo inicial
│   ├── features/publish/   # Asistente de publicación en 3 pasos con audio y mapa
│   ├── hooks/              # Custom hooks (perfil, estado de emergencia, online, audio)
│   ├── lib/                # Cálculo de distancias haversine, pesos, reputación, permisos y fechas
│   ├── pages/              # 24 páginas y vistas (Home, Directorio, Muro, Emergencia, Brigada, Mapa, Coordinador, etc.)
│   ├── store/              # Estado global con Zustand
│   ├── sync/               # Motor de sincronización, cola offline y servidor simulado
│   └── styles/             # Tailwind CSS y tokens de diseño
└── tests/                  # Pruebas unitarias con Vitest
```

---

## 📋 Definition of Done & Verificación

- [x] `npm run build` exitoso sin errores de tipos TypeScript.
- [x] PWA instalable con Service Worker y App Shell offline.
- [x] Persistencia en IndexedDB con prevención de desalojo (`navigator.storage.persist()`).
- [x] Directorio con ordenamiento por distancia y Visto Bueno ponderado.
- [x] Muro solidario con 6 tipos de intercambios.
- [x] Publicación en 3 clics con soporte de audio `MediaRecorder`.
- [x] Modo emergencia y protocolo de crisis administrado por el coordinador.
- [x] Directorio de brigadistas con habilidades y respuesta a emergencias.
- [x] Panel de coordinación con moderación, verificación de vecinos y comunicados.
- [x] Radar interactivo con radio de 800 m y capas.
- [x] Motor de sincronización con cola de reintentos, idempotencia y resolución de conflictos.
- [x] Suite de pruebas automatizadas con Vitest pasando al 100 %.
