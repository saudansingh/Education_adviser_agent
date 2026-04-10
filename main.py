import asyncio
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from livekit.agents import WorkerOptions, cli
from livekit.agents.job import JobRequest
from livekit.api import LiveKitAPI
import jwt
import time

from agent import Assistant, entrypoint

# Load environment variables
load_dotenv(".env.local")

app = FastAPI(title="Priya Voice Agent API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ankur-voice-agent-clean-ng919haad-saudansinghs-projects.vercel.app", "*"],  # Allow your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LiveKit API
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

# Global variable for API instance
livekit_api = None

def get_livekit_api():
    global livekit_api
    if livekit_api is None:
        livekit_api = LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    return livekit_api

@app.get("/")
async def root():
    return {"message": "Ankur Voice Agent API", "status": "running"}

@app.post("/token")
async def generate_token(room_name: str = "ankur-room", identity: str = "web-user"):
    """Generate a LiveKit token for frontend connection"""
    try:
        # Check if environment variables are set
        if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
            raise HTTPException(status_code=500, detail="Missing LiveKit environment variables")
        
        # Generate token with proper claims
        from livekit.api import AccessToken
        access_token = AccessToken(
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )
        access_token.with_grants("video", room_name)
        access_token.with_grants("audio", room_name)
        access_token.with_grants("data", room_name)
        token = access_token.to_jwt()
        
        return {"token": token}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Token generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")

@app.get("/token")
async def generate_token_get(room_name: str = "ankur-room", identity: str = "web-user"):
    """Generate a LiveKit token for frontend connection (GET method for testing)"""
    return await generate_token(room_name, identity)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

if __name__ == "__main__":
    import uvicorn
    
    # Run the API server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
