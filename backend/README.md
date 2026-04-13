# Backend (Spring Boot)

## Requisitos

- Java 21+
- Maven 3.9+

## Arranque

```bash
mvn spring-boot:run
```

## Arranque con Supabase

`application.yml` ya acepta variables de entorno y tambien carga `backend/.env` automaticamente.
Si quieres pegar las claves en un archivo, usa `backend/.env`.

Para Supabase, configura como minimo:

- `DATABASE_URL` o `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`

Recomendado para Supabase:

- `SQL_INIT_MODE=never`
- `DEFER_DATASOURCE_INITIALIZATION=false`
- `JPA_DDL_AUTO=update`
- `CORS_ALLOWED_ORIGINS=https://tu-frontend.com`
- `JWT_SECRET=<secreto_base64_o_texto_plano_de_32+_caracteres>`
- `OLLAMA_EMBEDDING_MODEL=nomic-embed-text`

Ejemplo para `backend/.env`:

```properties
DATABASE_URL=jdbc:postgresql://aws-1-eu-north-1.pooler.supabase.com:5432/postgres?user=postgres.<tu_project_ref>&password=<tu_password>&sslmode=require
DB_DRIVER_CLASS=org.postgresql.Driver
DB_USERNAME=tu_usuario.<tu_project_ref>
DB_PASSWORD=<tu_password>
SQL_INIT_MODE=never
DEFER_DATASOURCE_INITIALIZATION=false
JPA_DDL_AUTO=update
CORS_ALLOWED_ORIGINS=https://tu-frontend.com
JWT_SECRET=pon-aqui-un-secreto-largo-y-aleatorio
JWT_EXPIRATION_MS=86400000
```

Luego arranca normal:

```bash
mvn spring-boot:run
```

API en `http://localhost:8080`

Auth:
- `POST /api/auth/register` y `POST /api/auth/login` son publicos.
- El resto de `/api/**` requiere `Authorization: Bearer <jwt>`.
- Las `entries/resources` quedan aisladas por usuario autenticado.
- La busqueda semantica usa Ollama local via `POST /api/embed`. Si el modelo de embeddings no esta disponible, la app cae a busqueda textual.

Si no configuras credenciales de Spotify, el backend igual guarda un link de busqueda en Spotify cuando detecta "cancion/canción" en el contenido de una nota.

## Endpoints principales

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (requiere `Authorization: Bearer <token>`)
- `PUT /api/auth/me/username` (requiere token)
- `PUT /api/auth/me/password` (requiere token)
- `GET /api/entries`
- `GET /api/entries/search?q=texto`
- `GET /api/entries/{entryId}`
- `POST /api/entries` (acepta `title` y opcional `resources[]`)
- `PUT /api/entries/{entryId}`
- `POST /api/entries/{entryId}/resources/text`
- `POST /api/entries/{entryId}/resources/link`
- `POST /api/entries/{entryId}/resources/media`
- `DELETE /api/entries/{entryId}/resources/{resourceId}`
- `DELETE /api/entries/{entryId}`

## Tests

```bash
mvn test
```


