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
from database import async_session, load_memory, save_summary

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


class Assistant(Agent):
    def __init__(self, memory_summary: str | None = None) -> None:
        instructions = INSTRUCTIONS
        if memory_summary:
            instructions = f"""{INSTRUCTIONS}

PREVIOUS CONVERSATION SUMMARY:
{memory_summary}

Remember to acknowledge this previous context naturally in your conversation."""
            logger.info(f"Agent initialized with memory summary: {memory_summary[:100] if memory_summary else 'None'}...")
        else:
            logger.info("Agent initialized WITHOUT memory summary")
        
        super().__init__(instructions=instructions)
        self.conversation_history = []
        self.user_id = None
        self.last_user_turn_time = None
    
    async def on_user_turn_completed(self, user_input, new_message=None):
        """Track conversation for summarization"""
        if hasattr(user_input, 'text'):
            text = user_input.text
        elif isinstance(user_input, str):
            text = user_input
        else:
            text = str(user_input)
        
        self.conversation_history.append({"role": "user", "content": text})
        self.last_user_turn_time = asyncio.get_event_loop().time()
        logger.info(f"User turn completed: {text[:50]}...")
        logger.info(f"Conversation history size: {len(self.conversation_history)}")


async def summarize_conversation(conversation_text: str) -> str:
    """Summarize conversation using GPT-4o-mini"""
    logger.info(f"summarize_conversation called with {len(conversation_text)} characters")
    try:
        llm = openai.LLM(model="gpt-4o-mini")
        response = await llm.chat([
            {
                "role": "system",
                "content": "Summarize the following conversation concisely. Focus on the user's goals, topics discussed, and any action items. Keep it under 200 words."
            },
            {
                "role": "user",
                "content": conversation_text
            }
        ])
        logger.info(f"Summary generated: {response.content[:100]}...")
        return response.content
    except Exception as e:
        logger.error(f"Failed to summarize conversation: {e}")
        return "Conversation summary unavailable"


async def save_on_disconnect(user_id: int, conversation_history: list):
    """Save summary when user disconnects"""
    logger.info(f"save_on_disconnect called. user_id={user_id}, history_size={len(conversation_history)}")
    if not user_id or not conversation_history:
        logger.warning("Skipping save - no user_id or empty history")
        return
    
    try:
        conversation_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in conversation_history])
        logger.info(f"Conversation text length: {len(conversation_text)}")
        summary = await summarize_conversation(conversation_text)
        async with async_session() as session:
            await save_summary(user_id, summary, session)
        logger.info("Summary saved successfully")
    except Exception as e:
        logger.error(f"Error in save_on_disconnect: {e}")


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
    
    # Register participant left callback
    @ctx.room.on("participant_left")
    def on_participant_left(participant):
        logger.info(f"Participant left: {participant.identity}")
        # Schedule async save with delay for conversation to complete
        asyncio.create_task(save_with_delay(user_id, assistant.conversation_history))
    
    # Keep agent running
    await ctx.wait_for_participant()


async def save_with_delay(user_id: int, conversation_history: list):
    """Wait for conversation to complete, then save"""
    logger.info("User disconnected. Waiting 2 seconds for conversation to complete...")
    await asyncio.sleep(2)
    await save_on_disconnect(user_id, conversation_history)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
