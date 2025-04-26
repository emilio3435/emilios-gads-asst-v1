# Session Management with Redis

This project uses Redis for session storage to extend the duration users remain logged in beyond the default Google OAuth token expiration (1 hour).

## Prerequisites

- Redis server (version 6.0 or higher recommended)
- Node.js and npm

## Redis Installation

### MacOS (using Homebrew)

```bash
# Install Redis
brew install redis

# Start Redis service
brew services start redis

# Verify Redis is running
redis-cli ping
# Should return "PONG"
```

### Linux (Ubuntu/Debian)

```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Make sure Redis is running
sudo systemctl status redis-server

# If not running, start it
sudo systemctl start redis-server

# Enable on startup
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should return "PONG"
```

### Windows

Download and install the Redis Windows version from [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases)

Alternatively, use Windows Subsystem for Linux (WSL) and follow the Linux instructions.

## Environment Configuration

Create a `.env` file in the server directory with the following variables:

```
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id

# Session Configuration
SESSION_SECRET=your-very-secure-session-secret
SESSION_MAX_AGE=604800000  # 7 days in milliseconds

# Redis Configuration (for session storage)
REDIS_URL=redis://localhost:6379

# CORS Settings
CORS_ORIGIN=http://localhost:3000

# Server Configuration
PORT=3001
NODE_ENV=development  # change to 'production' in production environment
```

### Security Notes

- `SESSION_SECRET` should be a long, random string unique to your application. You can generate one using:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- In production, ensure Redis is configured securely with authentication and not exposed to the public internet

## Session Duration

The default session duration is set to 7 days (604800000 milliseconds). You can adjust this value by changing the `SESSION_MAX_AGE` environment variable.

## Troubleshooting

### Redis connection issues

If you encounter Redis connection errors:

1. Verify Redis is running: `redis-cli ping`
2. Check Redis logs: `brew services log redis` (MacOS) or `sudo journalctl -u redis-server` (Linux)
3. Ensure the `REDIS_URL` in your .env file matches your Redis configuration

### Session not persisting

1. Make sure CORS is configured properly with `credentials: true`
2. In your frontend code, ensure your fetch/axios requests include `{ credentials: 'include' }` or `withCredentials: true`

## Production Deployment Notes

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Use a managed Redis service like Redis Labs, AWS ElastiCache, or similar
3. Configure Redis with authentication 
4. Use a strong, unique `SESSION_SECRET`
5. Configure secure cookies by ensuring your site uses HTTPS

