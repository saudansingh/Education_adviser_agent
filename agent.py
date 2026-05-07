import logging
import os
import json
import asyncio
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
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


async def save_session_summary(summary_id: int | None, user_id: int, conversation_text: str) -> int:
    """Create or update session summary row by ID. Returns row ID."""
    try:
        async with async_session() as session:
            if summary_id:
                result = await session.execute(
                    select(SessionSummary).where(SessionSummary.id == summary_id)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    existing.summary = conversation_text
                    await session.commit()
                    logger.info(f"Updated summary row {summary_id} for user {user_id}")
                    return summary_id

            new_summary = SessionSummary(user_id=user_id, summary=conversation_text)
            session.add(new_summary)
            await session.commit()
            await session.refresh(new_summary)
            logger.info(f"Created summary row {new_summary.id} for user {user_id}")
            return new_summary.id
    except Exception as e:
        logger.error(f"Failed to save session summary: {e}")
        return summary_id or 0


class Assistant(Agent):
    def __init__(self, memory_summary: str | None = None) -> None:
        instructions = INSTRUCTIONS
        if memory_summary:
            instructions = f"{INSTRUCTIONS}\n\nPREVIOUS CONVERSATION SUMMARY:\n{memory_summary}\n\nRemember to acknowledge this context naturally."
            logger.info("Agent initialized with memory summary")
        else:
            logger.info("Agent initialized WITHOUT memory summary")

        super().__init__(instructions=instructions)
        self.user_id = None
        self.session_summary_id = None

    def _extract_text(self, content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for c in content:
                if isinstance(c, str):
                    parts.append(c)
                elif hasattr(c, 'text'):
                    parts.append(c.text)
                else:
                    parts.append(str(c))
            return " ".join(parts)
        if hasattr(content, 'text'):
            return content.text
        return str(content)

    async def on_user_turn_completed(self, chat_ctx, new_message=None):
        """Save full conversation to DB on every user turn"""
        # chat_ctx.messages is a METHOD in this SDK version
        try:
            messages = chat_ctx.messages() if callable(chat_ctx.messages) else chat_ctx.messages
        except Exception:
            messages = []

        lines = []
        for msg in messages:
            role = getattr(msg, 'role', 'unknown')
            content = getattr(msg, 'content', None)
            if content is None or role == 'system':
                continue
            text = self._extract_text(content)
            if text and not text.startswith('<livekit'):
                lines.append(f"{role}: {text}")

        if not lines:
            logger.warning("No conversation lines extracted, skipping save")
            return

        conversation_text = "\n".join(lines)
        logger.info(f"Conversation: {len(lines)} messages, {len(conversation_text)} chars")

        if self.user_id:
            self.session_summary_id = await save_session_summary(
                self.session_summary_id, self.user_id, conversation_text
            )


async def entrypoint(ctx: JobContext):
    await init_db()
    logger.info(f"Job received for room: {ctx.room.name}")

    await ctx.connect()

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

    # Load memory - skip corrupt data from old bugs
    memory_summary = None
    if user_id:
        logger.info(f"Attempting to load memory for user_id={user_id}")
        async with async_session() as session:
            raw_summary = await load_memory(user_id, session)
        if raw_summary and 'ChatContext object at' not in raw_summary:
            memory_summary = raw_summary
            logger.info(f"Loaded memory_summary: {memory_summary[:100]}...")
        elif raw_summary:
            logger.warning(f"Skipping corrupt memory data for user {user_id}")
        else:
            logger.info("No previous memory found")
    else:
        logger.warning("No user_id available, skipping memory load")

    assistant = Assistant(memory_summary=memory_summary)
    assistant.user_id = user_id

    await ctx.connect()

    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts=deepgram.TTS(model="aura-2-orion-en"),
    )

    await session.start(
        agent=assistant,
        room=ctx.room,
    )

    ctx.add_shutdown_callback(lambda: assistant.on_user_turn_completed(session.chat_ctx))

    await ctx.wait_for_participant()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
