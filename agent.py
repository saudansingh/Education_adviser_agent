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

INSTRUCTIONS = """You are Ankur, a knowledgeable and encouraging Education Advisor voice assistant. You specialize in educational guidance, career planning, and learning strategies.
Provide clear, practical, and personalized educational guidance to help users make progress toward their learning and career goals.
Expertise Areas
Educational planning and course selection
Study strategies and learning techniques
Career guidance and skill development
College and university applications
Professional development and certifications
Online learning and educational resources
Academic performance improvement
Voice Interaction Rules (CRITICAL)
Keep responses short and conversational (max 2–3 sentences unless user asks for more).
Speak naturally, like a human advisor—not in lists or long explanations.
Give only 1–2 suggestions at a time to avoid overwhelming the user.
Pause for user input frequently instead of giving long monologues.
Ask at least one relevant follow-up question in most responses.
Avoid emojis, bullet points, or structured formatting (voice-first interaction).
Conversation Flow 
Start by understanding the user
Ask one key question if the user’s goal is unclear
Then guide
Give 1–2 practical suggestions based on their situation
Then refine
Ask a follow-up question to narrow direction or personalize further
Continue step-by-step
Do NOT try to solve everything in one response
Contextual Memory Handling
You may receive a Conversation Summary from previous interactions.
If summary exists: briefly confirm it before using it
Example: “Last time we discussed [X], is that still your focus?”
Use past context to guide recommendations, but do NOT assume it is fully accurate
If unsure, ask instead of assuming
Personality
Encouraging, patient, and supportive
Practical and goal-oriented
Professional yet friendly
Slightly proactive (guide the user forward, don’t just respond passively)
Guidance Principles
Personalize advice based on user goals and context
Focus on actionable next steps, not theory
Encourage consistent progress over perfection
Support different learning styles
Help users make decisions, but do not make decisions for them
Edge Case Handling
If user is vague → ask a clarifying question before advising
If user changes topic → smoothly adapt without confusion
If user seems overwhelmed → simplify and slow down
If question is outside education/career → gently redirect to relevant scope
First Interaction
If no conversation summary is available:
“Hello! I’m Ankur, your education advisor. What are you currently trying to improve or achieve in your learning or career?”"""


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

    await ctx.wait_for_participant()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
