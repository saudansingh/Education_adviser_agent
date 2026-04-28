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
from database import async_session, load_memory, save_summary, SessionSummary
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
            instructions = f"""{INSTRUCTIONS}

PREVIOUS CONVERSATION SUMMARY:
{memory_summary}

Remember to acknowledge this previous context naturally in your conversation."""
            logger.info(f"Agent initialized with memory summary: {memory_summary[:100]}...")
        else:
            logger.info("Agent initialized WITHOUT memory summary")

        super().__init__(instructions=instructions)
        self.conversation_history = []
        self.user_id = None

    async def on_user_turn_completed(self, chat_ctx, new_message=None):
        """Track conversation and save to database"""
        text = None
        if new_message and hasattr(new_message, 'content'):
            content = new_message.content
            if isinstance(content, list):
                text = " ".join([str(c) if isinstance(c, str) else str(getattr(c, 'text', c)) for c in content])
            elif isinstance(content, str):
                text = content
        elif hasattr(chat_ctx, 'messages') and chat_ctx.messages:
            for msg in reversed(chat_ctx.messages):
                if hasattr(msg, 'role') and msg.role == 'user' and hasattr(msg, 'content'):
                    content = msg.content
                    if isinstance(content, list):
                        text = " ".join([str(c) if isinstance(c, str) else str(getattr(c, 'text', c)) for c in content])
                    elif isinstance(content, str):
                        text = content
                    break

        if not text:
            logger.warning("Could not extract text from user turn, skipping")
            return

        self.conversation_history.append({"role": "user", "content": text})
        logger.info(f"User turn completed: {text[:50]}...")
        logger.info(f"Conversation history size: {len(self.conversation_history)}")

        if self.user_id and self.conversation_history:
            conversation_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in self.conversation_history])
            await upsert_session_summary(self.user_id, conversation_text)


async def entrypoint(ctx: JobContext):
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

    await session.start(
        agent=assistant,
        room=ctx.room,
    )

    await ctx.wait_for_participant()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
