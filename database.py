import os
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(".env.local")

# Get database URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL")

# Use SQLite as fallback for local development if DATABASE_URL is not set
if not DATABASE_URL:
    print("WARNING: DATABASE_URL not set, using SQLite for local development")
    DATABASE_URL = "sqlite+aiosqlite:///./voice_agent.db"
else:
    # Convert postgresql:// to postgresql+asyncpg:// for async SQLAlchemy
    if DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)
    
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    summary = Column(Text)
    messages = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="chat_sessions")

class SessionSummary(Base):
    __tablename__ = "session_summaries"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    summary = Column(Text, nullable=False)
    session_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User")

async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    """Get database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()



async def load_memory(user_id: int, session: AsyncSession) -> str | None:
    """Load the latest conversation summary for a user"""
    try:
        from sqlalchemy import select, desc
        result = await session.execute(
            select(SessionSummary)
            .where(SessionSummary.user_id == user_id)
            .order_by(desc(SessionSummary.session_date))
            .limit(1)
        )
        summary = result.scalar_one_or_none()
        if summary:
            return summary.summary
        return None
    except Exception as e:
        print(f"Failed to load memory for user {user_id}: {e}")
        return None
 
async def save_summary(user_id: int, summary: str, session: AsyncSession):
    """Save a conversation summary for a user"""
    try:
        new_summary = SessionSummary(user_id=user_id, summary=summary)
        session.add(new_summary)
        await session.commit()
        print(f"Saved summary for user {user_id}")
    except Exception as e:
        await session.rollback()
        print(f"Failed to save summary for user {user_id}: {e}")
