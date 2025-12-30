# Docker Azure Deployment Guide - Hekmah MVP

This guide documents the complete process for building, pushing, and deploying the Hekmah application to Azure using Docker containers.

## Prerequisites

- Docker Desktop installed and running
- Azure CLI installed and authenticated (`az login`)
- GitHub CLI installed and authenticated (`gh auth login`)
- Access to Azure Container Registry (ACR)
- Access to Azure Web App Service

## Deployment Steps

### Step 1: Prepare the Code Repository

Create a GitHub repository and push your code:

```bash
# Navigate to project directory
cd "/Users/maverickshaw/Projects/AI Repo at DoF/ai-use-case-repository"

# Initialize git if needed
git init

# Add all files
git add -A

# Commit changes with descriptive message
git commit -m "Complete RBAC implementation with simplified Admin/Consumer roles"

# Create private GitHub repository
gh repo create Hekmah-MVP --private --source=. --remote=origin \
  --description="Hekmah - AI Use Case Repository MVP for Department of Finance" --push
```

### Step 2: Update Application Version

Before building, update the application version in the user interface:

```bash
# Update the version number in src/App.tsx
# Find the line containing the version (e.g., "Hekmah v1.59")
# Update to the next version number (e.g., v1.60, v1.61, etc.)
# Search for: "Hekmah v" in src/App.tsx
```

### Step 3: Build Docker Image for AMD64 Architecture

Build the Docker image with proper naming convention and platform specification:

```bash
# Build for AMD64 architecture (required for Azure)
docker build --platform linux/amd64 \
  -t aiusecaseacr.azurecr.io/ai-usecase-app:v18-amd64 .
```

**Naming Convention:**
- Registry: `aiusecaseacr.azurecr.io`
- Repository: `ai-usecase-app`
- Tag: `v[VERSION]-amd64` (e.g., v18-amd64)

### Step 4: Login to Azure Container Registry

Authenticate with Azure Container Registry:

```bash
# Login to ACR
az acr login --name aiusecaseacr
```

Expected output: `Login Succeeded`

### Step 5: Push Docker Image to ACR

Push the built image to Azure Container Registry:

```bash
# Push the image
docker push aiusecaseacr.azurecr.io/ai-usecase-app:v18-amd64
```

The push will show progress for each layer and complete with a digest confirmation.

### Step 6: Update Azure Web App Container Configuration

Configure the Azure Web App to use the new Docker image using the Linux FX version parameter:

```bash
# Update container configuration (Linux FX version - required for Azure)
az webapp config set \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod \
  --linux-fx-version "DOCKER|aiusecaseacr.azurecr.io/ai-usecase-app:v18-amd64"
```

**Important:** Always use the `--linux-fx-version` parameter with `DOCKER|` prefix for container deployments on Azure App Service Linux.

### Step 7: Verify and Update Environment Variables

**Important Update:** The application now supports dynamic configuration via `/api/config` endpoint. Frontend configuration can be set at runtime without rebuilding the container.

#### Dynamic Configuration (Recommended)
Set these backend variables for runtime configuration:

Check that all required environment variables are configured:

```bash
# List all app settings
az webapp config appsettings list \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod \
  --output table
```

**Required Environment Variables:**

#### Database Configuration
- `DB_HOST` - Azure MySQL server hostname
- `DB_USER` - Database username  
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (ai_use_case_repository)
- `DB_PORT` - Database port (3306)

#### Authentication
- `JWT_SECRET` - JWT signing secret (use strong random value)
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses (optional, overrides Azure AD roles)

#### Microsoft Authentication (Dynamic Configuration)
These variables configure authentication at runtime without rebuilding:
- `MSAL_CLIENT_ID` - Azure AD app client ID
- `MSAL_AUTHORITY` - Azure AD authority URL (defaults to consumers)
- `MSAL_REDIRECT_URI` - Production redirect URI
- `MSAL_POST_LOGOUT_REDIRECT_URI` - Post-logout redirect (defaults to redirect URI)
- `MSAL_SCOPES` - Azure AD scopes (defaults to User.Read)
- `MSAL_API_SCOPES` - API scopes for backend calls (defaults to User.Read)

#### Azure OpenAI (Frontend) - REMOVED
Frontend AI configuration has been removed. All AI functionality is now handled by the backend.

#### Azure OpenAI (Backend - for Intelligent Chat)
- `AZURE_OPENAI_API_KEY` - Backend Azure OpenAI key
- `AZURE_OPENAI_ENDPOINT` - Backend endpoint
- `AZURE_OPENAI_DEPLOYMENT_NAME` - Backend deployment name
- `AZURE_OPENAI_API_VERSION` - Backend API version

#### Realtime Voice API Configuration (Flexible)
The application supports both Azure OpenAI Realtime and Core42 APIs for voice chat:

**Primary Configuration (Recommended):**
- `REALTIME_ENDPOINT` - Realtime WebSocket endpoint (e.g., wss://api.core42.ai/v1/realtime or Azure endpoint)
- `REALTIME_API_KEY` - API key for realtime service
- `REALTIME_MODEL` - Model to use (e.g., gpt-4o-realtime-preview-2024-12-17)

**Legacy Azure OpenAI Realtime (Fallback):**
- `AZURE_OPENAI_REALTIME_ENDPOINT` - Azure Realtime endpoint
- `AZURE_OPENAI_REALTIME_DEPLOYMENT` - Azure Realtime deployment
- `AZURE_OPENAI_REALTIME_API_VERSION` - Azure Realtime API version
- `AZURE_OPENAI_REALTIME_KEY` - Azure Realtime API key
- `COMPASS_API_KEY` - Legacy Core42 API key (fallback)


#### Application Settings
- `NODE_ENV` - Environment (production)
- `PORT` - Server port (3001)

#### Azure Container Registry (Auto-configured)
- `DOCKER_REGISTRY_SERVER_URL` - ACR URL (auto-set)
- `DOCKER_REGISTRY_SERVER_USERNAME` - ACR username (auto-set)
- `DOCKER_REGISTRY_SERVER_PASSWORD` - ACR password (auto-set)

#### Azure App Service Settings (Optional)
- `WEBSITE_HTTPLOGGING_RETENTION_DAYS` - Log retention days
- `WEBSITES_CONTAINER_START_TIME_LIMIT` - Container start timeout
- `WEBSITES_ENABLE_APP_SERVICE_STORAGE` - Enable app service storage

To add or update environment variables:

```bash
# Set MSAL variables for dynamic configuration
az webapp config appsettings set \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod \
  --settings \
    MSAL_CLIENT_ID="f4110c0e-cc1f-458f-b528-33aeafd30519" \
    MSAL_AUTHORITY="https://login.microsoftonline.com/consumers" \
    MSAL_REDIRECT_URI="https://ai-usecase-app.azurewebsites.net" \
    MSAL_POST_LOGOUT_REDIRECT_URI="https://ai-usecase-app.azurewebsites.net" \
    MSAL_SCOPES="User.Read" \
    MSAL_API_SCOPES="User.Read"

# Set admin emails for override access (optional)
# Use this for personal Azure tenants or emergency admin access
az webapp config appsettings set \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod \
  --settings ADMIN_EMAILS="admin@company.com,backup@admin.com"
```

### Step 8: Restart Azure Web App

Apply the changes by restarting the container:

```bash
# Restart the web app
az webapp restart \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod
```

### Step 9: Verify Deployment

Check the deployment status:

```bash
# Check web app status and URL
az webapp show \
  --name ai-usecase-app \
  --resource-group rg-ai-usecase-prod \
  --query "[state, hostNames[0]]" -o tsv
```

Expected output:
```
Running
ai-usecase-app.azurewebsites.net
```

## Complete Deployment Script

For convenience, here's a complete deployment script:

```bash
#!/bin/bash

# Configuration
REGISTRY="aiusecaseacr.azurecr.io"
APP_NAME="ai-usecase-app"
VERSION="v68-amd64"  # IMPORTANT: Docker version number should match app version (e.g., v1.68 = v68-amd64)
RESOURCE_GROUP="rg-ai-usecase-prod"
WEB_APP="ai-usecase-app"

# Step 0: Update application version in UI
echo "Remember to update version in src/App.tsx before running this script!"
echo "Search for 'Hekmah v' and update the version number (e.g., v1.65 -> v1.66)"
echo "IMPORTANT: Docker VERSION above should match app version (v1.66 = v66-amd64)"

# Step 1: Build Docker image
echo "Building Docker image..."
docker build --platform linux/amd64 -t ${REGISTRY}/${APP_NAME}:${VERSION} .

# Step 2: Login to ACR
echo "Logging into Azure Container Registry..."
az acr login --name aiusecaseacr

# Step 3: Push image
echo "Pushing image to ACR..."
docker push ${REGISTRY}/${APP_NAME}:${VERSION}

# Step 4: Update Web App (using Linux FX version - required for Azure)
echo "Updating Azure Web App configuration..."
az webapp config set \
  --name ${WEB_APP} \
  --resource-group ${RESOURCE_GROUP} \
  --linux-fx-version "DOCKER|${REGISTRY}/${APP_NAME}:${VERSION}"

# Step 5: Check environment variables
echo "Checking environment variables..."
az webapp config appsettings list \
  --name ${WEB_APP} \
  --resource-group ${RESOURCE_GROUP} \
  --output table | head -20

# Step 6: Restart Web App
echo "Restarting Azure Web App..."
az webapp restart --name ${WEB_APP} --resource-group ${RESOURCE_GROUP}

# Step 7: Verify deployment
echo "Verifying deployment..."
az webapp show --name ${WEB_APP} --resource-group ${RESOURCE_GROUP} \
  --query "[state, hostNames[0]]" -o tsv

# Step 8: Check health endpoint
echo "Checking health endpoint..."
curl -s https://${WEB_APP}.azurewebsites.net/api/health | python3 -m json.tool

# Step 9: Check dynamic config endpoint
echo "Checking dynamic configuration endpoint..."
curl -s https://${WEB_APP}.azurewebsites.net/api/config | python3 -m json.tool

echo "Deployment complete!"
echo "Application URL: https://${WEB_APP}.azurewebsites.net"
```

## Important Azure Resources

- **Resource Group:** `rg-ai-usecase-prod`
- **Container Registry:** `aiusecaseacr`
- **Web App Name:** `ai-usecase-app`
- **Application URL:** https://ai-usecase-app.azurewebsites.net

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v13-amd64 | Previous | Previous production version |
| v14-amd64 | 2025-08-08 | RBAC implementation with Admin/Consumer roles |
| v15-amd64 | 2025-08-11 | Backend intelligent chat service with executive brief function |
| v16-amd64 | 2025-08-11 | Voice chat noise handling fixes |
| v17-amd64 | 2025-08-11 | Voice chat auto-detection and push-to-talk modes |
| v21-amd64 | 2025-08-15 | Database connection fixes and keep-alive mechanism |
| v23-amd64 | 2025-08-15 | Microsoft SSO authentication fixes (ID token vs access token) |
| v24-amd64 | 2025-08-15 | Enhanced Import/Export UI with multi-entity support and duplicate handling |
| v35-amd64 | 2025-08-18 | ADMIN_EMAILS environment variable for admin access override |
| v36-amd64 | 2025-08-18 | Database seed data for departments and categories, improved empty state UI |
| v37-amd64 | 2025-08-18 | Removed search from Strategic Goals, enhanced Strategic Pillars visual design |
| v59-amd64 | 2025-11-20 | Remove JWKS startup check for dynamic fetching |
| v60-amd64 | 2025-11-20 | Flexible Realtime API configuration (Core42/Azure), tag-based filtering, metadata injection |
| v61-amd64 | 2025-12-03 | Skills modal rebranding (Hekmah AI Skills), golden theme, attach skill feature, skill activation control |
| v65-amd64 | 2025-12-03 | OAIAT Weekly skill, Dockerfile Playwright/Chromium updates, version sync documentation |
| v66-amd64 | 2025-12-04 | ChatAssistant UI improvements, html2pptx service updates |
| v67-amd64 | 2025-12-04 | Fix Playwright Chromium path for Alpine Linux compatibility |
| v68-amd64 | 2025-12-04 | Create Playwright browser cache structure with symlink to system Chromium |
| v80-amd64 | 2025-12-25 | Time-based limits (30min) with user stop button, dark mode fixes for SkillsBrowser |
| v82-amd64 | 2025-12-26 | Full responsive design for mobile, collapsible filters, dark mode support |

## Troubleshooting

### Docker Build Takes Too Long
- Use background build: `docker build --platform linux/amd64 -t image:tag . &`
- Check Docker Desktop resources allocation

### ACR Login Issues
- Ensure Azure CLI is authenticated: `az login`
- Check ACR admin credentials are enabled

### Web App Not Updating
- Verify the image was pushed successfully
- Check Web App logs: `az webapp log tail --name ai-usecase-app --resource-group rg-ai-usecase-prod`
- Ensure container settings are correct in Azure Portal

### Intelligent Chat or Voice Chat Not Working
- Check that all Azure OpenAI environment variables are set (both frontend and backend)
- Verify `AZURE_OPENAI_*` variables for backend services
- Ensure `AZURE_OPENAI_REALTIME_*` variables are configured for voice chat
- Restart the app after adding environment variables

### Admin Access Issues
- If manual database role changes are being overwritten, use `ADMIN_EMAILS` environment variable
- `ADMIN_EMAILS` has highest precedence and overrides Azure AD App Roles
- Format: `ADMIN_EMAILS="user1@email.com,user2@email.com,user3@email.com"`
- Restart the app after setting `ADMIN_EMAILS`
- See [ADMIN_ACCESS_GUIDE.md](../ADMIN_ACCESS_GUIDE.md) for detailed configuration

### Database Initialization Issues
- Database now includes automatic seed data for departments and categories
- Seed data is only inserted if tables are empty
- Check application logs for seeding status messages

## Notes

- Always specify `--platform linux/amd64` for Azure compatibility
- Increment version numbers for each deployment
- Keep environment variables unchanged unless specifically required
- The Dockerfile uses multi-stage build for optimized image size
- Health check endpoint is configured for Azure monitoring

## Related Documentation

- [AZURE_DEPLOYMENT_LOG.md](./AZURE_DEPLOYMENT_LOG.md) - Complete Azure infrastructure details
- [Dockerfile](./Dockerfile) - Container build configuration
- [.env.production](./.env.production) - Production environment variables