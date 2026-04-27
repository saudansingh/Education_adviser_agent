async def entrypoint(ctx: JobContext):
    logger.info(f"Job received for room: {ctx.room.name}")
    
    # 1. Extract user_id
    user_id = None
    try:
        metadata = ctx.job.metadata
        if metadata:
            metadata_dict = json.loads(metadata) if isinstance(metadata, str) else metadata
            user_id = metadata_dict.get("user_id")
            if user_id is not None:
                user_id = int(user_id)
    except Exception as e:
        logger.error(f"Could not extract user_id from metadata: {e}")
        import traceback
        traceback.print_exc()
    
    # 2. Load memory (Now correctly indented inside entrypoint)
    memory_summary = None
    if user_id:
        print(f"DEBUG: Attempting to load memory for user_id={user_id}")
        async with async_session() as session:
            memory_summary = await load_memory(user_id, session)
        print(f"DEBUG: Loaded memory_summary: {memory_summary[:100] if memory_summary else 'None'}...")
    else:
        print("DEBUG: No user_id available, skipping memory load")
    
    # 3. Create assistant and session
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
    
    # 4. Handle context and shutdown
    user_context = ""
    participant = ctx.room.local_participant
    if participant and participant.metadata:
        try:
            metadata = json.loads(participant.metadata)
            user_context = f"\n\nUser Information: {metadata.get('email', 'Unknown')}"
        except:
            user_context = f"\n\nUser Information: {participant.metadata}"
    
    if user_context:
        assistant.instructions += user_context
    
    @ctx.add_shutdown_hook
    async def on_shutdown():
        print(f"DEBUG: Shutdown hook triggered. user_id={user_id}, history_size={len(assistant.conversation_history)}")
        await save_conversation_summary(user_id, assistant.conversation_history)
    
    await ctx.wait_for_participant()
