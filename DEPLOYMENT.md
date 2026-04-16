# Deployment Guide for Ankur Voice Agent

This guide will help you deploy your voice agent with PostgreSQL database for chat history persistence.

## Architecture Overview

```
Frontend (React)  -->  Backend API (FastAPI)  -->  PostgreSQL Database  -->  LiveKit Cloud  -->  Voice Agent
```

## New Features
- **Email-based login/signup** - Users authenticate with email only
- **Chat history persistence** - Previous chat summaries stored in database
- **Context awareness** - Agent gets user context from previous sessions
- **JWT authentication** - Secure API endpoints

## Option 1: Easy Deployment with Vercel + Railway

### Step 1: Deploy Backend with PostgreSQL on Railway

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Or drag and drop your project folder

3. **Add PostgreSQL Database**
   - In your Railway project, click "New Service"
   - Select "Database"
   - Choose "PostgreSQL"
   - Railway will create a PostgreSQL instance

4. **Configure Environment Variables**
   - Go to your project settings
   - Add the following environment variables:
     ```
     LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
     LIVEKIT_API_KEY=your_livekit_api_key
     LIVEKIT_API_SECRET=your_livekit_api_secret
     OPENAI_API_KEY=your_openai_api_key
     DEEPGRAM_API_KEY=your_deepgram_api_key
     DATABASE_URL=postgresql://user:password@host:port/database
     JWT_SECRET_KEY=generate-a-random-secret-key
     ```
   - For `DATABASE_URL`, click the PostgreSQL service in Railway and copy the "Connection URL"
   - For `JWT_SECRET_KEY`, generate a random string (e.g., `openssl rand -hex 32`)

5. **Initialize Database Schema**
   - Connect to your Railway PostgreSQL database using the Railway console or a PostgreSQL client
   - Run the SQL commands from `schema.sql`:
     ```sql
     CREATE TABLE IF NOT EXISTS users (
         id SERIAL PRIMARY KEY,
         email VARCHAR(255) UNIQUE NOT NULL,
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     );

     CREATE TABLE IF NOT EXISTS chat_sessions (
         id SERIAL PRIMARY KEY,
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         summary TEXT,
         messages JSONB,
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     );

     CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
     CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
     ```

6. **Deploy Backend**
   - Railway will automatically deploy when you push to GitHub
   - Or use Railway CLI:
     ```bash
     npm install -g @railway/cli
     railway login
     railway up
     ```

7. **Get Your Backend URL**
   - Railway will give you a URL like: `https://your-app.up.railway.app`

### Step 2: Deploy Frontend (Vercel)

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Deploy Frontend**
   ```bash
   cd frontend
   
   # Build for production
   npm run build
   
   # Deploy to Vercel
   npx vercel --prod
   ```

3. **Update Frontend Environment**
   - In Vercel dashboard, go to your project settings
   - Add environment variables:
     ```
     REACT_APP_API_URL=https://your-backend-url.com
     REACT_APP_LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
     ```
   - Replace `https://your-backend-url.com` with your Railway URL

4. **Redeploy Frontend**
   ```bash
   npx vercel --prod
   ```

### Step 3: Test Your Deployed App

1. **Visit your Vercel URL**
2. **Enter your email** to login/signup
3. **Select Ankur agent**
4. **Click Connect**
5. **Allow microphone access**
6. **Test voice conversation**
7. **Disconnect and login again** with same email to see chat history

## Option 2: Advanced Deployment with Docker

### Deploy with Docker Compose (includes PostgreSQL)

1. **Update docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     backend:
       build: .
       ports:
         - "8000:8000"
       environment:
         - DATABASE_URL=postgresql://postgres:password@db:5432/voiceagent
         - LIVEKIT_URL=${LIVEKIT_URL}
         - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
         - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
         - OPENAI_API_KEY=${OPENAI_API_KEY}
         - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
         - JWT_SECRET_KEY=${JWT_SECRET_KEY}
       depends_on:
         - db
     
     db:
       image: postgres:15
       environment:
         - POSTGRES_DB=voiceagent
         - POSTGRES_USER=postgres
         - POSTGRES_PASSWORD=password
       volumes:
         - postgres_data:/var/lib/postgresql/data
       ports:
         - "5432:5432"
   
   volumes:
     postgres_data:
   ```

2. **Initialize Database**
   ```bash
   docker-compose up -d db
   docker exec -it <container_name> psql -U postgres -d voiceagent -f schema.sql
   docker-compose up -d backend
   ```

## Environment Variables

### Backend Environment Variables
```bash
LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET_KEY=your-random-secret-key
```

### Frontend Environment Variables
```bash
REACT_APP_API_URL=https://your-backend-url.com
REACT_APP_LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
```

## API Endpoints

### Authentication
- `POST /login` - Login or signup with email
  - Request body: `{ "email": "user@example.com" }`
  - Response: `{ "token": "jwt_token", "user_id": 1, "email": "user@example.com" }`

### Chat History
- `GET /chat-history` - Get user's chat history (requires authentication)
  - Headers: `Authorization: Bearer <jwt_token>`
  - Response: `{ "sessions": [...] }`

- `POST /chat-summary` - Save chat summary (requires authentication)
  - Headers: `Authorization: Bearer <jwt_token>`
  - Request body: `{ "summary": "Chat summary", "messages": [...] }`

### LiveKit Token
- `POST /token` - Generate LiveKit token (requires authentication)
  - Headers: `Authorization: Bearer <jwt_token>`
  - Request body: `{ "room_name": "ankur-room", "identity": "user-123" }`
  - Response: `{ "token": "livekit_token" }`

## Security Considerations

1. **Never expose API secrets in frontend code**
2. **Use HTTPS for all connections**
3. **Set up CORS properly**
4. **Use strong JWT_SECRET_KEY**
5. **Monitor for abuse**
6. **Set rate limits on token generation**
7. **Use environment-specific secrets**

## Monitoring and Scaling

### Health Checks
- Backend: `GET /health`
- Database: Monitor Railway PostgreSQL metrics
- Frontend: Monitor Vercel analytics

### Scaling
- **Backend**: Use Railway's auto-scaling or Kubernetes
- **Database**: Railway PostgreSQL handles auto-scaling
- **Frontend**: Vercel handles automatically
- **LiveKit**: Built for real-time scaling

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify DATABASE_URL is correct
   - Check Railway PostgreSQL status
   - Ensure database schema is initialized

2. **Authentication Errors**
   - Verify JWT_SECRET_KEY matches between requests
   - Check token expiration (24 hours)
   - Ensure Authorization header format: `Bearer <token>`

3. **CORS Errors**
   - Update CORS middleware in `main.py`
   - Add your frontend domain to allowed origins

4. **Token Generation Fails**
   - Check environment variables
   - Verify LiveKit API credentials
   - Ensure user is authenticated

5. **Audio Not Working**
   - Check microphone permissions
   - Verify HTTPS is enabled
   - Check browser console for errors

6. **Connection Drops**
   - Check network stability
   - Monitor backend health
   - Check LiveKit room status

## Quick Start Commands

```bash
# Deploy backend to Railway
railway login
railway up

# Deploy frontend to Vercel
cd frontend
npm run build
npx vercel --prod

# Test deployment
curl https://your-backend-url.com/health

# Test login endpoint
curl -X POST https://your-backend-url.com/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Support

- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **LiveKit**: [docs.livekit.io](https://docs.livekit.io)
- **PostgreSQL**: [postgresql.org/docs](https://www.postgresql.org/docs/)

Your deployed voice agent with chat history will be available at your Vercel URL!
