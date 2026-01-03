# Docker Azure Deployment Guide - Samantha (Voyagers)

This guide documents the process for building, pushing, and deploying the Samantha family management application to Azure using Docker containers.

## Azure Resources

| Resource | Value |
|----------|-------|
| Resource Group | `rg-ai-usecase-prod` |
| Container Registry | `aiusecaseacr.azurecr.io` |
| Web App Name | `voyagers-app` |
| Application URL | https://voyagers-app.azurewebsites.net |
| App Service Plan | `asp-ai-usecase` (shared) |
| Database Server | `aiusecasemysql.mysql.database.azure.com` |
| Database Name | `samantha` |
| MSAL Client ID | `0dc1861e-0018-423f-bf39-95d3f6bd160e` |

## Prerequisites

- Docker Desktop installed and running
- Azure CLI installed and authenticated (`az login`)
- Access to Azure Container Registry (ACR)

## Quick Deployment

```bash
# Configuration
VERSION="v1-amd64"  # Increment for each deployment

# Build
docker build --platform linux/amd64 -t aiusecaseacr.azurecr.io/voyagers-app:${VERSION} .

# Login & Push
az acr login --name aiusecaseacr
docker push aiusecaseacr.azurecr.io/voyagers-app:${VERSION}

# Deploy
az webapp config set \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --linux-fx-version "DOCKER|aiusecaseacr.azurecr.io/voyagers-app:${VERSION}"

# Restart
az webapp restart --name voyagers-app --resource-group rg-ai-usecase-prod
```

## Environment Variables

### Required Variables

```bash
az webapp config appsettings set \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --settings \
    NODE_ENV="production" \
    PORT="3001" \
    DB_HOST="aiusecasemysql.mysql.database.azure.com" \
    DB_PORT="3306" \
    DB_NAME="samantha" \
    DB_USER="<db-user>" \
    DB_PASSWORD="<db-password>" \
    JWT_SECRET="<generate-with-openssl-rand-base64-64>" \
    MSAL_CLIENT_ID="0dc1861e-0018-423f-bf39-95d3f6bd160e" \
    MSAL_AUTHORITY="https://login.microsoftonline.com/consumers" \
    MSAL_REDIRECT_URI="https://voyagers-app.azurewebsites.net" \
    MSAL_POST_LOGOUT_REDIRECT_URI="https://voyagers-app.azurewebsites.net" \
    MSAL_SCOPES="User.Read" \
    MSAL_API_SCOPES="User.Read" \
    ADMIN_EMAILS="your-email@gmail.com"
```

### AI Services (Optional)

```bash
az webapp config appsettings set \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --settings \
    COMPASS_OPENAI_API_KEY="<api-key>" \
    COMPASS_OPENAI_ENDPOINT="https://api.core42.ai/openai/deployments/gpt-5/chat/completions" \
    COMPASS_OPENAI_DEPLOYMENT_NAME="gpt-5" \
    COMPASS_OPENAI_API_VERSION="2024-12-01-preview" \
    REALTIME_ENDPOINT="wss://api.core42.ai/v1/realtime" \
    REALTIME_API_KEY="<api-key>" \
    REALTIME_MODEL="gpt-4o-realtime-preview-2024-12-17" \
    DEFAULT_AI_PROVIDER="compass"
```

### Azure Blob Storage (File Attachments)

```bash
az webapp config appsettings set \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --settings \
    AZURE_STORAGE_ACCOUNT_NAME="aiusecasestorage" \
    AZURE_STORAGE_ACCOUNT_KEY="<storage-key>" \
    AZURE_STORAGE_CONTAINER_NAME="samantha-attachments"
```

Storage containers:
- Production: `samantha-attachments` (in `aiusecasestorage`)
- Development: `samantha-attachments-dev` (in `aiusecasestorage`)

### Feature Flags

```bash
az webapp config appsettings set \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --settings \
    FEATURE_TWILIO_ENABLED="false" \
    FEATURE_WHATSAPP_ENABLED="false"
```

Set to `"true"` to enable Twilio/WhatsApp integration (requires Twilio credentials).

## Authentication Model

Samantha uses a **gated access** model:

| User Type | Role | Status | Access |
|-----------|------|--------|--------|
| Listed in `ADMIN_EMAILS` | `admin` | `active` | Full access |
| New sign-ins | `viewer` | `pending` | Blocked until approved |
| Admin-approved users | `viewer` | `active` | View access |

- Anyone with a Microsoft account can sign in
- New users are **pending** and see "waiting for approval" message
- Admin approves users via the app or database to grant access

## Useful Commands

### Check Status
```bash
az webapp show --name voyagers-app --resource-group rg-ai-usecase-prod \
  --query "[state, hostNames[0]]" -o tsv
```

### View Logs
```bash
az webapp log tail --name voyagers-app --resource-group rg-ai-usecase-prod
```

### List Environment Variables
```bash
az webapp config appsettings list \
  --name voyagers-app \
  --resource-group rg-ai-usecase-prod \
  --output table
```

### Health Check
```bash
curl -s https://voyagers-app.azurewebsites.net/health
curl -s https://voyagers-app.azurewebsites.net/api/config
```

## Complete Deployment Script

```bash
#!/bin/bash

# Configuration
REGISTRY="aiusecaseacr.azurecr.io"
APP_NAME="voyagers-app"
VERSION="v2-amd64"  # Increment for each deployment
RESOURCE_GROUP="rg-ai-usecase-prod"

echo "=== Samantha (Voyagers) Deployment ==="

# Step 1: Build Docker image
echo "Building Docker image..."
docker build --platform linux/amd64 -t ${REGISTRY}/${APP_NAME}:${VERSION} .

# Step 2: Login to ACR
echo "Logging into Azure Container Registry..."
az acr login --name aiusecaseacr

# Step 3: Push image
echo "Pushing image to ACR..."
docker push ${REGISTRY}/${APP_NAME}:${VERSION}

# Step 4: Update Web App
echo "Updating Azure Web App configuration..."
az webapp config set \
  --name ${APP_NAME} \
  --resource-group ${RESOURCE_GROUP} \
  --linux-fx-version "DOCKER|${REGISTRY}/${APP_NAME}:${VERSION}"

# Step 5: Restart Web App
echo "Restarting Azure Web App..."
az webapp restart --name ${APP_NAME} --resource-group ${RESOURCE_GROUP}

# Step 6: Verify deployment
echo "Verifying deployment..."
sleep 30
az webapp show --name ${APP_NAME} --resource-group ${RESOURCE_GROUP} \
  --query "[state, hostNames[0]]" -o tsv

echo ""
echo "Deployment complete!"
echo "Application URL: https://${APP_NAME}.azurewebsites.net"
```

## Troubleshooting

### Container Not Starting
```bash
# Check logs
az webapp log tail --name voyagers-app --resource-group rg-ai-usecase-prod

# Enable container logging
az webapp log config --name voyagers-app --resource-group rg-ai-usecase-prod \
  --docker-container-logging filesystem
```

### Authentication Issues
- Verify `MSAL_CLIENT_ID` matches the Azure AD App Registration
- Ensure redirect URI is added to the Azure AD app's SPA redirect URIs
- Check `ADMIN_EMAILS` is set correctly for admin access

### Database Connection Issues
- Verify MySQL Flexible Server firewall allows Azure services
- Check `DB_HOST`, `DB_USER`, `DB_PASSWORD` are correct
- Ensure `samantha` database exists on the server

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v5-amd64 | 2026-01-04 | UI refinements: ValueFlowDashboard redesign, contrast improvements, modal centering fix |
| v4-amd64 | 2026-01-03 | SQL migrations for attachments entity_type and phone verification |
| v3-amd64 | 2026-01-03 | File attachments, PDF/DOCX support, artifacts browser, dynamic document styling |
| v2-amd64 | 2026-01-03 | Add Initiatives/Tasks toggle, family-oriented AI prompts |
| v1-amd64 | 2026-01-02 | Initial deployment |

## Notes

- Always specify `--platform linux/amd64` for Azure compatibility
- The Dockerfile uses multi-stage build for optimized image size
- Health check endpoint: `/health` and `/api/health`
- Dynamic config endpoint: `/api/config`
