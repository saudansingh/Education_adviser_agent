# Deployment Guide for Ankur Voice Agent

This guide will help you deploy your voice agent to get a shareable link.

## Architecture Overview

```
Frontend (React)  -->  Backend API (FastAPI)  -->  LiveKit Cloud  -->  Voice Agent
```

## Option 1: Easy Deployment with Vercel + Railway

### Step 1: Deploy Backend (Railway)

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy Backend**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login to Railway
   railway login
   
   # Deploy your project
   cd "c:\Users\Ankur singh\Downloads\voice-agent-workshop-main\voice-agent-workshop-main"
   railway up
   ```


4. **Get Your Backend URL**
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
   - Edit `frontend/.env.production`
   - Replace `https://your-backend-url.com` with your Railway URL

4. **Redeploy Frontend**
   ```bash
   npx vercel --prod
   ```

### Step 3: Test Your Deployed App

1. **Visit your Vercel URL**
2. **Click on Priya agent**
3. **Click Connect**
4. **Allow microphone access**
5. **Test voice conversation**

## Option 2: Advanced Deployment with Docker

### Deploy to Any Cloud Provider

1. **Build Docker Image**
   ```bash
   docker build -t priya-voice-agent .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Deploy to Cloud**
   - **AWS**: Use ECS or App Runner
   - **Google Cloud**: Use Cloud Run
   - **Azure**: Use Container Instances
   - **DigitalOcean**: Use App Platform

## Option 3: Serverless Deployment

### Using LiveKit Cloud + Serverless Functions

1. **Deploy Agent to LiveKit Cloud**
   - Go to [cloud.livekit.io](https://cloud.livekit.io)
   - Navigate to Agents tab
   - Deploy your agent directly

2. **Deploy Frontend to Netlify**
   ```bash
   cd frontend
   npm run build
   npx netlify deploy --prod --dir=build
   ```

## Environment Variables

### Backend Environment Variables
```bash
LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

### Frontend Environment Variables
```bash
REACT_APP_API_URL=https://your-backend-url.com
REACT_APP_LIVEKIT_URL=wss://voice-agent-u5bk8av6.livekit.cloud
```

## Security Considerations

1. **Never expose API secrets in frontend code**
2. **Use HTTPS for all connections**
3. **Set up CORS properly**
4. **Monitor for abuse**
5. **Set rate limits on token generation**

## Monitoring and Scaling

### Health Checks
- Backend: `GET /health`
- Frontend: Monitor Vercel analytics

### Scaling
- **Backend**: Use Railway's auto-scaling or Kubernetes
- **Frontend**: Vercel handles automatically
- **LiveKit**: Built for real-time scaling

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Update CORS middleware in `main.py`
   - Add your frontend domain to allowed origins

2. **Token Generation Fails**
   - Check environment variables
   - Verify LiveKit API credentials

3. **Audio Not Working**
   - Check microphone permissions
   - Verify HTTPS is enabled
   - Check browser console for errors

4. **Connection Drops**
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
```

## Support

- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **LiveKit**: [docs.livekit.io](https://docs.livekit.io)

Your deployed voice agent will be available at your Vercel URL, ready to share with anyone!
