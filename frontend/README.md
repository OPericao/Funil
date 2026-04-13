# Frontend (React + TypeScript + Vite)

## Requisitos

- Node.js 20+

## Arranque

```bash
npm install
npm run dev
```

App en `http://localhost:5173`

## API en produccion

Si frontend y backend comparten el mismo dominio/origen y expones el backend bajo `/api`,
no necesitas `VITE_API_BASE_URL`.

Si van en dominios distintos, crea `frontend/.env` con:

```properties
VITE_API_BASE_URL=https://api.tu-dominio.com/api
```

## Flujo API usado

- `GET /api/entries`
- `POST /api/entries`
- `POST /api/entries/{entryId}/resources/text`
- `POST /api/entries/{entryId}/resources/link`
- `POST /api/entries/{entryId}/resources/media`

## Build

```bash
npm run build
npm run preview
```
