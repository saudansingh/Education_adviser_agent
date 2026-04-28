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

Synthesize: If the user asks a new question, cross-reference it with the previous summary to provide advice that is consistent with their long-term learning journey."""

class Assistant(Agent):
    def __init__(self, memory_summary: str | None = None) -> None:
        instructions = INSTRUCTIONS
        if memory_summary:
            instructions = f"{INSTRUCTIONS}\n\nPREVIOUS CONVERSATION SUMMARY:\n{memory_summary}\n\nRemember to acknowledge this previous context naturally."
        
        super().__init__(instructions=instructions)
        self.conversation_history = []
        self.user_id = None
    
    def record_message(self, role: str, content: str):
        if content and content.strip():
            self.conversation_history.append({"role": role, "content": content})
            logger.info(f"History recorded: {role} - {content[:50]}...")

async def summarize_conversation(conversation_text: str) -> str:
    """Summarize conversation using GPT-4o-mini."""
    try:
        llm = openai.LLM(model="gpt-4o-mini")
        response = await llm.chat([
            {"role": "system", "content": "Summarize concisely. Focus on user goals, topics, and action items. Max 200 words."},
            {"role": "user", "content": conversation_text}
        ])
        return response.content
    except Exception as e:
        logger.error(f"Failed to summarize: {e}")
        return "Conversation summary unavailable"

async def entrypoint(ctx: JobContext):
    logger.info(f"Job received for room: {ctx.room.name}")
    
    # 1. Extract user_id from job metadata
    user_id = None
    try:
        metadata_dict = json.loads(ctx.job.metadata) if isinstance(ctx.job.metadata, str) else ctx.job.metadata
        user_id = metadata_dict.get("user_id")
    except Exception as e:
        logger.error(f"Error extracting metadata: {e}")

    # 2. Load existing memory
    memory_summary = None
    if user_id:
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)
            
    # 3. Initialize Assistant
    assistant = Assistant(memory_summary=memory_summary)
    assistant.user_id = user_id
    
    # 4. Setup Session
    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts=deepgram.TTS(model="aura-orion-en"),
    )

    # 5. Robust history tracking via event listener
    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        if isinstance(event.item, ChatMessage):
            assistant.record_message(event.item.role, event.item.text_content or "")

    await session.start(agent=assistant, room=ctx.room)
    await ctx.connect()
    
    # 6. Keep session alive and handle graceful cleanup
    try:
        await ctx.wait_for_participant()
    finally:
        logger.info(f"Session closing for user {user_id}. History length: {len(assistant.conversation_history)}")
        if user_id and assistant.conversation_history:
            try:
                history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in assistant.conversation_history])
                summary = await summarize_conversation(history_text)
                
                async with async_session() as db_session:
                    await save_summary(user_id, summary, db_session)
                logger.info("Summary saved successfully to DB.")
            except Exception as e:
                logger.error(f"Critical error during summary save: {e}")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
