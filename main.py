import asyncio
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from livekit.agents import WorkerOptions, cli
from livekit.agents.job import JobRequest, JobAcceptance
from livekit.api import LiveKitAPI, TokenError
import jwt
import time

from agent import Assistant, entrypoint

# Load environment variables
load_dotenv(".env.local")

app = FastAPI(title="Priya Voice Agent API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LiveKit API
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

livekit_api = LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

@app.get("/")
async def root():
    return {"message": "Priya Voice Agent API", "status": "running"}

@app.post("/token")
async def generate_token(room_name: str = "test-room", identity: str = "web-user"):
    """Generate a LiveKit token for frontend connection"""
    try:
        # Generate token with proper claims
        token = livekit_api.auth.create_token(
            identity=identity,
            name=identity,
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        )
        
        return {"token": token}
    except TokenError as e:
        raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

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
