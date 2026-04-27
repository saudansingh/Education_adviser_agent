import logging
import os
import json
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
            print(f"DEBUG: Agent initialized with memory summary: {memory_summary[:100] if memory_summary else 'None'}...")
        else:
            print(f"DEBUG: Agent initialized WITHOUT memory summary")
        
        super().__init__(instructions=instructions)
        self.conversation_history = []
        self.user_id = None
    
    async def on_user_turn_completed(self, user_input, new_message=None):
        """Track conversation for summarization"""
        if hasattr(user_input, 'text'):
            text = user_input.text
        elif isinstance(user_input, str):
            text = user_input
        else:
            text = str(user_input)
        
        self.conversation_history.append({"role": "user", "content": text})
        logger.info(f"User turn completed: {text[:50]}...")
        print(f"DEBUG: Conversation history size: {len(self.conversation_history)}")


async def summarize_conversation(conversation_text: str) -> str:
    """Summarize conversation using GPT-4o-mini"""
    print(f"DEBUG: summarize_conversation called with {len(conversation_text)} characters")
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
        print(f"DEBUG: Summary generated: {response.content[:100]}...")
        return response.content
    except Exception as e:
        logger.error(f"Failed to summarize conversation: {e}")
        print(f"DEBUG: Failed to summarize conversation: {e}")
        return "Conversation summary unavailable"


async def save_conversation_summary(user_id: int, conversation_history: list):
    """Save conversation summary - called from shutdown handler"""
    print(f"DEBUG: save_conversation_summary called. user_id={user_id}, history_size={len(conversation_history)}")
    if not user_id or not conversation_history:
        print(f"DEBUG: Skipping save - no user_id or empty history")
        return
    
    try:
        conversation_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in conversation_history])
        print(f"DEBUG: Conversation text length: {len(conversation_text)}")
        summary = await summarize_conversation(conversation_text)
        print(f"DEBUG: About to save summary for user_id={user_id}")
        async with async_session() as session:
            await save_summary(user_id, summary, session)
        print(f"DEBUG: Summary save completed")
    except Exception as e:
        print(f"DEBUG: Error in save_conversation_summary: {e}")


async def entrypoint(ctx: JobContext):
    logger.info(f"Job received for room: {ctx.room.name}")
    
    # Extract user_id from metadata (JSON format from main.py)
    user_id = None
    try:
        metadata = ctx.job.metadata
        print(f"DEBUG: Raw metadata repr: {repr(metadata)}")
        print(f"DEBUG: Metadata type: {type(metadata)}")
        
        if metadata:
            metadata_dict = json.loads(metadata) if isinstance(metadata, str) else metadata
            print(f"DEBUG: Parsed metadata dict: {metadata_dict}")
            user_id = metadata_dict.get("user_id")
            print(f"DEBUG: Extracted user_id: {user_id}, type: {type(user_id)}")
            if user_id is not None:
                user_id = int(user_id)
                print(f"DEBUG: Converted user_id to int: {user_id}")
        else:
            print("DEBUG: Metadata is None or empty")
    except Exception as e:
        logger.error(f"Could not extract user_id from metadata: {e}")
        print(f"DEBUG: Error extracting user_id: {e}")
        import traceback
        traceback.print_exc()
    
    # Load memory if user_id is available
    memory_summary = None
    if user_id:
        print(f"DEBUG: Attempting to load memory for user_id={user_id}")
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)
        print(f"DEBUG: Loaded memory_summary: {memory_summary[:100] if memory_summary else 'None'}...")
    else:
        print("DEBUG: No user_id available, skipping memory load")
    
    # Create assistant with memory
    assistant = Assistant(memory_summary=memory_summary)
    assistant.user_id = user_id
    
    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts=deepgram.TTS(model="aura-orion-en"),
    )
    
    await session.start(
        agent=assistant,
        room=ctx.room,
    )

    await ctx.connect()
    
    # Extract user context from participant metadata after connecting
    user_context = ""
    participant = ctx.room.local_participant
    if participant and participant.metadata:
        try:
            metadata = json.loads(participant.metadata)
            user_context = f"\n\nUser Information: {metadata.get('email', 'Unknown')}"
        except:
            user_context = f"\n\nUser Information: {participant.metadata}"
    
    # Update agent instructions with user context if available
    if user_context:
        assistant.instructions += user_context
    
    print(f"DEBUG: Final agent instructions length: {len(assistant.instructions)}")
    
    # Register shutdown handler
    @ctx.add_shutdown_hook
    async def on_shutdown():
        print(f"DEBUG: Shutdown hook triggered. user_id={user_id}, history_size={len(assistant.conversation_history)}")
        await save_conversation_summary(user_id, assistant.conversation_history)
    
    # Keep the agent alive
    await ctx.wait_for_participant()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
