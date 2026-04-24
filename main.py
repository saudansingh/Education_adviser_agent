import os
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import jwt
from datetime import datetime, timedelta
from sqlalchemy import select
from database import init_db, get_db, User, ChatSession
from sqlalchemy.ext.asyncio import AsyncSession

# Load environment variables
load_dotenv(".env.local")

# Get environment variables and clean them
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "").strip().strip('"').strip("'")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")

# Configure CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Secret Key
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Startup event to initialize database
@app.on_event("startup")
async def startup_event():
    await init_db()

def create_jwt_token(user_id: int, email: str) -> str:
    """Create JWT token for user"""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(authorization: str = Header(...), db: AsyncSession = Depends(get_db)):
    """Get current user from JWT token"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization[7:]  # Remove 'Bearer ' prefix
    payload = verify_jwt_token(token)
    
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

@app.get("/")
async def root():
    return {"message": "Ankur Voice Agent API", "status": "running"}

@app.post("/login")
async def login(request: dict, db: AsyncSession = Depends(get_db)):
    """Login or signup with email"""
    email = request.get("email")
    name = request.get("name")  # Optional name field
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Check if user exists
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    # Create user if doesn't exist (signup)
    if not user:
        # Provide default name if not provided to avoid NOT NULL constraint
        user_name = name if name else email.split('@')[0]
        user = User(email=email, name=user_name)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update last_login on existing user
        user.last_login = datetime.utcnow()
        await db.commit()
    
    # Generate JWT token
    token = create_jwt_token(user.id, user.email)
    
    return {
        "token": token,
        "user_id": user.id,
        "email": user.email,
        "name": user.name
    }

@app.get("/chat-history")
async def get_chat_history(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get chat history for current user"""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()
    
    return {
        "sessions": [
            {
                "id": session.id,
                "summary": session.summary,
                "messages": session.messages,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat()
            }
            for session in sessions
        ]
    }

@app.post("/chat-summary")
async def save_chat_summary(request: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Save chat summary for current user"""
    summary = request.get("summary")
    messages = request.get("messages", [])
    
    if not summary:
        raise HTTPException(status_code=400, detail="Summary is required")
    
    chat_session = ChatSession(
        user_id=current_user.id,
        summary=summary,
        messages=messages
    )
    db.add(chat_session)
    await db.commit()
    await db.refresh(chat_session)
    
    return {
        "id": chat_session.id,
        "summary": chat_session.summary,
        "created_at": chat_session.created_at.isoformat()
    }

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
            "nbf": int(now.timestamp()),
            "exp": int(exp.timestamp()),
            "iat": int(now.timestamp()),
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
async def generate_token(request: dict = None, current_user: User = Depends(get_current_user)):
    """Generate a LiveKit token for frontend connection (requires authentication)"""
    try:
        # Get parameters from JSON body or use defaults
        if request:
            room_name = request.get("room_name")
            identity = request.get("identity", f"user-{current_user.id}")
        else:
            room_name = None
            identity = f"user-{current_user.id}"
        
        # Generate unique room name if not provided
        if not room_name:
            room_name = f"room-{current_user.id}-{int(datetime.utcnow().timestamp())}"
        
        # Check if environment variables are set
        if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
            raise HTTPException(status_code=500, detail="Missing LiveKit environment variables")
        
        # Create JWT token with correct LiveKit claims format
        now = datetime.utcnow()
        exp = now + timedelta(hours=24)
        
        payload = {
            "iss": LIVEKIT_API_KEY,
            "sub": identity,
            "nbf": int(now.timestamp()),
            "exp": int(exp.timestamp()),
            "iat": int(now.timestamp()),
            "jti": f"{identity}-{int(now.timestamp())}",
            "identity": identity,
            "name": identity,
            "metadata": json.dumps({"user_id": current_user.id, "email": current_user.email}),
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
        
        return {"token": jwt_token, "room_name": room_name}
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
