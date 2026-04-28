import logging
import os
import json
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram, openai
from livekit.agents.llm import ChatMessage
from database import async_session, load_memory, save_summary

# Setup logging
logger = logging.getLogger("agent")
load_dotenv(".env.local")

INSTRUCTIONS = """You are Ankur, a knowledgeable and encouraging Education Advisor AI assistant. Your name is Ankur and you specialize in educational guidance, career planning, and learning strategies.

Your Expertise Areas:
- Educational planning, study strategies, career guidance, and skill development.

Your Personality:
- Encouraging, patient, and motivational.
- Professional yet approachable.

Guidelines:
- Maintain continuity with previous goals.
- Use the provided 'Conversation Summary' to personalize your guidance."""

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=INSTRUCTIONS)
        self.conversation_history = []
        self.user_id = None
    
    def record_message(self, role: str, content: str):
        if content and content.strip():
            self.conversation_history.append({"role": role, "content": content})
            logger.info(f"History recorded: {role} - {content[:50]}...")

async def summarize_conversation(conversation_text: str) -> str:
    """Summarize conversation concisely for next session's memory."""
    try:
        llm = openai.LLM(model="gpt-4o-mini")
        response = await llm.chat([
            {"role": "system", "content": "Summarize the user's goals and progress concisely (under 150 words). Focus on what was achieved."},
            {"role": "user", "content": conversation_text}
        ])
        return response.content
    except Exception as e:
        logger.error(f"Failed to summarize: {e}")
        return "Conversation summary unavailable"

async def entrypoint(ctx: JobContext):
    logger.info(f"Job received for room: {ctx.room.name}")
    
    # 1. Extract metadata
    user_id = None
    try:
        metadata_dict = json.loads(ctx.job.metadata) if isinstance(ctx.job.metadata, str) else ctx.job.metadata
        user_id = metadata_dict.get("user_id")
    except Exception as e:
        logger.error(f"Error extracting metadata: {e}")

    # 2. Initialize Assistant
    assistant = Assistant()
    assistant.user_id = user_id
    
    # 3. Setup Session
    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts=deepgram.TTS(model="aura-orion-en"),
    )

    # 4. Inject Memory and setup hooks
    if user_id:
        async with async_session() as session_db:
            memory = await load_memory(user_id, session_db)
            if memory:
                # Injecting directly as a system context message
                await session.chat_ctx.append(ChatMessage(role="system", text=f"PREVIOUS CONVERSATION SUMMARY: {memory}"))

    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        if isinstance(event.item, ChatMessage):
            assistant.record_message(event.item.role, event.item.text_content or "")

    await session.start(agent=assistant, room=ctx.room)
    await ctx.connect()
    
    # 5. Wait and Cleanup
    try:
        await ctx.wait_for_participant()
    finally:
        logger.info(f"Session ending. User: {user_id}, History: {len(assistant.conversation_history)}")
        if user_id and assistant.conversation_history:
            history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in assistant.conversation_history])
            summary = await summarize_conversation(history_text)
            async with async_session() as db_session:
                await save_summary(user_id, summary, db_session)
            logger.info("Summary saved successfully.")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
