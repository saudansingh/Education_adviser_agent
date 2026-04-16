import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import jwt
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

# Get environment variables
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")

# Configure CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ankur-voice-agent-clean-ng919haad-saudansinghs-projects.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Ankur Voice Agent API", "status": "running"}

@app.get("/token")
async def generate_token_get(room_name: str = "ankur-room", identity: str = "web-user"):
    """Generate a LiveKit token for frontend connection (GET method for testing)"""
    try:
        # Check if environment variables are set
        if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
            raise HTTPException(status_code=500, detail="Missing LiveKit environment variables")
        
        # Create JWT token with correct LiveKit claims format
        now = datetime.utcnow()
        exp = now + timedelta(hours=24)
        
        payload = {
            "iss": LIVEKIT_API_KEY,
            "sub": identity,
            "nbf": now,
            "exp": exp,
            "iat": now,
            "jti": f"{identity}-{int(now.timestamp())}",
            "identity": identity,
            "name": identity,
            "metadata": "",
            "video": {
                "roomJoin": True,
                "room": room_name
            },
            "audio": {
                "roomJoin": True,
                "room": room_name
            },
            "data": {
                "roomJoin": True,
                "room": room_name
            }
        }
        
        jwt_token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")
        
        return {"token": jwt_token}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")

@app.post("/token")
async def generate_token(request: dict = None):
    """Generate a LiveKit token for frontend connection"""
    try:
        # Get parameters from JSON body or use defaults
        if request:
            room_name = request.get("room_name", "ankur-room")
            identity = request.get("identity", "web-user")
        else:
            room_name = "ankur-room"
            identity = "web-user"
        
        # Check if environment variables are set
        if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
            raise HTTPException(status_code=500, detail="Missing LiveKit environment variables")
        
        # Create JWT token with correct LiveKit claims format
        now = datetime.utcnow()
        exp = now + timedelta(hours=24)
        
        payload = {
            "iss": LIVEKIT_API_KEY,
            "sub": identity,
            "nbf": now,
            "exp": exp,
            "iat": now,
            "jti": f"{identity}-{int(now.timestamp())}",
            "identity": identity,
            "name": identity,
            "metadata": "",
            "video": {
                "roomJoin": True,
                "room": room_name
            },
            "audio": {
                "roomJoin": True,
                "room": room_name
            },
            "data": {
                "roomJoin": True,
                "room": room_name
            }
        }
        
        jwt_token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")
        
        return {"token": jwt_token}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ankur-voice-agent-api"}

@app.get("/agent-status")
async def agent_status():
    """Check if agent worker is running"""
    try:
        # This is a basic check - in production, agent should be running
        return {"agent_status": "agent_worker_should_be_running", "note": "Check Railway logs for agent worker"}
    except Exception as e:
        return {"agent_status": "unknown", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
