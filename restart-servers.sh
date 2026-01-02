#!/bin/bash

# Samantha ports (different from Hekmah to allow both to run)
BACKEND_PORT=3003
FRONTEND_PORT=3002

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local service_name=$2
    
    print_status "Checking for processes on port $port..."
    
    # Find PIDs running on the port
    local pids=$(lsof -ti:$port)
    
    if [ -z "$pids" ]; then
        print_warning "No processes found running on port $port"
        return 0
    fi
    
    print_status "Found processes on port $port: $pids"
    
    # Kill each process
    for pid in $pids; do
        print_status "Killing $service_name process (PID: $pid) on port $port..."
        kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null
        
        # Wait a moment and check if process is still running
        sleep 2
        if kill -0 $pid 2>/dev/null; then
            print_warning "Process $pid still running, force killing..."
            kill -KILL $pid 2>/dev/null
        fi
    done
    
    # Verify port is now free
    sleep 1
    local remaining_pids=$(lsof -ti:$port)
    if [ -z "$remaining_pids" ]; then
        print_success "Port $port is now free"
    else
        print_error "Failed to free port $port. Remaining PIDs: $remaining_pids"
        return 1
    fi
}

# Function to check and fetch JWKS keys if needed
ensure_jwks_keys() {
    local jwks_file="server/config/jwks-keys.json"
    local needs_refresh=false

    if [ ! -f "$jwks_file" ]; then
        print_warning "JWKS keys not found. Fetching keys for Microsoft authentication..."
        needs_refresh=true
    else
        # Check if keys are older than 7 days
        if [ "$(uname)" = "Darwin" ]; then
            # macOS
            file_age_seconds=$(( $(date +%s) - $(stat -f %m "$jwks_file") ))
        else
            # Linux
            file_age_seconds=$(( $(date +%s) - $(stat -c %Y "$jwks_file") ))
        fi

        file_age_days=$(( file_age_seconds / 86400 ))

        if [ $file_age_days -gt 7 ]; then
            print_warning "JWKS keys are $file_age_days days old. Refreshing for Microsoft authentication..."
            needs_refresh=true
        else
            print_status "JWKS keys found at $jwks_file ($file_age_days days old)"
        fi
    fi

    if [ "$needs_refresh" = true ]; then
        npm run fetch-jwks-keys

        if [ $? -ne 0 ]; then
            print_error "Failed to fetch JWKS keys. Microsoft authentication may not work."
            print_status "You can manually fetch keys later with: npm run fetch-jwks-keys"
            return 1
        fi

        print_success "JWKS keys fetched successfully"
    fi
}

# Function to start backend server
start_backend() {
    print_status "Starting backend server on port $BACKEND_PORT..."

    # Ensure JWKS keys are available for Microsoft auth
    ensure_jwks_keys

    cd server
    if [ ! -f "index.js" ]; then
        print_error "Backend server file not found. Make sure you're in the correct directory."
        return 1
    fi

    # Start server in background with custom port
    BACKEND_PORT=$BACKEND_PORT nohup node index.js > ../backend.log 2>&1 &
    local backend_pid=$!

    # Wait a moment for server to start
    sleep 3

    # Check if server is running
    if kill -0 $backend_pid 2>/dev/null; then
        print_success "Backend server started successfully (PID: $backend_pid)"
        print_status "Backend logs: tail -f backend.log"
    else
        print_error "Failed to start backend server. Check backend.log for errors."
        return 1
    fi

    cd ..
}

# Function to start frontend server
start_frontend() {
    print_status "Starting frontend server on port $FRONTEND_PORT..."

    if [ ! -f "package.json" ]; then
        print_error "Frontend package.json not found. Make sure you're in the correct directory."
        return 1
    fi

    # Start frontend in background with custom port
    PORT=$FRONTEND_PORT nohup npm start > frontend.log 2>&1 &
    local frontend_pid=$!

    # Wait a moment for server to start
    sleep 5

    # Check if server is running by checking the port
    if lsof -ti:$FRONTEND_PORT > /dev/null; then
        print_success "Frontend server started successfully"
        print_status "Frontend logs: tail -f frontend.log"
        print_status "Frontend URL: http://localhost:$FRONTEND_PORT"
    else
        print_error "Failed to start frontend server. Check frontend.log for errors."
        return 1
    fi
}

# Function to check server status
check_status() {
    print_status "Checking server status..."

    # Check backend
    if lsof -ti:$BACKEND_PORT > /dev/null; then
        print_success "Backend server is running on port $BACKEND_PORT"
    else
        print_warning "Backend server is not running on port $BACKEND_PORT"
    fi

    # Check frontend
    if lsof -ti:$FRONTEND_PORT > /dev/null; then
        print_success "Frontend server is running on port $FRONTEND_PORT"
    else
        print_warning "Frontend server is not running on port $FRONTEND_PORT"
    fi
}

# Function to restart specific server
restart_server() {
    local server_type=$1

    case $server_type in
        "backend")
            kill_port $BACKEND_PORT "Backend"
            start_backend
            ;;
        "frontend")
            kill_port $FRONTEND_PORT "Frontend"
            start_frontend
            ;;
        "both")
            kill_port $BACKEND_PORT "Backend"
            kill_port $FRONTEND_PORT "Frontend"
            start_backend
            start_frontend
            ;;
        *)
            print_error "Invalid server type. Use: backend, frontend, or both"
            return 1
            ;;
    esac
}

# Main script logic
main() {
    print_status "Samantha - Server Management Script"
    print_status "===================================="
    
    case "${1:-}" in
        "status")
            check_status
            ;;
        "restart")
            restart_server "${2:-both}"
            ;;
        "stop")
            case "${2:-both}" in
                "backend")
                    kill_port $BACKEND_PORT "Backend"
                    ;;
                "frontend")
                    kill_port $FRONTEND_PORT "Frontend"
                    ;;
                "both")
                    kill_port $BACKEND_PORT "Backend"
                    kill_port $FRONTEND_PORT "Frontend"
                    ;;
                *)
                    print_error "Invalid option. Use: backend, frontend, or both"
                    exit 1
                    ;;
            esac
            ;;
        "start")
            case "${2:-both}" in
                "backend")
                    start_backend
                    ;;
                "frontend")
                    start_frontend
                    ;;
                "both")
                    start_backend
                    start_frontend
                    ;;
                *)
                    print_error "Invalid option. Use: backend, frontend, or both"
                    exit 1
                    ;;
            esac
            ;;
        "help"|"--help"|"-h")
            echo "Usage: $0 [COMMAND] [SERVER_TYPE]"
            echo ""
            echo "Samantha Family Management - Server Manager"
            echo ""
            echo "Commands:"
            echo "  status           - Check if servers are running"
            echo "  restart [type]   - Restart servers (default: both)"
            echo "  stop [type]      - Stop servers (default: both)"
            echo "  start [type]     - Start servers (default: both)"
            echo "  help             - Show this help message"
            echo ""
            echo "Server Types:"
            echo "  backend          - Backend API server (port $BACKEND_PORT)"
            echo "  frontend         - Frontend React server (port $FRONTEND_PORT)"
            echo "  both             - Both servers (default)"
            echo ""
            echo "Examples:"
            echo "  $0 status                    # Check server status"
            echo "  $0 restart                  # Restart both servers"
            echo "  $0 restart backend          # Restart only backend"
            echo "  $0 stop frontend            # Stop only frontend"
            echo "  $0 start both               # Start both servers"
            ;;
        "")
            print_status "No command specified. Checking status and restarting if needed..."
            check_status
            restart_server "both"
            ;;
        *)
            print_error "Unknown command: $1"
            print_status "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run the main function with all arguments
main "$@" 