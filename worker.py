import asyncio
import os
from livekit.agents import WorkerOptions, cli
from agent import entrypoint  # Ensure this points to your entrypoint function

if __name__ == "__main__":
    # 1. Get the port Cloud Run wants (it defaults to 8080)
    port = int(os.environ.get("PORT", 8080))
    
    # 2. Start the LiveKit Agent Worker
    # We must bind to 0.0.0.0 so the "outside" Google probe can reach it
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint),
        host="0.0.0.0",
        port=port
    )
