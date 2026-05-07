import logging
import os
import json
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram, openai, silero
# Ensure these imports match your database.py exactly
from database import async_session, load_memory, SessionSummary, init_db
from sqlalchemy import select

logger = logging.getLogger("agent")

# Load environment variables
load_dotenv(".env.local")

INSTRUCTIONS = """You are Ankur, a knowledgeable and encouraging Education Advisor AI assistant..."""

async def save_session_to_neon(summary_id: int | None, user_id: int, conversation_text: str) -> int:
    """
    Saves or updates the conversation in the 'session_summaries' table.
    """
    try:
        async with async_session() as session:
            # 1. Check if we are updating an existing session in this call
            if summary_id:
                result = await session.execute(
                    select(SessionSummary).where(SessionSummary.id == summary_id)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    existing.summary = conversation_text
                    # existing.updated_at = datetime.utcnow() # If you have this column
                    await session.commit()
                    logger.info(f"Updated session_summaries row {summary_id}")
                    return summary_id

            # 2. If no summary_id exists yet, create a new record
            new_summary = SessionSummary(
                user_id=user_id, 
                summary=conversation_text
            )
            session.add(new_summary)
            await session.commit()
            await session.refresh(new_summary)
            logger.info(f"Created new session_summaries row {new_summary.id}")
            return new_summary.id
            
    except Exception as e:
        logger.error(f"Failed to save to Neon: {e}")
        return summary_id or 0

class Assistant(Agent):
    def __init__(self, memory_summary: str | None = None) -> None:
        instructions = INSTRUCTIONS
        if memory_summary:
            instructions += f"\n\nPREVIOUS CONVERSATION SUMMARY:\n{memory_summary}"
        
        super().__init__(instructions=instructions)
        self.user_id = None
        self.session_summary_id = None

    def _extract_text(self, content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join([self._extract_text(c) for c in content])
        return getattr(content, 'text', str(content))

    async def on_user_turn_completed(self, chat_ctx, new_message=None):
        """Triggered whenever a turn ends to ensure data isn't lost if the call drops."""
        if not self.user_id:
            return

        try:
            messages = chat_ctx.messages() if callable(chat_ctx.messages) else chat_ctx.messages
            lines = []
            for msg in messages:
                role = getattr(msg, 'role', 'unknown')
                if role == 'system' or not msg.content:
                    continue
                text = self._extract_text(msg.content)
                if text and not text.startswith('<livekit'):
                    lines.append(f"{role}: {text}")

            if lines:
                full_transcript = "\n".join(lines)
                # Save to session_summaries table
                self.session_summary_id = await save_session_to_neon(
                    self.session_summary_id, self.user_id, full_transcript
                )
        except Exception as e:
            logger.error(f"Error in turn completion save: {e}")

async def entrypoint(ctx: JobContext):
    await init_db()
    await ctx.connect()
    
    # Extract user_id from room name: room-{user_id}-{timestamp}
    user_id = None
    try:
        parts = ctx.room.name.split("-")
        if len(parts) >= 2 and parts[0] == "room":
            user_id = int(parts[1])
    except Exception as e:
        logger.error(f"Could not parse user_id from {ctx.room.name}: {e}")

    # Load history from 'session_summaries' to give the AI context
    memory_summary = None
    if user_id:
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)

    assistant = Assistant(memory_summary=memory_summary)
    assistant.user_id = user_id

    # Configure the session
    agent_session = AgentSession(
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=deepgram.TTS(model="aura-astra-en"),
    )

    await agent_session.start(agent=assistant, room=ctx.room)

    # Safety: Final save when the agent process is killed/shutdown
    ctx.add_shutdown_callback(
        lambda: asyncio.create_task(assistant.on_user_turn_completed(agent_session.chat_ctx))
    )

    await ctx.wait_for_participant()

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
