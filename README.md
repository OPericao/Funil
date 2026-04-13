# Hackaton_PISITO

Monorepo para una web movil (responsive) con:

- `frontend/`: React + TypeScript (Vite)
- `backend/`: Java Spring Boot + Supabase (Postgres) sin Docker
- `docs/`: contrato de API y notas
- `shared/`: tipos compartidos opcionales

MVP actual orientado a guardar y visualizar:

- texto
- links
- media local (imagenes y video por path/storage)

## Estructura

```text
Hackaton_PISITO/
|- backend/
|- frontend/
|- docs/
|- shared/
|- .gitignore
|- .editorconfig
`- README.md
```

## Requisitos

- Node.js 20+ (`node -v`)
- npm 10+ (`npm -v`)
- Java 21+ (`java -version`)
- Maven 3.9+ (`mvn -v`)

## Comandos para arrancar

Para ejecutar front + back en local:

Terminal 1 (backend):

```powershell
cd C:\Users\adrir\OneDrive\Desktop\proyectosGit\Hackaton_PISITO\backend
mvn spring-boot:run
```

Terminal 2 (frontend):

```powershell
cd C:\Users\adrir\OneDrive\Desktop\proyectosGit\Hackaton_PISITO\frontend
npm install
npm run dev
```

Abrir:

- Front: `http://localhost:5173`
- Back: `http://localhost:8080`
- Health check: `http://localhost:8080/api/health`

## Comunicacion Front-Back (plantilla base)

Modelo backend:

- `Entry` (titulo + lista de recursos)
- `Resource` (clase padre)
- Herencia de recursos: `TextResource`, `LinkResource`, `MediaResource`

Backend expone:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/me/username`
- `PUT /api/auth/me/password`
- `GET /api/entries`
- `GET /api/entries/{entryId}`
- `POST /api/entries` (titulo y opcional `resources[]`)
- `POST /api/entries/{entryId}/resources/text`
- `POST /api/entries/{entryId}/resources/link`
- `POST /api/entries/{entryId}/resources/media`
- `DELETE /api/entries/{entryId}/resources/{resourceId}`
- `DELETE /api/entries/{entryId}`

Contrato detallado en [`docs/api.md`](docs/api.md).

Nota de auth:
- `POST /api/auth/register` y `POST /api/auth/login` son publicos.
- El resto de endpoints `/api/**` requiere `Authorization: Bearer <jwt>`.
- Las `entries/resources` se filtran por el usuario del token.

## Flujo de equipo recomendado (3 dias)

1. Acordar endpoints en [`docs/api.md`](docs/api.md).
2. Persona A trabaja en `backend/`.
3. Persona B trabaja en `frontend/`.
4. Front consume `/api/*` del backend (proxy de Vite ya configurado).

## Comandos utiles

Backend tests:

```bash
cd backend
mvn test
```

Frontend build:

```bash
cd frontend
npm run build
```

## Notas

- No se usa Docker para mantener setup rapido.
- Base de datos objetivo: Supabase.
- La aplicacion espera credenciales de Supabase en `backend/.env`.


## Configuracion de entorno (Supabase)

1. Crea `backend/.env` tomando como base `backend/.env.example`.
2. Rellena `DATABASE_URL` o `DB_URL`, `DB_USERNAME` y `DB_PASSWORD`.
3. Usa `SQL_INIT_MODE=never`.
4. Arranca backend y frontend como siempre.

PowerShell (ejemplo rapido):

```powershell
# desde backend/
$env:DATABASE_URL="jdbc:postgresql://aws-1-eu-north-1.pooler.supabase.com:5432/postgres?user=tu_usuario.tu_project_ref&password=tu_password&sslmode=require"
$env:DB_USERNAME="tu_usuario.tu_project_ref"
$env:DB_PASSWORD="<tu_password>"
$env:DB_DRIVER_CLASS="org.postgresql.Driver"
$env:SQL_INIT_MODE="never"
$env:JWT_SECRET="un-secreto-largo-de-32-bytes-o-mas"
cd backend
mvn spring-boot:run
```
