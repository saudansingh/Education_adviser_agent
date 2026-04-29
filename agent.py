import logging
import asyncio
from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli, Agent, ChatContext
from livekit.plugins import deepgram, openai, silero
from database import async_session, load_memory, upsert_session_summary, init_db

logger = logging.getLogger("agent")
load_dotenv(".env.local")

# Full Instructions
INSTRUCTIONS = """You are Ankur, a knowledgeable and encouraging Education Advisor..."""

class AnkurAssistant(Agent):
    def __init__(self, memory_summary: str | None = None, user_id: int | None = None):
        super().__init__()
        self.user_id = user_id
        # Initialize context directly
        self.chat_ctx = ChatContext()
        
        # Add memory if it exists
        if memory_summary:
            self.chat_ctx.append(role="system", text=f"PREVIOUS CONVERSATION SUMMARY:\n{memory_summary}")
        
        self.chat_ctx.append(role="system", text=INSTRUCTIONS)

    async def save_session(self):
        if not self.user_id or not self.chat_ctx.messages:
            return
        conversation_text = "\n".join([f"{msg.role}: {msg.content}" for msg in self.chat_ctx.messages])
        await upsert_session_summary(self.user_id, conversation_text)
        logger.info(f"Saved session for user {self.user_id}")

async def entrypoint(ctx: JobContext):
    await init_db()
    
    # 1. Extract User ID
    user_id = None
    try:
        room_name = ctx.room.name
        user_id = int(room_name.split("-")[1])
    except:
        logger.error("Could not extract user_id")

    # 2. Load Memory
    memory_summary = None
    if user_id:
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)

    # 3. Create Assistant
    assistant = AnkurAssistant(memory_summary=memory_summary, user_id=user_id)
    
    # Manually configure plugins (The stable, version-agnostic way)
    assistant.stt = deepgram.STT()
    assistant.llm = openai.LLM(model="gpt-4o-mini")
    assistant.tts = deepgram.TTS()
    assistant.vad = silero.VAD.load()

    # 4. Start the agent
    assistant.start(ctx.room)
    
    @ctx.room.on("participant_disconnected")
    def on_disconnect(participant):
        asyncio.create_task(assistant.save_session())

    await ctx.wait_for_participant()

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
