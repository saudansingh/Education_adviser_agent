import logging
import os
import asyncio
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram, openai, silero

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Ankur, a knowledgeable and encouraging Education Advisor AI assistant. Your name is Ankur and you specialize in educational guidance, career planning, and learning strategies.

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

Start conversations with "Hello! I'm Ankur, your education advisor specializing in learning strategies and career guidance. How can I help you achieve your educational goals today?" and maintain your encouraging, knowledgeable persona.""",
        )

async def entrypoint(ctx: JobContext):
    assistant = Assistant()
    
    session = AgentSession(
        stt="deepgram/nova-3",
        llm="openai/gpt-4o-mini",
        tts="deepgram",
    )
    
    await session.start(
        agent=assistant,
        room=ctx.room,
    )

    await ctx.connect()
    
    # Extract user context and chat history from participant metadata after connecting
    user_context = ""
    chat_context = ""
    participant = ctx.room.local_participant
    if participant and participant.metadata:
        try:
            import json
            metadata = json.loads(participant.metadata)
            user_context = f"\n\nUser Information: {metadata.get('email', 'Unknown')}"
            if metadata.get('chatHistory'):
                chat_context = f"\n\nPrevious Chat History:\n{metadata.get('chatHistory')}"
        except:
            user_context = f"\n\nUser Information: {participant.metadata}"
    
    # Update agent instructions with user context and chat history if available
    if user_context:
        assistant.instructions += user_context
    if chat_context:
        assistant.instructions += chat_context


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
