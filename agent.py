import logging
import os
import json
import asyncio
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram, openai, silero
from database import async_session, load_memory, save_summary, SessionSummary, init_db
from sqlalchemy import select, desc

logger = logging.getLogger("agent")

load_dotenv(".env.local")

INSTRUCTIONS = """You are Ankur, a knowledgeable and encouraging Education Advisor AI assistant. Your name is Ankur and you specialize in educational guidance, career planning, and learning strategies.

Your Expertise Areas:
- Educational planning and course selection
- Study strategies and learning techniques
- Career guidance and skill development
- College and university applications
- Professional development and certifications
- Online learning and educational resources
- Academic performance improvement

Your Personality:
- Encouraging, patient, and motivational
- Knowledgeable about educational pathways
- Practical and goal-oriented advice
- Supportive of diverse learning styles
- Professional yet approachable demeanor

Contextual Memory Guidelines (CRITICAL):
You will be provided with a 'Conversation Summary' from the user's previous sessions.

Start by acknowledging the past: If a summary is provided, use it to personalize your greeting. For example, 'Hello again! It's great to see you back. Last time we talked about [Topic from Summary], have you made any progress on that?'

Maintain Continuity: Use the previous context to build upon existing goals rather than asking the user to repeat information.

Synthesize: If the user asks a new question, cross-reference it with the previous summary to provide advice that is consistent with their long-term learning journey.

Important Guidelines:
- Provide personalized educational guidance
- Consider individual learning styles and goals
- Emphasize the importance of continuous learning
- Suggest relevant educational resources and platforms
- Use educational emojis (books, graduation caps, etc.)
- Encourage lifelong learning and skill development

Your Approach:
1. Assess user's educational background and goals
2. Provide personalized learning strategies
3. Guide career and educational planning
4. Suggest relevant courses and resources
5. Help with study techniques and time management
6. Encourage continuous skill development

If no summary is available, start with: 'Hello! I'm Ankur, your education advisor specializing in learning strategies and career guidance. How can I help you achieve your educational goals today?'"""


async def upsert_session_summary(user_id: int, conversation_text: str):
    """Update existing session summary or create new one for current session"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SessionSummary)
                .where(SessionSummary.user_id == user_id)
                .order_by(desc(SessionSummary.created_at))
                .limit(1)
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.summary = conversation_text
                await session.commit()
                logger.info(f"Updated session summary for user {user_id}")
            else:
                new_summary = SessionSummary(user_id=user_id, summary=conversation_text)
                session.add(new_summary)
                await session.commit()
                logger.info(f"Created session summary for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to upsert session summary: {e}")


class Assistant(Agent):
    def __init__(self, memory_summary: str | None = None) -> None:
        instructions = INSTRUCTIONS
        if memory_summary:
            instructions = f"{INSTRUCTIONS}\n\nPREVIOUS CONVERSATION SUMMARY:\n{memory_summary}\n\nRemember to acknowledge this context naturally."
            logger.info("Agent initialized with memory summary")
        
        super().__init__(instructions=instructions)
        self.user_id = None
        self._chat_ctx = None

    async def chat_ctx_updated(self, chat_ctx):
        self._chat_ctx = chat_ctx

    async def save_session_to_db(self):
        # Now we use the stored self.chat_ctx
        if not self._chat_ctx:
            logger.warning("No chat_ctx available to save.")
            return

        logger.info(f"DEBUG: Attempting to save, messages count: {len(self._chat_ctx.messages)}")
        
        if not self.user_id:
            logger.warning("No user_id found, skipping save.")
            return
            
        # Build the history string
        # Ensure 'self.chat_ctx.messages' is indented correctly under this method
        conversation_text = "\n".join([f"{msg.role}: {msg.content}" for msg in self._chat_ctx.messages])
        
        await upsert_session_summary(self.user_id, conversation_text)
        logger.info(f"Saved full history for user {self.user_id}")

async def entrypoint(ctx: JobContext):
    await init_db()
    logger.info(f"Job received for room: {ctx.room.name}")

    # Extract user_id from room name
    user_id = None
    try:
        room_name = ctx.room.name
        logger.info(f"Room name: {room_name}")
        parts = room_name.split("-")
        if len(parts) >= 2 and parts[0] == "room":
            user_id = int(parts[1])
            logger.info(f"Extracted user_id from room name: {user_id}")
    except Exception as e:
        logger.error(f"Could not extract user_id from room name: {e}")

    # Load memory
    memory_summary = None
    if user_id:
        logger.info(f"Attempting to load memory for user_id={user_id}")
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)
        logger.info(f"Loaded memory_summary: {memory_summary[:100] if memory_summary else 'None'}...")
    else:
        logger.warning("No user_id available, skipping memory load")

    assistant = Assistant(memory_summary=memory_summary)
    assistant.user_id = user_id

   

    await ctx.connect()

    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts=deepgram.TTS(model="aura-orion-en"),
    )

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"Participant {participant.identity} disconnected. Triggering save.")
        # Call without arguments now
        asyncio.create_task(assistant.save_session_to_db())

    await session.start(agent=assistant, room=ctx.room)
    await ctx.wait_for_participant()
    
    def on_room_disconnected():
        logger.info("Room disconnected, attempting final save...")
        asyncio.create_task(assistant.save_session_to_db(session.chat_ctx))

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
