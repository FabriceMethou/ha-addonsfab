# Finance Tracker Home Assistant Add-on - Build Instructions

## Overview

This Home Assistant add-on combines the FastAPI backend and React frontend of myfinanceapp into a single Docker container suitable for Home Assistant.

## Architecture

The add-on uses a multi-stage Docker build:

1. **Stage 1 (frontend-builder)**: Builds the React frontend using Node.js
2. **Stage 2 (final image)**:
   - Based on Home Assistant base image
   - Installs Python dependencies for FastAPI backend
   - Copies built frontend assets
   - Sets up nginx to serve frontend and proxy API requests
   - Uses supervisor to manage both services

## File Structure

```
myfinanceapp/
├── Dockerfile                # Multi-stage build for backend + frontend
├── config.yaml              # Home Assistant add-on configuration
├── run.sh                   # Startup script (uses supervisor)
├── nginx.conf               # Nginx config (serves frontend, proxies /api)
├── supervisord.conf         # Supervisor config (manages backend + nginx)
├── app/                     # Backend code
│   ├── database.py          # Shared database module
│   ├── auth.py              # Shared auth module
│   ├── ... (other shared modules)
│   └── backend/             # FastAPI application
│       ├── main.py          # FastAPI entry point
│       ├── requirements.txt # Python dependencies
│       └── api/             # API routers
└── frontend/                # React application
    ├── src/                 # React source code
    ├── package.json         # Node dependencies
    └── vite.config.ts       # Vite build config
```

## Services

The add-on runs two services managed by supervisor:

1. **FastAPI Backend** (`uvicorn main:app`)
   - Listens on `127.0.0.1:8000`
   - Provides REST API at `/api/*`
   - Environment variables:
     - `PYTHONPATH=/app`
     - `DATABASE_PATH=/data/myfinanceapp/data/finance.db`
     - `JWT_SECRET_KEY` (from config or default)

2. **Nginx Frontend**
   - Listens on port `8501`
   - Serves React static files
   - Proxies `/api` requests to backend at `127.0.0.1:8000`

## Configuration

Add-on options (in `config.yaml`):

- `jwt_secret`: JWT secret key for authentication (default: "change-this-secret-key-in-production")

## Data Persistence

- Data is stored in `/data/myfinanceapp/data/`
- SQLite database: `/data/myfinanceapp/data/finance.db`
- Persistent across add-on restarts
- First-time initialization creates the directory structure

## Building the Add-on

### Local Build (for testing)

```bash
cd /path/to/ha-addonsfab/myfinanceapp
docker build -t myfinanceapp:test .
```

### Running Locally

```bash
docker run -p 8501:8501 \
  -e JWT_SECRET_KEY="test-secret-key" \
  -v $(pwd)/data:/data/myfinanceapp \
  myfinanceapp:test
```

Access at: http://localhost:8501

## Installing in Home Assistant

1. **Add the repository to Home Assistant**:
   - Go to Supervisor → Add-on Store → ⋮ (menu) → Repositories
   - Add: `https://github.com/YOUR_USERNAME/ha-addonsfab`

2. **Install the add-on**:
   - Find "Finance Tracker" in the add-on store
   - Click Install

3. **Configure**:
   - Set `jwt_secret` in the Configuration tab
   - Click Save

4. **Start the add-on**:
   - Click Start
   - Check logs for any errors
   - Access via the Web UI button or `http://homeassistant.local:8501`

## Troubleshooting

### Check logs

```bash
# In Home Assistant
Supervisor → Finance Tracker → Log

# Or via Docker
docker logs <container_id>
```

### Common issues

1. **Port already in use**: Change the port mapping in `config.yaml`
2. **Build fails on scikit-learn**: The Dockerfile includes all necessary build tools (gfortran, openblas)
3. **Backend can't connect to database**: Check that `/data/myfinanceapp/data` is writable

### Verify services are running

Inside the container:

```bash
# Check supervisor status
supervisorctl status

# Check if backend is responding
curl http://127.0.0.1:8000/health

# Check if nginx is serving
curl http://127.0.0.1:8501
```

## Architecture Differences from Development

| Development (docker-compose) | Home Assistant Add-on |
|------------------------------|----------------------|
| Backend: port 8000 | Backend: 127.0.0.1:8000 (internal) |
| Frontend: port 3000 | Frontend: port 8501 (exposed) |
| Two separate containers | Single container |
| docker-compose manages services | Supervisor manages services |
| VITE_API_URL environment variable | nginx proxies /api to backend |

## Next Steps

1. Test the build locally
2. Push to a GitHub repository
3. Add the repository to Home Assistant
4. Install and configure the add-on
5. Create your first user account via the login page

## API Documentation

Once running, the FastAPI interactive documentation is available at:
- http://[HOST]:8501/api/docs (Swagger UI)
- http://[HOST]:8501/api/redoc (ReDoc)

## Security Notes

- **Change the default JWT secret** in production!
- The add-on uses HTTPS when accessed through Home Assistant's ingress
- Database backups can be configured via the Settings page in the UI
